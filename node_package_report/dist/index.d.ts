import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
declare class MyCustomReporter implements Reporter {
    constructor(options?: {
        customOption?: string;
    });
    onBegin(config: FullConfig, suite: Suite): void;
    onTestBegin(test: TestCase, result: TestResult): void;
    onTestEnd(test: TestCase, result: TestResult): void;
    onEnd(result: FullResult): void;
}
export default MyCustomReporter;
