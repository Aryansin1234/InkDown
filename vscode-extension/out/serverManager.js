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
        this.resolvedPath = null;
        this.depsInstalled = false;
    }
    /**
     * Validates that a directory is a valid InkDown installation
     * (contains server.js and src/cli.js).
     */
    isValidInkDownDir(dir) {
        return (fs.existsSync(path.join(dir, 'server.js')) &&
            fs.existsSync(path.join(dir, 'src', 'cli.js')));
    }
    /**
     * Checks if node_modules are installed in the given InkDown directory.
     */
    hasDependencies(dir) {
        return fs.existsSync(path.join(dir, 'node_modules'));
    }
    /**
     * Installs dependencies in the given directory.
     */
    async ensureDependencies(dir) {
        if (this.hasDependencies(dir)) {
            this.depsInstalled = true;
            return;
        }
        const choice = await vscode.window.showInformationMessage('InkDown: Dependencies not installed. Install them now? (requires Node.js)', 'Install', 'Cancel');
        if (choice !== 'Install') {
            throw new Error('InkDown dependencies not installed. Run `npm install` in the InkDown directory.');
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'InkDown: Installing dependencies…',
            cancellable: false,
        }, () => new Promise((resolve, reject) => {
            const proc = cp.spawn('npm', ['install', '--production'], {
                cwd: dir,
                stdio: 'pipe',
                shell: true,
            });
            let stderr = '';
            proc.stderr?.on('data', (d) => (stderr += d.toString()));
            proc.on('close', (code) => {
                if (code === 0) {
                    this.depsInstalled = true;
                    resolve();
                }
                else {
                    reject(new Error(`npm install failed (code ${code}): ${stderr.trim()}`));
                }
            });
            proc.on('error', reject);
        }));
    }
    /**
     * Detects the InkDown installation path by checking multiple locations
     * in order of priority:
     *   1. User-configured path (inkdown.inkdownPath setting)
     *   2. Bundled copy within the extension
     *   3. Global npm installation
     *   4. Workspace folders (for development)
     */
    async detectInkDownPath() {
        // Return cached result if available
        if (this.resolvedPath && this.isValidInkDownDir(this.resolvedPath)) {
            return this.resolvedPath;
        }
        const config = vscode.workspace.getConfiguration('inkdown');
        // 1. User-configured path
        const configured = config.get('inkdownPath', '');
        if (configured && this.isValidInkDownDir(configured)) {
            this.resolvedPath = configured;
            return configured;
        }
        // 2. Bundled copy within the extension
        const bundledPath = path.join(this.context.extensionPath, 'bundled');
        if (this.isValidInkDownDir(bundledPath)) {
            this.resolvedPath = bundledPath;
            return bundledPath;
        }
        // 3. Check if extension is inside the InkDown repo (development mode)
        const parentDir = path.resolve(this.context.extensionPath, '..');
        if (this.isValidInkDownDir(parentDir)) {
            this.resolvedPath = parentDir;
            return parentDir;
        }
        // 4. Global npm installation
        const globalPath = await this.findGlobalInkDown();
        if (globalPath) {
            this.resolvedPath = globalPath;
            return globalPath;
        }
        // 5. Workspace folders
        const folders = vscode.workspace.workspaceFolders ?? [];
        for (const folder of folders) {
            const p = folder.uri.fsPath;
            if (this.isValidInkDownDir(p)) {
                this.resolvedPath = p;
                return p;
            }
        }
        return null;
    }
    /**
     * Attempts to find a global npm installation of inkdown.
     */
    async findGlobalInkDown() {
        return new Promise((resolve) => {
            cp.exec('npm root -g', { timeout: 5000 }, (err, stdout) => {
                if (err) {
                    resolve(null);
                    return;
                }
                const globalRoot = stdout.trim();
                const inkdownGlobal = path.join(globalRoot, 'inkdown');
                if (this.isValidInkDownDir(inkdownGlobal)) {
                    resolve(inkdownGlobal);
                }
                else {
                    resolve(null);
                }
            });
        });
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