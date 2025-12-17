"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class MyCustomReporter {
    // Optional: Allow users to pass options in playwright.config.ts
    constructor(options = {}) {
        console.log(`Reporter setup with option: ${options.customOption}`);
    }
    onBegin(config, suite) {
        console.log(`Starting the run with ${suite.allTests().length} tests`);
    }
    onTestBegin(test, result) {
        console.log(`Starting test: ${test.title}`);
    }
    onTestEnd(test, result) {
        console.log(`Finished test: ${test.title} - Status: ${result.status}`);
    }
    onEnd(result) {
        console.log(`Finished the run: ${result.status}`);
    }
}
exports.default = MyCustomReporter;
