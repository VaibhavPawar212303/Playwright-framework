import { Reporter, FullConfig, Suite, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';

/**
 * 🔥 FIX: Sanitize string for use in HTTP headers
 * HTTP headers only allow ASCII characters (0x20-0x7E)
 * This fixes the "Invalid character in header content" error
 */
const sanitizeHeaderValue = (value: string): string => {
  if (!value) return '';
  return value
    .replace(/[^\x20-\x7E]/g, '-')  // Replace non-ASCII with dash (e.g., em dash — becomes -)
    .replace(/-+/g, '-')             // Collapse multiple dashes
    .replace(/^-|-$/g, '')           // Trim leading/trailing dashes
    .trim();
};

// 🔥 PROJECT & TEST TRACKING LAYER
class ProjectAndTestTracker {
  private projectsMap = new Map<string, {
    name: string;
    tests: Map<string, {
      title: string;
      status: string;
      retries: number;
      finalResult: string;
    }>;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
  }>();

  registerTestInProject(projectName: string, testTitle: string): void {
    if (!this.projectsMap.has(projectName)) {
      this.projectsMap.set(projectName, {
        name: projectName,
        tests: new Map(),
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0
      });
    }

    const project = this.projectsMap.get(projectName)!;
    if (!project.tests.has(testTitle)) {
      project.tests.set(testTitle, {
        title: testTitle,
        status: 'running',
        retries: 0,
        finalResult: 'pending'
      });
      project.totalTests++;
    }
  }

  updateTestResult(projectName: string, testTitle: string, finalStatus: string, retryCount: number): void {
    const project = this.projectsMap.get(projectName);
    if (!project) return;

    const test = project.tests.get(testTitle);
    if (!test) return;

    if (test.finalResult === 'pending' || test.finalResult === 'running') {
      test.status = finalStatus;
      test.retries = retryCount;
      test.finalResult = finalStatus;

      if (finalStatus === 'passed') {
        project.passedTests++;
      } else if (finalStatus === 'failed') {
        project.failedTests++;
      } else if (finalStatus === 'skipped') {
        project.skippedTests++;
      }
    }
  }

  getProjectsSummary(): any {
    const summary: any = {
      totalProjects: this.projectsMap.size,
      projects: {}
    };

    for (const [projectName, projectData] of this.projectsMap.entries()) {
      summary.projects[projectName] = {
        name: projectData.name,
        totalTests: projectData.totalTests,
        passedTests: projectData.passedTests,
        failedTests: projectData.failedTests,
        skippedTests: projectData.skippedTests,
        tests: Array.from(projectData.tests.values()).map(test => ({
          title: test.title,
          status: test.status,
          finalResult: test.finalResult,
          retries: test.retries
        }))
      };
    }

    return summary;
  }

  logProjectSummary(): void {
    const summary = this.getProjectsSummary();

    console.log('\n' + '='.repeat(100));
    console.log('📊 PROJECT & TEST EXECUTION SUMMARY');
    console.log('='.repeat(100));
    console.log(`\n🔍 Total Projects: ${summary.totalProjects}\n`);

    for (const [projectName, projectData] of Object.entries(summary.projects)) {
      const project = projectData as any;
      const passRate = project.totalTests > 0 
        ? ((project.passedTests / project.totalTests) * 100).toFixed(2)
        : 0;

      console.log(`\n📱 PROJECT: ${projectName}`);
      console.log(`   ├─ Total Tests: ${project.totalTests}`);
      console.log(`   ├─ ✅ Passed: ${project.passedTests}`);
      console.log(`   ├─ ❌ Failed: ${project.failedTests}`);
      console.log(`   ├─ ⏭️  Skipped: ${project.skippedTests}`);
      console.log(`   └─ 📈 Pass Rate: ${passRate}%`);

      if (project.tests.length > 0) {
        console.log(`\n   📋 Tests in ${projectName}:`);
        project.tests.forEach((test: any, index: number) => {
          const statusIcon = 
            test.finalResult === 'passed' ? '✅' :
            test.finalResult === 'failed' ? '❌' :
            test.finalResult === 'skipped' ? '⏭️' : '⏳';
          
          const retryInfo = test.retries > 0 ? ` [Retried: ${test.retries}x]` : '';
          console.log(`      ${index + 1}. ${statusIcon} ${test.title}${retryInfo}`);
        });
      }
    }

    console.log('\n' + '='.repeat(100) + '\n');
  }

  saveProjectSummaryToFile(outputPath: string = 'project-summary.json'): void {
    try {
      const summary = this.getProjectsSummary();
      fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
      console.log(`\n💾 Project summary saved to: ${outputPath}`);
    } catch (e: any) {
      console.error(`Failed to save project summary: ${e.message}`);
    }
  }
}

// 🔥 DEBUG LAYER
class DebugPayloadLogger {
  private payloadHistory: Array<{
    testId: string;
    uniqueKey: string;
    testTitle: string;
    timestamp: string;
    status: string;
    reason: string;
    payload: any;
    validation?: any;
  }> = [];

  logPayloadBefore(testId: string, uniqueKey: string, payload: TestPayload, reason: string): void {
    const entry = {
      testId,
      uniqueKey,
      testTitle: payload.test_title,
      timestamp: new Date().toISOString(),
      status: payload.test_entry.status,
      reason,
      payload: JSON.parse(JSON.stringify(payload))
    };
    this.payloadHistory.push(entry);

    console.log(`\n🔍 [DEBUG] PAYLOAD BEFORE SEND - ${uniqueKey}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Test Title: ${payload.test_title}`);
    console.log(`   Status: ${payload.test_entry.status}`);
    console.log(`   Is Final: ${payload.test_entry.is_final}`);
    console.log(`   Build ID: ${payload.build_id}`);
    console.log(`   Worker ID: ${payload.test_entry.worker_id}`);
    console.log(`   Duration: ${payload.test_entry.duration_ms}ms`);
    console.log(`   Steps Count: ${payload.test_entry.steps?.length || 0}`);
    console.log(`   Has Video: ${payload.test_entry.attachments?.has_video || false}`);
    console.log(`   Has Error: ${!!payload.test_entry.error}`);
  }

  logPayloadAfterSync(testId: string, uniqueKey: string, syncResult: any, payload: TestPayload): void {
    const entry = this.payloadHistory.find(p => p.uniqueKey === uniqueKey && p.payload.test_entry.status === payload.test_entry.status);
    if (entry) {
      entry.validation = syncResult;
    }

    console.log(`\n✅ [DEBUG] PAYLOAD AFTER SYNC - ${uniqueKey}`);
    console.log(`   Success: ${syncResult.success}`);
    console.log(`   Retries: ${syncResult.retries}`);
    if (!syncResult.success) {
      console.log(`   Error: ${syncResult.error}`);
    }
  }

  generateDebugReport(): any {
    const report = {
      totalPayloadsTracked: this.payloadHistory.length,
      byStatus: {
        passed: this.payloadHistory.filter(p => p.status === 'passed').length,
        failed: this.payloadHistory.filter(p => p.status === 'failed').length,
        skipped: this.payloadHistory.filter(p => p.status === 'skipped').length,
        running: this.payloadHistory.filter(p => p.status === 'running').length
      },
      syncedSuccessfully: this.payloadHistory.filter(p => p.validation?.success).length,
      syncFailed: this.payloadHistory.filter(p => p.validation && !p.validation.success).length,
      notYetSynced: this.payloadHistory.filter(p => !p.validation).length,
      payloadHistory: this.payloadHistory
    };
    return report;
  }

  logDebugReport(): void {
    const report = this.generateDebugReport();
    
    console.log('\n\n' + '='.repeat(80));
    console.log('🔍 COMPREHENSIVE DEBUG REPORT');
    console.log('='.repeat(80));
    
    console.log('\n📊 PAYLOAD TRACKING SUMMARY:');
    console.log(`   Total Payloads Tracked: ${report.totalPayloadsTracked}`);
    console.log(`   By Status:`);
    console.log(`      ✅ Passed: ${report.byStatus.passed}`);
    console.log(`      ❌ Failed: ${report.byStatus.failed}`);
    console.log(`      ⏭️  Skipped: ${report.byStatus.skipped}`);
    console.log(`      ⏳ Running: ${report.byStatus.running}`);
    
    console.log(`\n🔄 SYNC STATUS:`);
    console.log(`   Successfully Synced: ${report.syncedSuccessfully}`);
    console.log(`   Sync Failed: ${report.syncFailed}`);
    console.log(`   Not Yet Synced: ${report.notYetSynced}`);
    
    console.log(`\n📋 DETAILED PAYLOAD HISTORY:`);
    report.payloadHistory.forEach((entry: any, index: number) => {
      console.log(`\n   [${index + 1}] ${entry.testTitle}`);
      console.log(`       UniqueKey: ${entry.uniqueKey}`);
      console.log(`       Status: ${entry.status}`);
      console.log(`       Reason: ${entry.reason}`);
      console.log(`       Sent At: ${entry.timestamp}`);
      if (entry.validation) {
        console.log(`       Sync Result: ${entry.validation.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
        if (entry.validation.retries > 0) {
          console.log(`       Retries: ${entry.validation.retries}`);
        }
      } else {
        console.log(`       Sync Result: PENDING ⏳`);
      }
    });
    
    console.log('\n' + '='.repeat(80) + '\n');
  }

  saveDebugReportToFile(outputPath: string = 'debug-payload-report.json'): void {
    try {
      const report = this.generateDebugReport();
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(`\n💾 Debug report saved to: ${outputPath}`);
    } catch (e: any) {
      console.error(`Failed to save debug report: ${e.message}`);
    }
  }
}

class TestDataValidator {
  private static VALID_STATUSES = ['passed', 'failed', 'skipped'];

  static validateTestPayload(payload: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!payload.build_id || typeof payload.build_id !== 'number') errors.push('build_id must be a number');
    if (!payload.test_id || typeof payload.test_id !== 'string') errors.push('test_id must be a string');
    if (!payload.test_title || typeof payload.test_title !== 'string') errors.push('test_title must be a string');
    if (!payload.project || typeof payload.project !== 'string') errors.push('project must be a string');
    if (!payload.test_entry) errors.push('test_entry is required');

    if (payload.test_entry) {
      if (!payload.test_entry.title) errors.push('test_entry.title is required');
      if (!payload.test_entry.status) errors.push('test_entry.status is required');
      if (typeof payload.test_entry.duration_ms !== 'number') errors.push('test_entry.duration_ms must be a number');
      
      if (!this.VALID_STATUSES.includes(payload.test_entry.status) && payload.test_entry.status !== 'running') {
        errors.push(`test_entry.status must be one of: ${this.VALID_STATUSES.join(', ')} - received: ${payload.test_entry.status}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  static validateAndNormalizeStatus(status: string): string {
    const normalizedStatus = status?.toLowerCase().trim();
    
    if (this.VALID_STATUSES.includes(normalizedStatus)) {
      return normalizedStatus;
    }

    const statusMap: { [key: string]: string } = {
      'passed': 'passed',
      'failed': 'failed',
      'skipped': 'skipped',
      'timedout': 'failed',
      'interrupted': 'failed',
      'expected': 'passed'
    };

    const mappedStatus = statusMap[normalizedStatus];
    if (mappedStatus) {
      return mappedStatus;
    }

    console.warn(`⚠️  Unknown status "${status}" - defaulting to "failed"`);
    return 'failed';
  }

  static logValidationResult(payload: any, result: { valid: boolean; errors: string[] }): boolean {
    if (!result.valid) {
      console.error(`❌ VALIDATION FAILED for test "${payload.test_title}"`);
      result.errors.forEach((err: string) => console.error(`   - ${err}`));
      return false;
    }
    console.log(`✅ VALIDATION PASSED: ${payload.project} > ${payload.test_title} (Status: ${payload.test_entry.status})`);
    return true;
  }
}

// 🔥 STEP ANALYSIS LAYER
class StepAnalyzer {
  static analyzeSteps(steps: StepData[]): {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    derivedStatus: string;
    stepSummary: string;
  } {
    if (!steps || steps.length === 0) {
      return {
        totalSteps: 0,
        passedSteps: 0,
        failedSteps: 0,
        derivedStatus: 'unknown',
        stepSummary: 'No steps recorded'
      };
    }

    let passedSteps = 0;
    let failedSteps = 0;

    const countSteps = (stepList: StepData[]): void => {
      for (const step of stepList) {
        if (step.status === 'passed') {
          passedSteps++;
        } else if (step.status === 'failed') {
          failedSteps++;
        }
        if (step.steps && step.steps.length > 0) {
          countSteps(step.steps);
        }
      }
    };

    countSteps(steps);

    const totalSteps = passedSteps + failedSteps;
    const derivedStatus = failedSteps > 0 ? 'failed' : 'passed';

    const stepSummary = `${passedSteps}/${totalSteps} steps passed`;

    return {
      totalSteps,
      passedSteps,
      failedSteps,
      derivedStatus,
      stepSummary
    };
  }

  static logStepAnalysis(testTitle: string, analysis: any): void {
    console.log(`📊 [STEP ANALYSIS] ${testTitle}:`);
    console.log(`   Total Steps: ${analysis.totalSteps}`);
    console.log(`   Passed: ${analysis.passedSteps} ✅`);
    console.log(`   Failed: ${analysis.failedSteps} ❌`);
    console.log(`   Derived Status: ${analysis.derivedStatus.toUpperCase()}`);
    console.log(`   Summary: ${analysis.stepSummary}`);
  }
}

// 🔥 DATA INTEGRITY LAYER
class DataIntegrityValidator {
  private static readonly REQUIRED_FIELDS = {
    payload: ['build_id', 'test_id', 'test_title', 'project', 'session_id', 'test_entry', 'updated_at'],
    test_entry: ['title', 'status', 'duration_ms', 'file', 'project', 'worker_id', 'parallel_index'],
    step: ['title', 'category', 'duration_ms', 'status', 'startTime']
  };

  static validatePayloadIntegrity(payload: any): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const field of this.REQUIRED_FIELDS.payload) {
      if (payload[field] === undefined || payload[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    if (payload.test_entry) {
      for (const field of this.REQUIRED_FIELDS.test_entry) {
        if (payload.test_entry[field] === undefined || payload.test_entry[field] === null) {
          errors.push(`Missing required test_entry field: ${field}`);
        }
      }

      if (payload.test_entry.status && !['passed', 'failed', 'skipped', 'running'].includes(payload.test_entry.status)) {
        errors.push(`Invalid final status: ${payload.test_entry.status} (must be passed/failed/skipped/running)`);
      }

      if (payload.test_entry.steps && Array.isArray(payload.test_entry.steps)) {
        const stepErrors = this.validateStepsIntegrity(payload.test_entry.steps);
        if (stepErrors.length > 0) {
          errors.push(...stepErrors);
        }
      }

      if (payload.test_entry.steps && payload.test_entry.step_summary) {
        const summary = this.validateStepSummary(payload.test_entry.steps, payload.test_entry.step_summary);
        if (!summary.valid) {
          warnings.push(...summary.warnings);
        }
      }

      if (payload.test_entry.attachments) {
        const attachmentErrors = this.validateAttachments(payload.test_entry.attachments);
        if (attachmentErrors.length > 0) {
          warnings.push(...attachmentErrors);
        }
      }

      if (payload.test_entry.error) {
        const errorValidation = this.validateErrorObject(payload.test_entry.error);
        if (!errorValidation.valid) {
          warnings.push(...errorValidation.warnings);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private static validateStepsIntegrity(steps: any[], depth: number = 0): string[] {
    const errors: string[] = [];
    const maxDepth = 10;

    if (depth > maxDepth) {
      errors.push(`Step nesting exceeds maximum depth of ${maxDepth}`);
      return errors;
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      for (const field of this.REQUIRED_FIELDS.step) {
        if (step[field] === undefined || step[field] === null) {
          errors.push(`Step[${i}] missing required field: ${field}`);
        }
      }

      if (step.status && !['passed', 'failed'].includes(step.status)) {
        errors.push(`Step[${i}] invalid status: ${step.status}`);
      }

      if (typeof step.duration_ms !== 'number' || step.duration_ms < 0) {
        errors.push(`Step[${i}] invalid duration_ms: ${step.duration_ms}`);
      }

      if (step.steps && Array.isArray(step.steps) && step.steps.length > 0) {
        errors.push(...this.validateStepsIntegrity(step.steps, depth + 1));
      }

      if (step.error && step.status !== 'failed') {
        errors.push(`Step[${i}] has error but status is ${step.status}, must be 'failed'`);
      }
    }

    return errors;
  }

  private static validateStepSummary(steps: any[], summary: any): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    const countSteps = (stepList: any[]): { passed: number; failed: number; total: number } => {
      let passed = 0, failed = 0;
      for (const step of stepList) {
        if (step.status === 'passed') passed++;
        else if (step.status === 'failed') failed++;
        if (step.steps && step.steps.length > 0) {
          const nested = countSteps(step.steps);
          passed += nested.passed;
          failed += nested.failed;
        }
      }
      return { passed, failed, total: passed + failed };
    };

    const actual = countSteps(steps);
    
    if (summary.total !== actual.total) {
      warnings.push(`Step summary total mismatch: expected ${summary.total}, actual ${actual.total}`);
    }
    if (summary.passed !== actual.passed) {
      warnings.push(`Step summary passed mismatch: expected ${summary.passed}, actual ${actual.passed}`);
    }
    if (summary.failed !== actual.failed) {
      warnings.push(`Step summary failed mismatch: expected ${summary.failed}, actual ${actual.failed}`);
    }

    return { valid: warnings.length === 0, warnings };
  }

  private static validateAttachments(attachments: any): string[] {
    const warnings: string[] = [];

    if (typeof attachments.has_video !== 'boolean') {
      warnings.push('Attachment has_video should be boolean');
    }
    if (typeof attachments.has_screenshot !== 'boolean') {
      warnings.push('Attachment has_screenshot should be boolean');
    }
    if (typeof attachments.has_trace !== 'boolean') {
      warnings.push('Attachment has_trace should be boolean');
    }

    if (attachments.paths) {
      if (attachments.has_video && !attachments.paths.video) {
        warnings.push('Attachment has_video is true but no video path provided');
      }
      if (attachments.has_screenshot && !attachments.paths.screenshot) {
        warnings.push('Attachment has_screenshot is true but no screenshot path provided');
      }
      if (attachments.has_trace && !attachments.paths.trace) {
        warnings.push('Attachment has_trace is true but no trace path provided');
      }
    }

    return warnings;
  }

  private static validateErrorObject(error: any): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (!error.message || typeof error.message !== 'string') {
      warnings.push('Error object missing or invalid message field');
    }
    if (error.location) {
      if (!error.location.file || !error.location.line) {
        warnings.push('Error location missing file or line number');
      }
    }

    return { valid: warnings.length === 0, warnings };
  }

  static logIntegrityReport(testTitle: string, validation: any): void {
    if (validation.valid) {
      console.log(`✅ [DATA INTEGRITY] ${testTitle} - All checks passed`);
    } else {
      console.error(`❌ [DATA INTEGRITY] ${testTitle} - Validation failed:`);
      validation.errors.forEach((err: string) => console.error(`   ERROR: ${err}`));
    }

    if (validation.warnings && validation.warnings.length > 0) {
      validation.warnings.forEach((warn: string) => console.warn(`   ⚠️  WARNING: ${warn}`));
    }
  }
}

// 🔥 DATABASE SYNC LAYER - FIXED with header sanitization
class DatabaseSyncManager {
  private syncLog: Array<{ testId: string; uniqueKey: string; timestamp: string; status: string; response: string }> = [];
  private failedSyncs = new Map<string, number>();

  async syncPayloadToDatabase(
    testId: string,
    uniqueKey: string,
    payload: any,
    retryRequest: (makeRequest: () => Promise<any>, attempt?: number) => Promise<any>,
    dashboardUrl: string
  ): Promise<{ success: boolean; error?: string; retries: number }> {
    let retries = 0;
    let lastError = '';

    try {
      const response = await retryRequest(() =>
        axios.post(`${dashboardUrl}/api/automation/result`, payload, {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            // 🔥 FIX: Sanitize header values to remove non-ASCII characters (e.g., em dash —)
            'X-Test-ID': sanitizeHeaderValue(testId),
            'X-Unique-Key': sanitizeHeaderValue(uniqueKey),
            'X-Is-Final': String(payload.test_entry.is_final || false),
            'X-Timestamp': new Date().toISOString()
          }
        })
      );

      const syncEntry = {
        testId,
        uniqueKey,
        timestamp: new Date().toISOString(),
        status: 'success',
        response: JSON.stringify({ statusCode: response.status, message: response.data?.message || 'OK' })
      };
      this.syncLog.push(syncEntry);
      this.failedSyncs.delete(uniqueKey);

      console.log(`✅ [DB SYNC] ${uniqueKey} successfully synced to database`);
      return { success: true, retries };
    } catch (error: any) {
      lastError = error.message;
      retries = this.failedSyncs.get(uniqueKey) || 0;
      retries++;
      this.failedSyncs.set(uniqueKey, retries);

      const syncEntry = {
        testId,
        uniqueKey,
        timestamp: new Date().toISOString(),
        status: 'failed',
        response: JSON.stringify({ error: lastError, retryCount: retries })
      };
      this.syncLog.push(syncEntry);

      console.error(`❌ [DB SYNC] ${uniqueKey} failed to sync (Attempt ${retries}): ${lastError}`);
      return { success: false, error: lastError, retries };
    }
  }

  getSyncReport(): any {
    return {
      totalSyncs: this.syncLog.length,
      successfulSyncs: this.syncLog.filter(s => s.status === 'success').length,
      failedSyncs: this.syncLog.filter(s => s.status === 'failed').length,
      failureRetries: Object.fromEntries(this.failedSyncs),
      syncLog: this.syncLog
    };
  }

  logSyncReport(): void {
    const report = this.getSyncReport();
    console.log('\n📊 DATABASE SYNC REPORT:');
    console.log(`   Total Sync Attempts: ${report.totalSyncs}`);
    console.log(`   Successful: ${report.successfulSyncs} ✅`);
    console.log(`   Failed: ${report.failedSyncs} ❌`);
    
    if (Object.keys(report.failureRetries).length > 0) {
      console.log(`   Retries Required:`);
      Object.entries(report.failureRetries).forEach(([testId, count]: [string, any]) => {
        console.log(`      ${testId}: ${count} retries`);
      });
    }
  }
}

// 🔥 DATA TRACKING LAYER
class TestDataTracker {
  private allTests = new Map<string, any>();
  private testsByStatus = new Map<string, string[]>();
  private testsByProject = new Map<string, string[]>();

  registerTest(testKey: string, testData: any): void {
    this.allTests.set(testKey, testData);
    
    const status = testData.test_entry?.status || 'unknown';
    if (!this.testsByStatus.has(status)) {
      this.testsByStatus.set(status, []);
    }
    this.testsByStatus.get(status)!.push(testKey);

    const project = testData.project || 'unknown';
    if (!this.testsByProject.has(project)) {
      this.testsByProject.set(project, []);
    }
    this.testsByProject.get(project)!.push(testKey);

    console.log(`📝 [TRACKER] Registered: ${testKey} (${status})`);
  }

  getTrackerSummary(): any {
    const summary = {
      totalTests: this.allTests.size,
      byStatus: Object.fromEntries(
        Array.from(this.testsByStatus.entries()).map(([status, tests]) => [status, tests.length])
      ),
      byProject: Object.fromEntries(
        Array.from(this.testsByProject.entries()).map(([project, tests]) => [project, tests.length])
      ),
      allTests: Array.from(this.allTests.keys())
    };
    return summary;
  }

  logSummary(): void {
    const summary = this.getTrackerSummary();
    console.log('\n📊 DATA TRACKER SUMMARY:');
    console.log(`   Total Tests Tracked: ${summary.totalTests}`);
    console.log(`   By Status:`, summary.byStatus);
    console.log(`   By Project:`, summary.byProject);
    console.log(`   All Tests: ${summary.allTests.join(', ')}`);
  }
}

interface StepData {
  title: string;
  category: string;
  duration_ms: number;
  status: string;
  startTime: string;
  error?: string;
  steps?: StepData[];
}

interface SuiteData {
  title: string;
  file: string;
  total_tests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
}

interface TestPayload {
  build_id: number;
  session_id: string;
  test_id: string;
  unique_test_key: string;
  spec_file: string;
  test_title: string;
  project: string;
  suite_info?: SuiteData;
  test_entry: {
    title: string;
    project: string;
    file: string;
    run_number: number;
    retry_count: number;
    worker_id: number;
    parallel_index: number;
    start_time: string;
    duration_ms: number;
    duration_seconds: string;
    status: string;
    expected_status: string;
    is_flaky: boolean;
    is_final: boolean;
    current_step?: string;
    progress?: {
      current_step: number;
      total_steps: number;
      percentage: number;
    };
    error?: {
      message: string;
      stack?: string;
      location?: {
        file: string;
        line: number;
        column: number;
      };
      snippet?: string;
    };
    attachments?: {
      has_video: boolean;
      has_screenshot: boolean;
      has_trace: boolean;
      paths: {
        video?: string;
        screenshot?: string;
        trace?: string;
      };
    };
    steps?: StepData[];
    step_summary?: {
      total: number;
      passed: number;
      failed: number;
      summary: string;
    };
    stdout_logs?: string[];
    stderr_logs?: string[];
    metadata: {
      browser: string;
      environment: string;
      ci: boolean;
      timestamp: string;
      node_version?: string;
      os?: string;
    };
  };
  updated_at: string;
  created_at?: string;
}

let uploadQueue = Promise.resolve();
const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

class EnhancedPlaywrightReporter implements Reporter {
  private buildIdPromise: Promise<number>;
  private resolveBuildId!: (id: number) => void;
  private dashboardUrl = 'https://reporter-sigma.vercel.app';
  private testCompletionMap = new Map<string, boolean>();
  private testStatusMap = new Map<string, string>();
  private testStartTimes = new Map<string, number>();
  private payloadLog: TestPayload[] = [];
  private suiteStats = new Map<string, SuiteData>();
  private testLogs = new Map<string, { stdout: string[], stderr: string[] }>();
  private allSuites: Suite[] = [];
  private logFile: fs.WriteStream | null = null;

  private dataTracker = new TestDataTracker();
  private databaseSyncManager = new DatabaseSyncManager();
  private debugPayloadLogger = new DebugPayloadLogger();
  private projectAndTestTracker = new ProjectAndTestTracker();

  private activeTests = new Map<string, {
    test: TestCase;
    result: TestResult;
    startTime: number;
    testId: string;
    uniqueKey: string;
    lastUpdate: number;
    updateTimer?: NodeJS.Timeout;
  }>();

  private testSteps = new Map<string, StepData[]>();
  private savedTestIds = new Set<string>();
  private saveLog: string[] = [];
  private pendingUpdates = new Set<string>();

  private finalPayloads = new Map<string, TestPayload>();
  private testFinalStatuses = new Map<string, string>();

  private uniqueTests = new Map<string, {
    project: string;
    title: string;
    file: string;
    finalStatus: string | null;
    lastRetry: number;
    sentFinal: boolean;
  }>();
  private finalResultsSent = new Set<string>();
  private totalExpectedTests = 0;

  private readonly UPDATE_INTERVAL = 3000;

  constructor() {
    this.buildIdPromise = new Promise(resolve => {
      this.resolveBuildId = resolve;
    });

    const logFileName = `live-logs-${Date.now()}.txt`;
    this.logFile = fs.createWriteStream(logFileName, { flags: 'a' });
    console.log(`📝 Live logs will be saved to: ${logFileName}`);
  }

  private getUniqueTestKey(test: TestCase): string {
    const project = test.parent.project()?.name || 'Default';
    return `${project}::${test.title}`;
  }

  private getRunId(test: TestCase, result: TestResult): string {
    const project = test.parent.project()?.name || 'Default';
    return `${project}::${test.title}::run${result.retry + 1}`;
  }

  private getTestId(test: TestCase, result: TestResult): string {
    const runNum = result.retry + 1;
    const project = test.parent.project()?.name || 'Default';
    const parallelIndex = result.parallelIndex;
    return `${test.location.file}-${test.title}-${project}-${runNum}-${parallelIndex}`.replace(/[^a-zA-Z0-9-]/g, '_');
  }

  async onBegin(config: FullConfig, suite: Suite) {
    this.allSuites = this.collectSuites(suite);
    this.totalExpectedTests = this.countUniqueTests(suite);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 PLAYWRIGHT TEST RUN STARTED`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📊 Expected Unique Tests: ${this.totalExpectedTests}`);
    console.log(`👷 Workers: ${config.workers || 1}`);
    console.log(`🔄 Retries Configured: ${config.projects[0]?.retries || 0}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      const res = await this.retryRequest(() =>
        axios.post(`${this.dashboardUrl}/api/automation/build`, {
          environment: process.env.NODE_ENV || 'dev',
          type: 'playwright',
          session_id: sessionId,
          worker_count: config.workers,
          //@ts-ignore
          retry_count: config.retries,
          total_suites: this.allSuites.length,
          total_tests: this.totalExpectedTests,
          started_at: new Date().toISOString(),
          status: 'running'
        })
      );

      const buildId = Number(res.data.buildId || res.data.id);
      
      if (!buildId || isNaN(buildId)) {
        throw new Error('Invalid build ID received from server');
      }
      
      this.resolveBuildId(buildId);
      console.log(`✅ Build ID: ${buildId}`);
      console.log(`🔗 Dashboard: ${this.dashboardUrl}/builds/${buildId}`);
    } catch (e: any) {
      console.error(`❌ Build initialization failed: ${e.message}`);
      this.resolveBuildId(Math.floor(Math.random() * 100000));
    }
  }

  private collectSuites(suite: Suite): Suite[] {
    const suites: Suite[] = [];
    if (suite.suites.length === 0 && suite.tests.length > 0) {
      suites.push(suite);
    }
    for (const childSuite of suite.suites) {
      suites.push(...this.collectSuites(childSuite));
    }
    return suites;
  }

  private countUniqueTests(suite: Suite): number {
    const uniqueKeys = new Set<string>();
    
    const collectTests = (s: Suite) => {
      const projectName = s.project()?.name || 'Default';
      for (const test of s.tests) {
        const key = `${projectName}::${test.title}`;
        uniqueKeys.add(key);
        console.log(`📋 [REGISTERED] ${key}`);
      }
      s.suites.forEach(collectTests);
    };
    
    suite.suites.forEach(collectTests);
    
    console.log(`\n📊 All registered unique tests (${uniqueKeys.size}):`);
    uniqueKeys.forEach(key => console.log(`   - ${key}`));
    
    return uniqueKeys.size;
  }

  private countTests(suite: Suite): number {
    let count = suite.tests.length;
    for (const childSuite of suite.suites) {
      count += this.countTests(childSuite);
    }
    return count;
  }

  private writeLog(message: string) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    this.logFile?.write(logLine);
  }

  private logSaveAction(testId: string, action: string, details: string = '') {
    const message = `[SAVE] ${testId} - ${action} ${details}`;
    this.saveLog.push(message);
    console.log(`💾 ${message}`);
  }

  async onTestBegin(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name || 'Default';
    const runNum = result.retry + 1;
    const workerId = result.workerIndex;
    const testId = this.getTestId(test, result);
    const uniqueKey = this.getUniqueTestKey(test);
    const runId = this.getRunId(test, result);
    const statusKey = `${project}-${test.title}-R${runNum}`;

    this.projectAndTestTracker.registerTestInProject(project, test.title);

    if (!this.uniqueTests.has(uniqueKey)) {
      this.uniqueTests.set(uniqueKey, {
        project,
        title: test.title,
        file: test.location.file,
        finalStatus: null,
        lastRetry: 0,
        sentFinal: false
      });
    }

    const testInfo = this.uniqueTests.get(uniqueKey)!;
    testInfo.lastRetry = Math.max(testInfo.lastRetry, result.retry);

    this.testCompletionMap.set(statusKey, false);
    this.testStatusMap.set(statusKey, 'running');
    this.testStartTimes.set(statusKey, Date.now());
    this.testLogs.set(statusKey, { stdout: [], stderr: [] });
    this.testSteps.set(runId, []);

    const activeTest = {
      test,
      result,
      startTime: Date.now(),
      testId,
      uniqueKey,
      lastUpdate: 0
    };
    this.activeTests.set(runId, activeTest);

    const retryLabel = result.retry > 0 ? ` (Retry #${result.retry})` : '';
    const startMessage = `▶️  [W${workerId}] Starting: ${test.title} (${project})${retryLabel}`;
    console.log(`\n${startMessage}`);
    this.writeLog(startMessage);

    this.updateSuiteStats(test, 'started');

    await this.buildIdPromise;
    this.startPeriodicUpdates(runId);
  }

  private startPeriodicUpdates(runId: string) {
    const activeTest = this.activeTests.get(runId);
    if (!activeTest) return;

    activeTest.updateTimer = setInterval(async () => {
      if (this.finalResultsSent.has(activeTest.uniqueKey)) {
        this.stopPeriodicUpdates(runId);
        return;
      }

      if (this.activeTests.has(runId) && !this.pendingUpdates.has(runId)) {
        this.pendingUpdates.add(runId);
        try {
          await this.sendProgressUpdate(runId);
        } catch (e: any) {
          // Silently fail on progress updates
        } finally {
          this.pendingUpdates.delete(runId);
        }
      }
    }, this.UPDATE_INTERVAL);
  }

  private stopPeriodicUpdates(runId: string) {
    const activeTest = this.activeTests.get(runId);
    if (activeTest?.updateTimer) {
      clearInterval(activeTest.updateTimer);
      activeTest.updateTimer = undefined;
    }
  }

  private async sendProgressUpdate(runId: string) {
    try {
      const activeTest = this.activeTests.get(runId);
      
      if (!activeTest) {
        return;
      }

      const uniqueKey = activeTest.uniqueKey;

      if (this.finalResultsSent.has(uniqueKey)) {
        this.stopPeriodicUpdates(runId);
        return;
      }

      const project = activeTest.test.parent.project()?.name || 'Default';
      const runNum = activeTest.result.retry + 1;
      const statusKey = `${project}-${activeTest.test.title}-R${runNum}`;

      if (this.testCompletionMap.get(statusKey)) {
        return;
      }

      const now = Date.now();
      if (now - activeTest.lastUpdate < this.UPDATE_INTERVAL / 2) {
        return;
      }

      const id = await this.buildIdPromise;
      const steps: StepData[] = this.testSteps.get(runId) || [];
      const totalSteps = activeTest.result.steps.length || 1;
      const currentStepNum = steps.length;
      const percentage = totalSteps > 0 ? Math.min(Math.round((currentStepNum / totalSteps) * 100), 99) : 0;
      const duration = Date.now() - activeTest.startTime;

      const suiteInfo = this.suiteStats.get(activeTest.test.location.file);

      const payload: TestPayload = {
        build_id: id,
        session_id: sessionId,
        test_id: activeTest.testId,
        unique_test_key: uniqueKey,
        spec_file: activeTest.test.location.file.split(/[\\/]/).pop() || 'unknown',
        test_title: activeTest.test.title,
        project: project,
        ...(suiteInfo && { suite_info: suiteInfo }),
        test_entry: {
          title: activeTest.test.title,
          project: project,
          file: activeTest.test.location.file,
          run_number: runNum,
          retry_count: activeTest.result.retry,
          worker_id: activeTest.result.workerIndex,
          parallel_index: activeTest.result.parallelIndex,
          start_time: activeTest.result.startTime.toISOString(),
          duration_ms: duration,
          duration_seconds: (duration / 1000).toFixed(2),
          status: 'running',
          expected_status: 'passed',
          is_flaky: activeTest.result.retry > 0,
          is_final: false,
          progress: {
            current_step: currentStepNum,
            total_steps: totalSteps,
            percentage: percentage
          },
          ...(steps.length > 0 && { steps }),
          metadata: {
            browser: project,
            environment: process.env.NODE_ENV || 'dev',
            ci: !!process.env.CI,
            timestamp: new Date().toISOString(),
            node_version: process.version,
            os: process.platform
          }
        },
        updated_at: new Date().toISOString()
      };

      await this.retryRequest(() =>
        axios.post(`${this.dashboardUrl}/api/automation/result`, payload, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'X-Is-Final': 'false'
          }
        })
      );

      activeTest.lastUpdate = now;
    } catch (e: any) {
      // Silently fail progress updates
    }
  }

  onStdOut(chunk: string | Buffer, test?: TestCase) {
    this.handleLogs(chunk, test, false);
  }

  onStdErr(chunk: string | Buffer, test?: TestCase) {
    this.handleLogs(chunk, test, true);
  }

  private handleLogs(chunk: string | Buffer, test?: TestCase, isError = false) {
    if (!test) return;

    const project = test.parent.project()?.name || 'Default';
    const runNum = test.results.length || 1;
    const statusKey = `${project}-${test.title}-R${runNum}`;

    if (this.testCompletionMap.get(statusKey)) return;

    const cleanLog = chunk.toString().trim();
    if (!cleanLog) return;

    const logs = this.testLogs.get(statusKey);
    if (logs) {
      if (isError) {
        logs.stderr.push(cleanLog);
      } else {
        logs.stdout.push(cleanLog);
      }
    }
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    const runId = this.getRunId(test, result);
    const stepData = this.extractAllSteps(step);
    const steps = this.testSteps.get(runId) || [];
    steps.push(stepData);
    this.testSteps.set(runId, steps);
  }

  private updateSuiteStats(test: TestCase, status: 'started' | 'passed' | 'failed' | 'skipped') {
    const suiteTitle = test.parent.title || 'Unknown Suite';
    const suiteFile = test.location.file;

    if (!this.suiteStats.has(suiteFile)) {
      this.suiteStats.set(suiteFile, {
        title: suiteTitle,
        file: suiteFile,
        total_tests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration_ms: 0
      });
    }

    const stats = this.suiteStats.get(suiteFile)!;

    if (status === 'started') {
      stats.total_tests++;
    } else if (status === 'passed') {
      stats.passed++;
    } else if (status === 'failed') {
      stats.failed++;
    } else if (status === 'skipped') {
      stats.skipped++;
    }
  }

  private extractAllSteps(step: TestStep, depth: number = 0): StepData {
    const stepData: StepData = {
      title: step.title,
      category: step.category,
      duration_ms: step.duration,
      status: step.error ? 'failed' : 'passed',
      startTime: step.startTime.toISOString(),
      ...(step.error && { error: this.sanitizeString(step.error.message) })
    };

    if (step.steps && step.steps.length > 0) {
      stepData.steps = step.steps.map(s => this.extractAllSteps(s, depth + 1));
    }

    return stepData;
  }

  async onTestEnd(test: TestCase, result: TestResult) {
    const id = await this.buildIdPromise;
    const project = test.parent.project()?.name || 'Default';
    const runNum = result.retry + 1;
    const workerId = result.workerIndex;
    const statusKey = `${project}-${test.title}-R${runNum}`;
    const testId = this.getTestId(test, result);
    const uniqueKey = this.getUniqueTestKey(test);
    const runId = this.getRunId(test, result);

    console.log(`\n🔍 [TEST END] ${uniqueKey}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Retry: ${result.retry}/${test.retries || 0}`);
    console.log(`   Already sent final: ${this.finalResultsSent.has(uniqueKey)}`);

    let waitCount = 0;
    while (this.pendingUpdates.has(runId) && waitCount < 30) {
      await new Promise(res => setTimeout(res, 50));
      waitCount++;
    }

    this.stopPeriodicUpdates(runId);
    this.pendingUpdates.delete(runId);
    
    this.testCompletionMap.set(statusKey, true);
    const finalStatus = TestDataValidator.validateAndNormalizeStatus(result.status);
    this.testStatusMap.set(statusKey, finalStatus);
    
    this.testFinalStatuses.set(testId, finalStatus);

    if (!this.uniqueTests.has(uniqueKey)) {
      console.log(`⚠️  [LATE REGISTER] ${uniqueKey} was not pre-registered, adding now`);
      this.uniqueTests.set(uniqueKey, {
        project,
        title: test.title,
        file: test.location.file,
        finalStatus: null,
        lastRetry: 0,
        sentFinal: false
      });
    }
    
    const testInfo = this.uniqueTests.get(uniqueKey)!;
    testInfo.finalStatus = finalStatus;
    testInfo.lastRetry = result.retry;

    this.projectAndTestTracker.updateTestResult(project, test.title, finalStatus, result.retry);

    this.activeTests.delete(runId);

    this.updateSuiteStats(test, result.status as any);

    const retryLabel = result.retry > 0 ? ` (Retry #${result.retry})` : '';
    const endMessage = `${result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⚠️'} [W${workerId}] ${test.title}${retryLabel} - ${result.status} (${(result.duration / 1000).toFixed(2)}s)`;
    console.log(endMessage);
    this.writeLog(endMessage);

    const maxRetries = test.retries || 0;
    const isLastAttempt = finalStatus === 'passed' || 
                          finalStatus === 'skipped' || 
                          result.retry >= maxRetries;

    console.log(`   Is last attempt: ${isLastAttempt} (passed=${finalStatus === 'passed'}, skipped=${finalStatus === 'skipped'}, retry=${result.retry}>=${maxRetries})`);

    if (isLastAttempt && !this.finalResultsSent.has(uniqueKey)) {
      console.log(`   ➡️  WILL SEND FINAL for ${uniqueKey}`);
      uploadQueue = uploadQueue.then(async () => {
        await this.processFinalResult(test, result, uniqueKey, runId, id, statusKey);
      });
    } else if (this.finalResultsSent.has(uniqueKey)) {
      console.log(`   ⏭️  SKIP: Final already sent for ${uniqueKey}`);
    } else {
      console.log(`   🔄 SKIP: Test will retry (attempt ${result.retry + 1}/${maxRetries + 1})`);
    }
  }

  private async processFinalResult(
    test: TestCase, 
    result: TestResult, 
    uniqueKey: string, 
    runId: string, 
    buildId: number,
    statusKey: string
  ) {
    if (this.finalResultsSent.has(uniqueKey)) {
      console.log(`⚠️  [DEDUP] Skipping duplicate final for ${uniqueKey}`);
      return;
    }

    this.finalResultsSent.add(uniqueKey);
    const testInfo = this.uniqueTests.get(uniqueKey)!;
    testInfo.sentFinal = true;

    try {
      const project = test.parent.project()?.name || 'Default';
      const runNum = result.retry + 1;
      const workerId = result.workerIndex;
      const testId = this.getTestId(test, result);
      const finalStatus = TestDataValidator.validateAndNormalizeStatus(result.status);

      let uploadedVideoUrl: string | null = null;
      const video = result.attachments.find(a => a.name === 'video');
      const screenshot = result.attachments.find(a => a.name === 'screenshot');
      const trace = result.attachments.find(a => a.name === 'trace');

      if (video?.path && fs.existsSync(video.path)) {
        try {
          await new Promise(res => setTimeout(res, 3000));
          const stats = fs.statSync(video.path);

          if (stats.size > 1000) {
            console.log(`📹 [W${workerId}] Uploading video (${(stats.size / 1024 / 1024).toFixed(2)} MB)...`);

            const formData = new FormData();
            formData.append('reqtype', 'fileupload');
            formData.append('time', '72h');
            formData.append('fileToUpload', fs.createReadStream(video.path));

            const uploadRes = await axios.post(
              'https://litterbox.catbox.moe/resources/internals/api.php',
              formData,
              {
                headers: formData.getHeaders(),
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 300000
              }
            );

            const responseData = String(uploadRes.data).trim();
            if (responseData.includes('catbox.moe')) {
              uploadedVideoUrl = responseData;
              console.log(`✅ Video uploaded: ${uploadedVideoUrl}`);
            }
          }
        } catch (e: any) {
          console.error(`❌ Video upload failed: ${e.message}`);
        }
      }

      const errorDetails = result.error ? {
        message: this.sanitizeString(result.error.message),
        stack: this.sanitizeString(result.error.stack?.substring(0, 3000) || ''),
        location: result.error.location,
        snippet: result.error.snippet ? this.sanitizeString(result.error.snippet) : undefined
      } : undefined;

      const steps: StepData[] = result.steps.map(step => this.extractAllSteps(step));
      const logs = this.testLogs.get(statusKey);
      const suiteInfo = this.suiteStats.get(test.location.file);

      const stepAnalysis = StepAnalyzer.analyzeSteps(steps);
      StepAnalyzer.logStepAnalysis(test.title, stepAnalysis);

      const payload: TestPayload = {
        build_id: buildId,
        session_id: sessionId,
        test_id: uniqueKey,
        unique_test_key: uniqueKey,
        spec_file: test.location.file.split(/[\\/]/).pop() || 'unknown',
        test_title: test.title,
        project: project,
        ...(suiteInfo && { suite_info: suiteInfo }),
        test_entry: {
          title: test.title,
          project: project,
          file: test.location.file,
          run_number: runNum,
          retry_count: result.retry,
          worker_id: result.workerIndex,
          parallel_index: result.parallelIndex,
          start_time: result.startTime.toISOString(),
          duration_ms: result.duration,
          duration_seconds: (result.duration / 1000).toFixed(2),
          status: finalStatus,
          expected_status: 'passed',
          is_flaky: result.retry > 0,
          is_final: true,
          progress: {
            current_step: steps.length,
            total_steps: steps.length,
            percentage: 100
          },
          ...(errorDetails && { error: errorDetails }),
          ...((uploadedVideoUrl || screenshot?.path || trace?.path) && {
            attachments: {
              has_video: !!uploadedVideoUrl,
              has_screenshot: !!screenshot?.path,
              has_trace: !!trace?.path,
              paths: {
                ...(uploadedVideoUrl && { video: uploadedVideoUrl }),
                ...(screenshot?.path && { screenshot: screenshot.path }),
                ...(trace?.path && { trace: trace.path })
              }
            }
          }),
          ...(steps.length > 0 && { 
            steps,
            step_summary: {
              total: stepAnalysis.totalSteps,
              passed: stepAnalysis.passedSteps,
              failed: stepAnalysis.failedSteps,
              summary: stepAnalysis.stepSummary
            }
          }),
          ...(logs && logs.stdout.length > 0 && { stdout_logs: logs.stdout }),
          ...(logs && logs.stderr.length > 0 && { stderr_logs: logs.stderr }),
          metadata: {
            browser: project,
            environment: process.env.NODE_ENV || 'dev',
            ci: !!process.env.CI,
            timestamp: new Date().toISOString(),
            node_version: process.version,
            os: process.platform
          }
        },
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      const validation = TestDataValidator.validateTestPayload(payload);
      if (!TestDataValidator.logValidationResult(payload, validation)) {
        console.error(`   Skipping invalid payload for: ${payload.test_title}`);
        this.finalResultsSent.delete(uniqueKey);
        testInfo.sentFinal = false;
        return;
      }

      this.dataTracker.registerTest(uniqueKey, payload);

      this.savedTestIds.add(uniqueKey);
      this.logSaveAction(uniqueKey, 'SAVING FINAL PAYLOAD', `Project: ${payload.project}, Run: ${payload.test_entry.run_number}, Status: ${finalStatus.toUpperCase()}`);

      this.debugPayloadLogger.logPayloadBefore(testId, uniqueKey, payload, `FINAL Result - Status: ${finalStatus}, HasVideo: ${!!uploadedVideoUrl}`);

      this.finalPayloads.set(uniqueKey, payload);
      this.payloadLog.push(payload);
      this.testLogs.delete(statusKey);

      await this.sendFinalResult(payload, uniqueKey);

    } catch (e: any) {
      console.error(`❌ Error processing final result for ${uniqueKey}: ${e.message}`);
      this.finalResultsSent.delete(uniqueKey);
      testInfo.sentFinal = false;
    }
  }

  private async sendFinalResult(payload: TestPayload, uniqueKey: string) {
    try {
      const testId = payload.test_id;

      this.debugPayloadLogger.logPayloadBefore(testId, uniqueKey, payload, 'Final Result - Before Integrity Check');

      const integrityValidation = DataIntegrityValidator.validatePayloadIntegrity(payload);
      DataIntegrityValidator.logIntegrityReport(payload.test_title, integrityValidation);

      if (!integrityValidation.valid) {
        console.error(`❌ [INTEGRITY] Failed validation checks - NOT syncing to database`);
        return;
      }

      const syncResult = await this.databaseSyncManager.syncPayloadToDatabase(
        testId,
        uniqueKey,
        payload,
        (makeRequest, attempt) => this.retryRequest(makeRequest, attempt),
        this.dashboardUrl
      );

      this.debugPayloadLogger.logPayloadAfterSync(testId, uniqueKey, syncResult, payload);

      if (syncResult.success) {
        console.log(`   ✓ FINAL result synced to database successfully for ${uniqueKey}`);
      } else {
        console.warn(`   ⚠️  Database sync failed after ${syncResult.retries} attempt(s): ${syncResult.error}`);
      }
    } catch (e: any) {
      console.error(`⚠️  Unexpected error in sendFinalResult: ${e.message}`);
    }
  }

  async onEnd() {
    console.log(`\n⏳ Waiting for all uploads to complete...`);

    for (const runId of this.activeTests.keys()) {
      this.stopPeriodicUpdates(runId);
    }

    let maxWait = 0;
    while (this.pendingUpdates.size > 0 && maxWait < 50) {
      await new Promise(res => setTimeout(res, 100));
      maxWait++;
    }

    this.activeTests.clear();
    this.pendingUpdates.clear();

    await uploadQueue;

    this.printConsistencyCheck();

    this.projectAndTestTracker.logProjectSummary();
    this.projectAndTestTracker.saveProjectSummaryToFile('project-summary.json');

    this.dataTracker.logSummary();
    this.databaseSyncManager.logSyncReport();

    this.debugPayloadLogger.logDebugReport();
    this.debugPayloadLogger.saveDebugReportToFile('debug-payload-report.json');

    console.log('\n📋 SAVE LOG:');
    this.saveLog.forEach(log => console.log(`  ${log}`));
    console.log(`\n✅ Total unique tests saved: ${this.finalResultsSent.size}`);
    console.log(`📊 Expected tests: ${this.totalExpectedTests}`);
    console.log(`📊 Final payload records count: ${this.finalPayloads.size}`);

    const id = await this.buildIdPromise;
    try {
      const projectSummary = this.projectAndTestTracker.getProjectsSummary();
      
      await this.retryRequest(() =>
        axios.post(`${this.dashboardUrl}/api/automation/build`, {
          build_id: id,
          session_id: sessionId,
          completed_at: new Date().toISOString(),
          status: 'completed',
          total_duration_ms: Date.now() - (this.testStartTimes.values().next().value || Date.now()),
          suites: Array.from(this.suiteStats.values()),
          testTracking: this.dataTracker.getTrackerSummary(),
          projectTracking: projectSummary,
          totalTestsSaved: this.finalPayloads.size,
          totalExpectedTests: this.totalExpectedTests,
          totalFinalResultsSent: this.finalResultsSent.size
        })
      );
    } catch (e) {
      console.error('Failed to mark build as complete');
    }

    this.logFile?.end();

    const logFile = 'playwright-payloads.json';
    fs.writeFileSync(logFile, JSON.stringify(Array.from(this.finalPayloads.values()), null, 2));
    console.log(`\n💾 Payloads saved to ${logFile} (${this.finalPayloads.size} records)`);
    console.log(`✅ Reporter completed - Session: ${sessionId}`);
  }

  private printConsistencyCheck() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 CONSISTENCY CHECK`);
    console.log(`${'='.repeat(60)}`);
    
    console.log(`\n📈 EXPECTED vs ACTUAL:`);
    console.log(`   Expected Unique Tests: ${this.totalExpectedTests}`);
    console.log(`   Final Results Sent: ${this.finalResultsSent.size}`);
    console.log(`   Final Payloads Stored: ${this.finalPayloads.size}`);
    
    if (this.finalResultsSent.size === this.totalExpectedTests) {
      console.log(`\n✅ SUCCESS: All ${this.totalExpectedTests} tests reported correctly!`);
    } else {
      console.log(`\n⚠️  WARNING: Mismatch detected!`);
      console.log(`   Missing: ${this.totalExpectedTests - this.finalResultsSent.size} test(s)`);
      
      console.log(`\n   📋 Tests Status:`);
      for (const [uniqueKey, info] of this.uniqueTests) {
        const status = info.sentFinal ? '✅ SENT' : '❌ NOT SENT';
        const finalStatus = info.finalStatus || 'unknown';
        console.log(`   - ${uniqueKey}: ${status} (${finalStatus})`);
      }
    }
    
    console.log(`\n📱 BY PROJECT:`);
    const byProject = new Map<string, { total: number; sent: number }>();
    for (const [uniqueKey, info] of this.uniqueTests) {
      if (!byProject.has(info.project)) {
        byProject.set(info.project, { total: 0, sent: 0 });
      }
      const proj = byProject.get(info.project)!;
      proj.total++;
      if (info.sentFinal) proj.sent++;
    }
    
    for (const [project, stats] of byProject) {
      const status = stats.sent === stats.total ? '✅' : '⚠️';
      console.log(`   ${status} ${project}: ${stats.sent}/${stats.total} tests reported`);
    }
    
    console.log(`${'='.repeat(60)}\n`);
  }

  private async retryRequest(
    makeRequest: () => Promise<any>,
    attempt: number = 0
  ): Promise<any> {
    try {
      return await makeRequest();
    } catch (error: any) {
      if (attempt < MAX_RETRIES && this.isRetryable(error)) {
        const delay = BASE_DELAY * Math.pow(2, attempt);
        await new Promise(res => setTimeout(res, delay));
        return this.retryRequest(makeRequest, attempt + 1);
      }
      throw error;
    }
  }

  private isRetryable(error: any): boolean {
    if (error.response?.status === 500) return true;
    if (error.response?.status === 503) return true;
    if (error.code === 'ECONNREFUSED') return true;
    if (error.code === 'ETIMEDOUT') return true;
    return false;
  }

  private sanitizeString(input: any): string {
    if (!input) return '';
    if (typeof input !== 'string') return String(input);

    return input
      .replace(/\u001b\[\d+m/g, '')
      .replace(/\u001b\[[^m]*m/g, '')
      .replace(/\0/g, '')
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      .substring(0, 5000)
      .trim();
  }
}

export default EnhancedPlaywrightReporter;