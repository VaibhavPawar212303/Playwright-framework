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
const http = __importStar(require("http"));
// Regex to remove ANSI color codes
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
class PlayWithAIReporter {
    constructor(options = {}) {
        // State
        this.passed = 0;
        this.failed = 0;
        this.skipped = 0;
        this.timedOut = 0;
        this.flaky = 0;
        this.totalDuration = 0;
        this.startTime = 0;
        this.totalTestsExpected = 0;
        this.slowTests = [];
        this.failedTests = [];
        this.allTestRecords = [];
        // Live Server Properties
        this.server = null;
        this.clients = [];
        this.verbose = options.verbose || false;
        this.slowTestThreshold = options.slowTestThreshold || 5000;
        this.webhookUrl = options.webhookUrl;
        this.outputDir = options.outputDir || 'playwithAireporter';
        this.logFile = options.logFile || path.join(this.outputDir, 'execution-log.txt');
        this.liveServerPort = options.liveServerPort || 8080;
        // Ensure Directory Exists
        if (!fs.existsSync(this.outputDir)) {
            try {
                fs.mkdirSync(this.outputDir, { recursive: true });
            }
            catch (e) { }
        }
        const header = `Test Run Started: ${new Date().toLocaleString()}\n` +
            `==================================================\n`;
        fs.writeFileSync(this.logFile, header);
    }
    print(message) {
        console.log(message);
        const cleanMessage = message.replace(ansiRegex, '');
        fs.appendFileSync(this.logFile, cleanMessage + '\n');
    }
    // --- 1. START THE LIVE SERVER ---
    startLiveServer() {
        this.server = http.createServer((req, res) => {
            // Enable CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (req.url === '/events') {
                // Server-Sent Events (SSE) Endpoint
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                });
                this.clients.push(res);
                // Send initial data immediately
                const initialData = JSON.stringify({
                    type: 'init',
                    stats: this.getStats(),
                    tests: this.allTestRecords
                });
                res.write(`data: ${initialData}\n\n`);
                // Clean up when client disconnects
                req.on('close', () => {
                    this.clients = this.clients.filter(client => client !== res);
                });
            }
            else {
                // Serve the HTML Dashboard
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(this.getHtmlTemplate(this.getStats(), this.allTestRecords, true));
            }
        });
        this.server.listen(this.liveServerPort, () => {
            this.print(`${colors.cyan}📡 Live Dashboard available at: http://localhost:${this.liveServerPort}${colors.reset}`);
        });
    }
    // --- 2. NOTIFY BROWSERS OF NEW DATA ---
    notifyClients(newRecord) {
        const payload = JSON.stringify({
            type: 'update',
            stats: this.getStats(),
            newTest: newRecord
        });
        this.clients.forEach(client => client.write(`data: ${payload}\n\n`));
    }
    onBegin(config, suite) {
        var _a;
        this.startTime = Date.now();
        this.totalTestsExpected = suite.allTests().length;
        // Start Server
        this.startLiveServer();
        const workers = config.workers;
        const isHeadless = ((_a = config.projects[0]) === null || _a === void 0 ? void 0 : _a.use.headless) !== false;
        const mode = isHeadless ? 'Headless' : 'Headed';
        this.print(`\n${colors.bright}🚀 Starting Test Run${colors.reset}`);
        this.print(`${colors.dim}--------------------------------------------------${colors.reset}`);
        this.print(`  • Mode:    ${colors.yellow}${mode}${colors.reset}`);
        this.print(`  • Workers: ${colors.yellow}${workers}${colors.reset}`);
        this.print(`  • Tests:   ${this.totalTestsExpected}`);
        this.print(`${colors.dim}--------------------------------------------------${colors.reset}`);
    }
    onTestBegin(test) {
        // Optional: Send "Running" status updates to live dashboard if desired
    }
    async onTestEnd(test, result) {
        var _a;
        this.totalDuration += result.duration;
        const browser = ((_a = test.parent.project()) === null || _a === void 0 ? void 0 : _a.name) || 'unknown';
        const browserTag = `${colors.magenta}[${browser}]${colors.reset}`;
        // Slow Test Logic
        const isSlow = result.duration > this.slowTestThreshold;
        if (isSlow && result.status === 'passed') {
            this.slowTests.push({ title: test.title, duration: result.duration, browser });
        }
        let consoleStatus = '';
        // Console Logging & Counters
        if (result.status === 'passed') {
            if (result.retry > 0) {
                this.flaky++;
                consoleStatus = 'flaky';
                this.print(`${colors.yellow}  ⚠️  ${browserTag} ${test.title} (FLAKY - Passed on retry #${result.retry})${colors.reset}`);
            }
            else {
                this.passed++;
                consoleStatus = 'passed';
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
                consoleStatus = 'failed';
                this.failedTests.push({ title: test.title, browser });
                this.print(`${colors.red}  ✘ ${browserTag} ${test.title}${colors.reset}`);
            }
            if (result.error) {
                const errorMessage = result.error.message || result.error.stack || 'Unknown Error';
                this.print(`${colors.red}    Error: ${errorMessage.split('\n')[0]}${colors.reset}`);
            }
        }
        else if (result.status === 'skipped') {
            this.skipped++;
            consoleStatus = 'skipped';
            this.print(`${colors.yellow}  ⚠ ${browserTag} ${test.title} (Skipped)${colors.reset}`);
        }
        else if (result.status === 'timedOut') {
            this.timedOut++;
            consoleStatus = 'timedOut';
            this.print(`${colors.red}  ⏰ ${browserTag} ${test.title} (Timed Out)${colors.reset}`);
        }
        // Capture Screenshot
        let base64Img;
        const screenshotAttachment = result.attachments.find(a => a.name === 'screenshot' && a.path);
        if (screenshotAttachment && screenshotAttachment.path) {
            try {
                const imgBuffer = fs.readFileSync(screenshotAttachment.path);
                base64Img = `data:image/png;base64,${imgBuffer.toString('base64')}`;
            }
            catch (e) { }
        }
        // Prepare Record
        const isIntermediateFailure = result.status === 'failed' && result.retry < test.retries;
        let newRecord = null;
        if (!isIntermediateFailure) {
            newRecord = {
                id: Math.random().toString(36).substr(2, 9),
                title: test.title,
                project: browser,
                status: (consoleStatus || result.status),
                duration: result.duration,
                retry: result.retry,
                error: result.error ? (ansiRegex[Symbol.replace](result.error.message || result.error.stack || '', '')) : undefined,
                screenshot: base64Img
            };
            this.allTestRecords.push(newRecord);
            // --- 3. PUSH UPDATE TO LIVE SERVER ---
            this.notifyClients(newRecord);
        }
    }
    async onEnd(result) {
        const durationSec = (this.totalDuration / 1000).toFixed(2);
        const totalTests = this.passed + this.failed + this.skipped + this.timedOut + this.flaky;
        this.print(`\n${colors.dim}--------------------------------------------------${colors.reset}`);
        this.print(`${colors.bright}🏁 Test Run Finished: ${result.status.toUpperCase()}${colors.reset}`);
        this.print(`${colors.dim}--------------------------------------------------${colors.reset}`);
        // Summary Printing
        this.print(`  ${colors.cyan}Total Tests:${colors.reset}  ${totalTests}`);
        this.print(`  ${colors.green}Passed:${colors.reset}       ${this.passed}`);
        this.print(`  ${colors.red}Failed:${colors.reset}       ${this.failed}`);
        this.print(`  ${colors.dim}Duration:${colors.reset}     ${durationSec}s`);
        this.print(`${colors.dim}--------------------------------------------------${colors.reset}\n`);
        this.print(`${colors.cyan}📝 Logs saved to: ${this.logFile}${colors.reset}`);
        // Generate Final Static Files
        this.generateMarkdown(durationSec, totalTests);
        // Save Final HTML (Disable Live Mode in the static file)
        const htmlFile = path.join(this.outputDir, 'index.html');
        const template = this.getHtmlTemplate(this.getStats(), this.allTestRecords, false);
        fs.writeFileSync(htmlFile, template);
        this.print(`${colors.cyan}📊 Static HTML Report saved to: ${htmlFile}${colors.reset}\n`);
        if (this.webhookUrl && this.failed > 0) {
            await this.sendWebhook(result.status, durationSec);
        }
        // --- 4. CLOSE SERVER (IMPORTANT) ---
        // If we don't close it, the process will hang and CI will timeout.
        if (this.server) {
            this.server.close();
            this.print(`${colors.dim}📡 Live Server closed.${colors.reset}`);
        }
    }
    getStats() {
        return {
            total: this.totalTestsExpected, // Use expected total for progress calculation
            passed: this.passed,
            failed: this.failed + this.timedOut,
            flaky: this.flaky,
            skipped: this.skipped,
            duration: this.totalDuration,
            startTime: new Date(this.startTime).toLocaleString()
        };
    }
    // --- Helper Methods (Markdown, Webhook) kept same for brevity, skipping to HTML ---
    generateMarkdown(duration, total) { }
    async sendWebhook(status, duration) { }
    // --- UPDATED HTML TEMPLATE FOR LIVE UPDATES ---
    getHtmlTemplate(stats, tests, isLive) {
        const dataJson = JSON.stringify(tests);
        const statsJson = JSON.stringify(stats);
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Play With AI Report ${isLive ? '(LIVE)' : ''}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
        .card { background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; }
        .status-badge { padding: 4px 10px; border-radius: 9999px; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; display: inline-flex; align-items: center; gap: 6px; }
        .passed { color: #059669; background: #d1fae5; }
        .failed { color: #dc2626; background: #fee2e2; }
        .flaky { color: #d97706; background: #fef3c7; }
        .skipped { color: #4b5563; background: #f3f4f6; }
        .timedOut { color: #dc2626; background: #fee2e2; }
        .expand-row { display: none; background: #f8fafc; border-top: 1px solid #e2e8f0; animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        /* Live Indicator Pulse */
        .live-dot { height: 10px; width: 10px; background-color: #22c55e; border-radius: 50%; display: inline-block; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); } 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); } }
    </style>
</head>
<body class="p-6 md:p-10">
    <div class="max-w-7xl mx-auto">
        <div class="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
            <div>
                <h1 class="text-4xl font-extrabold text-slate-800 tracking-tight">
                    <i class="fa-solid fa-robot text-purple-600 mr-2"></i> Play With AI <span class="text-purple-600">Reports</span>
                    ${isLive ? '<span class="ml-3 text-sm font-normal text-slate-500"><span class="live-dot mr-2"></span>Live Updates</span>' : ''}
                </h1>
                <p class="text-slate-500 mt-2 font-medium" id="runMeta">Run started: ${stats.startTime}</p>
            </div>
            <div class="flex gap-4" id="statsBoard">
                 <!-- Stats injected via JS -->
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="card p-6 md:col-span-1 flex flex-col items-center justify-center">
                <h3 class="text-lg font-bold text-slate-700 mb-4">Overall Status</h3>
                <div class="w-48 h-48 relative">
                    <canvas id="statusChart"></canvas>
                </div>
            </div>
            <div class="card p-6 md:col-span-2 flex flex-col justify-center">
                <h3 class="text-lg font-bold text-slate-700 mb-4">Search & Filter</h3>
                <div class="flex flex-col sm:flex-row gap-4 mb-4">
                    <input type="text" id="searchInput" placeholder="Search tests..." class="w-full pl-4 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <select id="statusFilter" class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-600">
                        <option value="all">All Statuses</option>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                        <option value="flaky">Flaky</option>
                    </select>
                </div>
                <div class="text-sm text-slate-500 font-medium">
                    Showing <span id="visibleCount" class="text-purple-600 font-bold">${tests.length}</span> test results
                </div>
            </div>
        </div>

        <div class="card overflow-hidden">
            <table class="w-full text-left border-collapse">
                <thead class="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                        <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Test Name</th>
                        <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Browser</th>
                        <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Duration</th>
                        <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody id="testTableBody" class="divide-y divide-slate-100"></tbody>
            </table>
        </div>
    </div>

    <script>
        let tests = ${dataJson};
        let stats = ${statsJson};
        let chartInstance = null;
        const isLive = ${isLive};

        // --- LIVE UPDATE LOGIC ---
        if (isLive) {
            const evtSource = new EventSource('/events');
            evtSource.onmessage = function(event) {
                const data = JSON.parse(event.data);
                if (data.type === 'update') {
                    if (data.newTest) tests.push(data.newTest);
                    stats = data.stats;
                    refreshUI();
                } else if (data.type === 'init') {
                    // Initial load sync
                    tests = data.tests;
                    stats = data.stats;
                    refreshUI();
                }
            };
            // Close connection if server dies (test ends)
            evtSource.onerror = function() { evtSource.close(); };
        }

        // --- UI FUNCTIONS ---

        function refreshUI() {
            updateStatsBoard();
            updateChart();
            filterData(); // This calls renderTable
        }

        function updateStatsBoard() {
            const board = document.getElementById('statsBoard');
            board.innerHTML = \`
                 <div class="bg-white px-5 py-3 rounded-xl shadow-sm border border-slate-200 text-center">
                    <span class="block text-2xl font-bold text-slate-800">\${stats.total}</span>
                    <span class="text-xs text-slate-500 font-bold uppercase">Total</span>
                 </div>
                 <div class="bg-emerald-50 px-5 py-3 rounded-xl border border-emerald-100 text-center text-emerald-700">
                    <span class="block text-2xl font-bold">\${stats.passed}</span>
                    <span class="text-xs font-bold uppercase">Passed</span>
                 </div>
                 <div class="bg-rose-50 px-5 py-3 rounded-xl border border-rose-100 text-center text-rose-700">
                    <span class="block text-2xl font-bold">\${stats.failed}</span>
                    <span class="text-xs font-bold uppercase">Failed</span>
                 </div>
                 <div class="bg-amber-50 px-5 py-3 rounded-xl border border-amber-100 text-center text-amber-700">
                    <span class="block text-2xl font-bold">\${stats.flaky}</span>
                    <span class="text-xs font-bold uppercase">Flaky</span>
                 </div>
            \`;
        }

        function updateChart() {
            const ctx = document.getElementById('statusChart').getContext('2d');
            if (chartInstance) chartInstance.destroy();
            
            chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Passed', 'Failed', 'Flaky', 'Skipped'],
                    datasets: [{
                        data: [stats.passed, stats.failed, stats.flaky, stats.skipped],
                        backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#9ca3af'],
                        borderWidth: 0
                    }]
                },
                options: { cutout: '75%', plugins: { legend: { display: false } }, animation: { duration: 0 } }
            });
        }

        function renderTable(filteredTests) {
            const tbody = document.getElementById('testTableBody');
            document.getElementById('visibleCount').innerText = filteredTests.length;
            
            tbody.innerHTML = filteredTests.map(test => {
                let badgeClass = test.status;
                let icon = 'fa-circle';
                if(test.status === 'passed') icon = 'fa-check';
                if(test.status === 'failed') icon = 'fa-xmark';
                if(test.status === 'flaky') icon = 'fa-triangle-exclamation';

                return \`
                    <tr class="cursor-pointer hover:bg-slate-50 transition" onclick="toggleRow('\${test.id}')">
                        <td class="px-6 py-4"><span class="status-badge \${badgeClass}"><i class="fa-solid \${icon}"></i> \${test.status}</span></td>
                        <td class="px-6 py-4 font-medium text-slate-700">\${test.title}</td>
                        <td class="px-6 py-4 text-slate-500 capitalize">\${test.project}</td>
                        <td class="px-6 py-4 text-slate-500 font-mono text-sm">\${test.duration}ms</td>
                        <td class="px-6 py-4 text-purple-600 font-medium">Details <i class="fa-solid fa-chevron-down ml-1"></i></td>
                    </tr>
                    <tr id="detail-\${test.id}" class="expand-row">
                        <td colspan="5" class="px-6 py-6 bg-slate-50 border-t border-slate-200">
                             <div class="flex flex-col md:flex-row gap-6">
                                <div class="flex-1">
                                    <h4 class="font-bold text-slate-700 mb-2">Error</h4>
                                    <div class="bg-slate-900 text-red-300 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap">\${test.error || 'No Error'}</div>
                                    <button onclick="event.stopPropagation(); askAI('\${test.id}')" class="mt-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm">Ask AI</button>
                                </div>
                                \${ test.screenshot ? \`<div class="flex-1"><img src="\${test.screenshot}" class="rounded-lg shadow-sm"></div>\` : '' }
                            </div>
                        </td>
                    </tr>
                \`;
            }).join('');
        }

        // Toggle Row
        window.toggleRow = (id) => {
            const row = document.getElementById('detail-' + id);
            row.style.display = row.style.display === 'table-row' ? 'none' : 'table-row';
        };
        
        // Ask AI (Same as before)
        window.askAI = (id) => {
             const test = tests.find(t => t.id === id);
             if (test && test.error) window.open('https://chat.openai.com/?q=' + encodeURIComponent("Fix Playwright error: " + test.error), '_blank');
        };

        // Filter
        const searchInput = document.getElementById('searchInput');
        const statusFilter = document.getElementById('statusFilter');

        function filterData() {
            const q = searchInput.value.toLowerCase();
            const s = statusFilter.value;
            const res = tests.filter(t => 
                (s === 'all' || t.status === s) &&
                (t.title.toLowerCase().includes(q) || t.project.toLowerCase().includes(q))
            );
            renderTable(res);
        }

        searchInput.addEventListener('input', filterData);
        statusFilter.addEventListener('change', filterData);

        // Init
        refreshUI();
    </script>
</body>
</html>
    `;
    }
}
exports.default = PlayWithAIReporter;
