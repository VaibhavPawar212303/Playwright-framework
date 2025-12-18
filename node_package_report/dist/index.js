"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
class MyCustomReporter {
    constructor(options = {}) {
        this.passed = 0;
        this.failed = 0;
        this.skipped = 0;
        this.timedOut = 0;
        this.totalDuration = 0;
        this.verbose = options.verbose || false;
        if (this.verbose)
            console.log(`${colors.cyan}ℹ Reporter setup (Verbose: true)${colors.reset}`);
    }
    onBegin(config, suite) {
        var _a;
        const workers = config.workers;
        // FIX 1: Access headless state via the first project's config
        // We use optional chaining (?.) and default to true (standard Playwright behavior)
        const isHeadless = ((_a = config.projects[0]) === null || _a === void 0 ? void 0 : _a.use.headless) !== false;
        const mode = isHeadless ? 'Headless' : 'Headed';
        console.log(`\n${colors.bright}🚀 Starting Test Run${colors.reset}`);
        console.log(`${colors.dim}--------------------------------------------------${colors.reset}`);
        console.log(`${colors.cyan}Configuration:${colors.reset}`);
        console.log(`  • Mode:    ${colors.yellow}${mode}${colors.reset}`);
        console.log(`  • Workers: ${colors.yellow}${workers}${colors.reset}`);
        console.log(`  • Tests:   ${suite.allTests().length}`);
        console.log(`${colors.dim}--------------------------------------------------${colors.reset}`);
    }
    onTestBegin(test) {
        var _a;
        if (this.verbose) {
            const browser = ((_a = test.parent.project()) === null || _a === void 0 ? void 0 : _a.name) || 'unknown';
            console.log(`${colors.dim}  ▶ Starting: [${browser}] ${test.title}${colors.reset}`);
        }
    }
    onTestEnd(test, result) {
        var _a;
        this.totalDuration += result.duration;
        const browser = ((_a = test.parent.project()) === null || _a === void 0 ? void 0 : _a.name) || 'unknown';
        const browserTag = `${colors.magenta}[${browser}]${colors.reset}`;
        if (result.status === 'passed') {
            this.passed++;
            console.log(`${colors.green}  ✔ ${browserTag} ${test.title} (${result.duration}ms)${colors.reset}`);
        }
        else if (result.status === 'failed') {
            this.failed++;
            console.log(`${colors.red}  ✘ ${browserTag} ${test.title}${colors.reset}`);
            // FIX 2: Safely access the error message
            if (result.error) {
                const errorMessage = result.error.message || result.error.stack || 'Unknown Error';
                console.log(`${colors.red}    Error: ${errorMessage.split('\n')[0]}${colors.reset}`);
            }
        }
        else if (result.status === 'skipped') {
            this.skipped++;
            console.log(`${colors.yellow}  ⚠ ${browserTag} ${test.title} (Skipped)${colors.reset}`);
        }
        else if (result.status === 'timedOut') {
            this.timedOut++;
            console.log(`${colors.red}  ⏰ ${browserTag} ${test.title} (Timed Out)${colors.reset}`);
        }
    }
    onEnd(result) {
        const durationSec = (this.totalDuration / 1000).toFixed(2);
        console.log(`\n${colors.dim}--------------------------------------------------${colors.reset}`);
        console.log(`${colors.bright}🏁 Test Run Finished: ${result.status.toUpperCase()}${colors.reset}`);
        console.log(`${colors.dim}--------------------------------------------------${colors.reset}`);
        console.log(`  ${colors.cyan}Total Tests:${colors.reset}  ${this.passed + this.failed + this.skipped + this.timedOut}`);
        console.log(`  ${colors.green}Passed:${colors.reset}       ${this.passed}`);
        console.log(`  ${colors.red}Failed:${colors.reset}       ${this.failed}`);
        console.log(`  ${colors.yellow}Skipped:${colors.reset}      ${this.skipped}`);
        console.log(`  ${colors.dim}Duration:${colors.reset}     ${durationSec}s`);
        console.log(`${colors.dim}--------------------------------------------------${colors.reset}\n`);
    }
}
exports.default = MyCustomReporter;
