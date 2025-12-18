"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
class MyCustomReporter {
    constructor(options = {}) {
        this.passed = 0;
        this.failed = 0;
        this.skipped = 0;
        this.timedOut = 0;
        this.flaky = 0;
        this.totalDuration = 0;
        this.slowTests = [];
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
                if (this.verbose)
                    console.log(`${colors.cyan}ℹ Created directory: ${logDir}${colors.reset}`);
            }
            catch (err) {
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
    print(message) {
        console.log(message);
        const cleanMessage = message.replace(ansiRegex, '');
        fs.appendFileSync(this.logFile, cleanMessage + '\n');
    }
    onBegin(config, suite) {
        var _a, _b;
        const workers = config.workers;
        const isHeadless = ((_a = config.projects[0]) === null || _a === void 0 ? void 0 : _a.use.headless) !== false;
        const mode = isHeadless ? 'Headless' : 'Headed';
        const retries = ((_b = config.projects[0]) === null || _b === void 0 ? void 0 : _b.retries) || 0;
        this.print(`\n${colors.bright}🚀 Starting Test Run${colors.reset}`);
        this.print(`${colors.dim}--------------------------------------------------${colors.reset}`);
        this.print(`  • Mode:    ${colors.yellow}${mode}${colors.reset}`);
        this.print(`  • Workers: ${colors.yellow}${workers}${colors.reset}`);
        this.print(`  • Retries: ${colors.yellow}${retries}${colors.reset}`);
        this.print(`  • Tests:   ${suite.allTests().length}`);
        this.print(`${colors.dim}--------------------------------------------------${colors.reset}`);
    }
    onTestBegin(test) {
        var _a;
        if (this.verbose) {
            const browser = ((_a = test.parent.project()) === null || _a === void 0 ? void 0 : _a.name) || 'unknown';
            this.print(`${colors.dim}  ▶ Starting: [${browser}] ${test.title}${colors.reset}`);
        }
    }
    onTestEnd(test, result) {
        var _a;
        this.totalDuration += result.duration;
        const browser = ((_a = test.parent.project()) === null || _a === void 0 ? void 0 : _a.name) || 'unknown';
        const browserTag = `${colors.magenta}[${browser}]${colors.reset}`;
        const isSlow = result.duration > this.slowTestThreshold;
        if (isSlow && result.status === 'passed') {
            this.slowTests.push({ title: test.title, duration: result.duration, browser });
        }
        if (result.status === 'passed') {
            if (result.retry > 0) {
                this.flaky++;
                this.print(`${colors.yellow}  ⚠️  ${browserTag} ${test.title} (FLAKY - Passed on retry #${result.retry})${colors.reset}`);
            }
            else {
                this.passed++;
                const symbol = isSlow ? `${colors.yellow}✔ [SLOW]${colors.reset}` : `${colors.green}✔${colors.reset}`;
                this.print(`  ${symbol} ${browserTag} ${test.title} (${result.duration}ms)`);
            }
        }
        else if (result.status === 'failed') {
            if (result.retry < test.retries) {
                this.print(`${colors.dim}  ✘ ${browserTag} ${test.title} (Attempt ${result.retry + 1} failed, retrying...)${colors.reset}`);
            }
            else {
                this.failed++;
                this.print(`${colors.red}  ✘ ${browserTag} ${test.title}${colors.reset}`);
            }
            if (result.error) {
                const errorMessage = result.error.message || result.error.stack || 'Unknown Error';
                this.print(`${colors.red}    Error: ${errorMessage.split('\n')[0]}${colors.reset}`);
            }
        }
        else if (result.status === 'skipped') {
            this.skipped++;
            this.print(`${colors.yellow}  ⚠ ${browserTag} ${test.title} (Skipped)${colors.reset}`);
        }
        else if (result.status === 'timedOut') {
            this.timedOut++;
            this.print(`${colors.red}  ⏰ ${browserTag} ${test.title} (Timed Out)${colors.reset}`);
        }
    }
    onEnd(result) {
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
exports.default = MyCustomReporter;
