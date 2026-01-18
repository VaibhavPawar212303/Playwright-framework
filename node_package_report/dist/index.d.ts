import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
interface ReporterOptions {
    verbose?: boolean;
    slowTestThreshold?: number;
    logFile?: string;
    webhookUrl?: string;
    outputDir?: string;
    liveServerPort?: number;
}
declare class PlayWithAIReporter implements Reporter {
    private verbose;
    private slowTestThreshold;
    private logFile;
    private webhookUrl?;
    private outputDir;
    private liveServerPort;
    private passed;
    private failed;
    private skipped;
    private timedOut;
    private flaky;
    private totalDuration;
    private startTime;
    private totalTestsExpected;
    private slowTests;
    private failedTests;
    private allTestRecords;
    private server;
    private clients;
    constructor(options?: ReporterOptions);
    private print;
    private startLiveServer;
    private notifyClients;
    onBegin(config: FullConfig, suite: Suite): void;
    onTestBegin(test: TestCase): void;
    onTestEnd(test: TestCase, result: TestResult): Promise<void>;
    onEnd(result: FullResult): Promise<void>;
    private getStats;
    private generateMarkdown;
    private sendWebhook;
    private getHtmlTemplate;
}
export default PlayWithAIReporter;
