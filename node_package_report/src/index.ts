import type {Reporter,FullConfig,Suite,TestCase,TestResult,FullResult,} from '@playwright/test/reporter';

class MyCustomReporter implements Reporter {
  // Optional: Allow users to pass options in playwright.config.ts
  constructor(options: { customOption?: string } = {}) {
    console.log(`Reporter setup with option: ${options.customOption}`);
  }

  onBegin(config: FullConfig, suite: Suite) {
    console.log(`Starting the run with ${suite.allTests().length} tests`);
  }

  onTestBegin(test: TestCase, result: TestResult) {
    console.log(`Starting test: ${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    console.log(`Finished test: ${test.title} - Status: ${result.status}`);
  }

  onEnd(result: FullResult) {
    console.log(`Finished the run: ${result.status}`);
  }
}

export default MyCustomReporter;