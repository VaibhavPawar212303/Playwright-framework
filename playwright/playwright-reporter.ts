import { Reporter, FullConfig, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import axios from 'axios';

class MyReporter implements Reporter {
    // 1. Initialize as null or 0
    private buildId: number | null = null;

    async onBegin(config: FullConfig, suite: Suite) {
        try {
            // 2. Call API to generate ID in the DB
            const response = await axios.post('http://localhost:3000/api/automation/build', {
                environment: 'dev' // Don't send an ID here
            });

            // 3. Store the ID returned by the database
            this.buildId = response.data.id;
            console.log(`🚀 Build session started in DB with ID: ${this.buildId}`);
        } catch (e: any) {
            console.error(`❌ Failed to generate build in DB: ${e.message}`);
        }
    }

    async onTestEnd(test: TestCase, result: TestResult) {
        // 4. Ensure we have a buildId before sending results
        if (this.buildId === null) return;

        const suites: string[] = [];
        let p = test.parent;
        while (p && p.title) {
            suites.unshift(p.title);
            //@ts-ignore
            p = p.parent;
        }

        const payload = {
            build_id: this.buildId, // Using the DB generated ID
            spec_file: test.location.file.split('/').pop(),
            test_entry: {
                suites: suites,
                case_code: test.title.match(/TC\d+/)?.[0] || "N/A",
                title: test.title,
                status: result.status === 'passed' ? 'passed' : 'failed',
                duration: `${(result.duration / 1000).toFixed(2)}s`,
                error: result.error?.message || null
            }
        };

        try {
            await axios.post('http://localhost:3000/api/automation/result', payload);
        } catch (e) {
            // Silent catch
        }
    }
}

export default MyReporter;