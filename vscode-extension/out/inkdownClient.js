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
exports.InkDownClient = void 0;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
class InkDownClient {
    constructor(serverManager) {
        this.serverManager = serverManager;
    }
    /** Returns the path to the bundled themes directory, or null if not found. */
    async getThemesDir() {
        const inkdownPath = await this.serverManager.getInkDownPath();
        if (!inkdownPath) {
            return null;
        }
        const candidates = [
            path.join(inkdownPath, 'samples', 'themes'),
            path.join(inkdownPath, 'themes'),
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        return null;
    }
    async convert(sourcePath, outputPath, options, progress) {
        progress?.report({ message: 'Checking server…' });
        const serverRunning = await this.serverManager.isRunning();
        if (serverRunning) {
            progress?.report({ message: `Converting via API to ${options.format.toUpperCase()}…` });
            await this.convertViaApi(sourcePath, outputPath, options);
        }
        else {
            progress?.report({ message: `Converting via CLI to ${options.format.toUpperCase()}…` });
            await this.convertViaCli(sourcePath, outputPath, options);
        }
    }
    async convertViaApi(sourcePath, outputPath, options) {
        const config = vscode.workspace.getConfiguration('inkdown');
        const serverUrl = config.get('serverUrl', 'http://localhost:3000');
        const apiKey = config.get('apiKey', '');
        const markdown = fs.readFileSync(sourcePath, 'utf-8');
        const title = options.title ?? path.basename(sourcePath, '.md');
        const body = {
            markdown,
            format: options.format,
            title,
            toc: options.toc ?? false,
            autoBreak: options.autoBreak ?? false,
            pageSize: options.pageSize ?? 'A4',
            landscape: options.landscape ?? false,
        };
        if (options.author) {
            body.author = options.author;
        }
        if (options.date) {
            body.date = options.date;
        }
        if (options.watermark) {
            body.watermark = options.watermark;
        }
        if (options.theme) {
            body.theme = options.theme;
        }
        if (options.referenceDoc) {
            body.referenceDoc = options.referenceDoc;
        }
        const jsonBody = JSON.stringify(body);
        const url = new URL('/api/v1/convert', serverUrl);
        const transport = url.protocol === 'https:' ? https : http;
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(jsonBody),
        };
        if (apiKey) {
            headers['X-API-Key'] = apiKey;
        }
        const buffer = await new Promise((resolve, reject) => {
            const req = transport.request({
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers,
            }, (res) => {
                if (res.statusCode !== 200) {
                    let errBody = '';
                    res.on('data', (d) => (errBody += d.toString()));
                    res.on('end', () => reject(new Error(`API returned ${res.statusCode}: ${errBody}`)));
                    return;
                }
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            });
            req.on('error', reject);
            req.write(jsonBody);
            req.end();
        });
        fs.writeFileSync(outputPath, buffer);
    }
    async convertViaCli(sourcePath, outputPath, options) {
        const inkdownPath = await this.serverManager.getInkDownPath();
        if (!inkdownPath) {
            throw new Error('InkDown not found. Install it globally with `npm install -g inkdown`, ' +
                'or set inkdown.inkdownPath in extension settings to point to the InkDown directory.');
        }
        // Ensure dependencies are installed before running CLI
        await this.serverManager.ensureDependencies(inkdownPath);
        const cliPath = path.join(inkdownPath, 'src', 'cli.js');
        if (!fs.existsSync(cliPath)) {
            throw new Error(`InkDown CLI not found at: ${cliPath}`);
        }
        const args = [cliPath];
        if (options.toc) {
            args.push('--toc');
        }
        if (options.autoBreak) {
            args.push('--auto-break');
        }
        if (options.title) {
            args.push('--title', options.title);
        }
        if (options.author) {
            args.push('--author', options.author);
        }
        if (options.date) {
            args.push('--date', options.date);
        }
        if (options.watermark) {
            args.push('--watermark', options.watermark);
        }
        if (options.pageSize && options.pageSize !== 'A4') {
            args.push('--page-size', options.pageSize);
        }
        if (options.landscape) {
            args.push('--landscape');
        }
        if (options.referenceDoc) {
            args.push('--reference-doc', options.referenceDoc);
        }
        if (options.theme) {
            args.push('--theme', options.theme);
        }
        args.push('--format', options.format);
        args.push(sourcePath, outputPath);
        await new Promise((resolve, reject) => {
            const proc = cp.spawn('node', args, { cwd: inkdownPath, stdio: 'pipe' });
            let stderr = '';
            proc.stderr?.on('data', (d) => (stderr += d.toString()));
            proc.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`CLI exited with code ${code}: ${stderr.trim()}`));
                }
                else {
                    resolve();
                }
            });
            proc.on('error', reject);
        });
    }
}
exports.InkDownClient = InkDownClient;
//# sourceMappingURL=inkdownClient.js.map