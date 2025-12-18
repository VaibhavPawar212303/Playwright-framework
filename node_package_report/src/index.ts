import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

// Regex to remove ANSI color codes for the text file
const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

interface ReporterOptions {
  verbose?: boolean;
  slowTestThreshold?: number;
  logFile?: string;
}

class MyCustomReporter implements Reporter {
  private passed = 0;
  private failed = 0;
  private skipped = 0;
  private timedOut = 0;
  private flaky = 0;
  private totalDuration = 0;
  private verbose: boolean;
  private slowTestThreshold: number;
  private logFile: string;
  private slowTests: { title: string; duration: number; browser: string }[] = [];

  constructor(options: ReporterOptions = {}) {
    this.verbose = options.verbose || false;
    this.slowTestThreshold = options.slowTestThreshold || 5000;
    
    // --- CHANGE: Default to 'playwithAireporter/execution-log.txt' ---
    this.logFile = options.logFile || 'playwithAireporter/execution-log.txt';

    // 1. Get the folder path (e.g., "playwithAireporter")
    const logDir = path.dirname(this.logFile);

    // 2. Create the folder if it doesn't exist
    if (logDir !== '.' && !fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
        if(this.verbose) console.log(`${colors.cyan}ℹ Created directory: ${logDir}${colors.reset}`);
      } catch (err) {
        console.error(`${colors.red}✘ Failed to create directory ${logDir}: ${err}${colors.reset}`);
      }
    }

    // 3. Create/Overwrite the file with a Header
    const header = `Test Run Started: ${new Date().toLocaleString()}\n` +
                   `==================================================\n`;
    fs.writeFileSync(this.logFile, header);

    if (this.verbose) {
      this.print(`${colors.cyan}ℹ Reporter setup (Log: ${this.logFile})${colors.reset}`);
    }
  }

  // Helper to print to Console AND write to File
  private print(message: string) {
    console.log(message);
    const cleanMessage = message.replace(ansiRegex, '');
    fs.appendFileSync(this.logFile, cleanMessage + '\n');
  }

  onBegin(config: FullConfig, suite: Suite) {
    const workers = config.workers;
    const isHeadless = config.projects[0]?.use.headless !== false;
    const mode = isHeadless ? 'Headless' : 'Headed';
    const retries = config.projects[0]?.retries || 0;

    this.print(`\n${colors.bright}🚀 Starting Test Run${colors.reset}`);
    this.print(`${colors.dim}--------------------------------------------------${colors.reset}`);
    this.print(`  • Mode:    ${colors.yellow}${mode}${colors.reset}`);
    this.print(`  • Workers: ${colors.yellow}${workers}${colors.reset}`);
    this.print(`  • Retries: ${colors.yellow}${retries}${colors.reset}`);
    this.print(`  • Tests:   ${suite.allTests().length}`);
    this.print(`${colors.dim}--------------------------------------------------${colors.reset}`);
  }

  onTestBegin(test: TestCase) {
    if (this.verbose) {
      const browser = test.parent.project()?.name || 'unknown';
      this.print(`${colors.dim}  ▶ Starting: [${browser}] ${test.title}${colors.reset}`);
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.totalDuration += result.duration;

    const browser = test.parent.project()?.name || 'unknown';
    const browserTag = `${colors.magenta}[${browser}]${colors.reset}`;
    
    const isSlow = result.duration > this.slowTestThreshold;
    if (isSlow && result.status === 'passed') {
        this.slowTests.push({ title: test.title, duration: result.duration, browser });
    }

    if (result.status === 'passed') {
      if (result.retry > 0) {
        this.flaky++;
        this.print(`${colors.yellow}  ⚠️  ${browserTag} ${test.title} (FLAKY - Passed on retry #${result.retry})${colors.reset}`);
      } else {
        this.passed++;
        const symbol = isSlow ? `${colors.yellow}✔ [SLOW]${colors.reset}` : `${colors.green}✔${colors.reset}`;
        this.print(`  ${symbol} ${browserTag} ${test.title} (${result.duration}ms)`);
      }

    } else if (result.status === 'failed') {
      if (result.retry < test.retries) {
         this.print(`${colors.dim}  ✘ ${browserTag} ${test.title} (Attempt ${result.retry + 1} failed, retrying...)${colors.reset}`);
      } else {
         this.failed++;
         this.print(`${colors.red}  ✘ ${browserTag} ${test.title}${colors.reset}`);
      }
      
      if (result.error) {
        const errorMessage = result.error.message || result.error.stack || 'Unknown Error';
        this.print(`${colors.red}    Error: ${errorMessage.split('\n')[0]}${colors.reset}`);
      }

    } else if (result.status === 'skipped') {
      this.skipped++;
      this.print(`${colors.yellow}  ⚠ ${browserTag} ${test.title} (Skipped)${colors.reset}`);
    } else if (result.status === 'timedOut') {
      this.timedOut++;
      this.print(`${colors.red}  ⏰ ${browserTag} ${test.title} (Timed Out)${colors.reset}`);
    }
  }

  onEnd(result: FullResult) {
    const durationSec = (this.totalDuration / 1000).toFixed(2);

    this.print(`\n${colors.dim}--------------------------------------------------${colors.reset}`);
    this.print(`${colors.bright}🏁 Test Run Finished: ${result.status.toUpperCase()}${colors.reset}`);
    this.print(`${colors.dim}--------------------------------------------------${colors.reset}`);

    if (this.slowTests.length > 0) {
        this.print(`${colors.yellow}🐢 Slowest Tests (> ${this.slowTestThreshold}ms):${colors.reset}`);
        this.slowTests
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 5) 
            .forEach((t) => {
                this.print(`  • ${t.duration}ms - [${t.browser}] ${t.title}`);
            });
        this.print(`${colors.dim}--------------------------------------------------${colors.reset}`);
    }

    this.print(`  ${colors.cyan}Total Tests:${colors.reset}  ${this.passed + this.failed + this.skipped + this.timedOut + this.flaky}`);
    this.print(`  ${colors.green}Passed:${colors.reset}       ${this.passed}`);
    this.print(`  ${colors.yellow}Flaky:${colors.reset}        ${this.flaky}`);
    this.print(`  ${colors.red}Failed:${colors.reset}       ${this.failed}`);
    this.print(`  ${colors.yellow}Skipped:${colors.reset}      ${this.skipped}`);
    this.print(`  ${colors.dim}Duration:${colors.reset}     ${durationSec}s`);
    this.print(`${colors.dim}--------------------------------------------------${colors.reset}\n`);
    
    this.print(`${colors.cyan}📝 Logs saved to: ${this.logFile}${colors.reset}\n`);
  }
}

export default MyCustomReporter;