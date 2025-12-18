import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
interface ReporterOptions {
    verbose?: boolean;
    slowTestThreshold?: number;
    logFile?: string;
}
declare class MyCustomReporter implements Reporter {
    private passed;
    private failed;
    private skipped;
    private timedOut;
    private flaky;
    private totalDuration;
    private verbose;
    private slowTestThreshold;
    private logFile;
    private slowTests;
    constructor(options?: ReporterOptions);
    private print;
    onBegin(config: FullConfig, suite: Suite): void;
    onTestBegin(test: TestCase): void;
    onTestEnd(test: TestCase, result: TestResult): void;
    onEnd(result: FullResult): void;
}
export default MyCustomReporter;
