import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
declare class MyCustomReporter implements Reporter {
    private passed;
    private failed;
    private skipped;
    private timedOut;
    private totalDuration;
    private verbose;
    constructor(options?: {
        verbose?: boolean;
    });
    onBegin(config: FullConfig, suite: Suite): void;
    onTestBegin(test: TestCase): void;
    onTestEnd(test: TestCase, result: TestResult): void;
    onEnd(result: FullResult): void;
}
export default MyCustomReporter;
