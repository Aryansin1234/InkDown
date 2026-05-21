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
exports.ServerManager = void 0;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
class ServerManager {
    constructor(context) {
        this.context = context;
        this.process = null;
        this._onStatusChange = new vscode.EventEmitter();
        this.onStatusChange = this._onStatusChange.event;
    }
    async detectInkDownPath() {
        const config = vscode.workspace.getConfiguration('inkdown');
        const configured = config.get('inkdownPath', '');
        if (configured && fs.existsSync(path.join(configured, 'server.js'))) {
            return configured;
        }
        const folders = vscode.workspace.workspaceFolders ?? [];
        for (const folder of folders) {
            const p = folder.uri.fsPath;
            if (fs.existsSync(path.join(p, 'server.js')) &&
                fs.existsSync(path.join(p, 'src', 'cli.js'))) {
                await config.update('inkdownPath', p, vscode.ConfigurationTarget.Workspace);
                return p;
            }
        }
        return null;
    }
    async getInkDownPath() {
        return this.detectInkDownPath();
    }
    async start() {
        if (await this.isRunning()) {
            vscode.window.showInformationMessage('InkDown server is already running.');
            return;
        }
        const inkdownPath = await this.getInkDownPath();
        if (!inkdownPath) {
            throw new Error('InkDown path not configured. Set inkdown.inkdownPath in settings.');
        }
        const serverJs = path.join(inkdownPath, 'server.js');
        this.process = cp.spawn('node', [serverJs], {
            cwd: inkdownPath,
            env: { ...process.env },
            stdio: 'pipe',
        });
        this.process.on('exit', () => {
            this.process = null;
            this._onStatusChange.fire('stopped');
        });
        await this.waitForServer(10000);
        this._onStatusChange.fire('running');
    }
    stop() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        this._onStatusChange.fire('stopped');
    }
    async isRunning() {
        const config = vscode.workspace.getConfiguration('inkdown');
        const serverUrl = config.get('serverUrl', 'http://localhost:3000');
        return new Promise((resolve) => {
            try {
                const url = new URL('/api/v1/health', serverUrl);
                const req = http.get(url.toString(), (res) => {
                    resolve(res.statusCode === 200);
                    res.resume();
                });
                req.on('error', () => resolve(false));
                req.setTimeout(1500, () => {
                    req.destroy();
                    resolve(false);
                });
            }
            catch {
                resolve(false);
            }
        });
    }
    async waitForServer(maxMs) {
        const deadline = Date.now() + maxMs;
        while (Date.now() < deadline) {
            if (await this.isRunning()) {
                return;
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        throw new Error('InkDown server did not become ready in time.');
    }
}
exports.ServerManager = ServerManager;
//# sourceMappingURL=serverManager.js.map