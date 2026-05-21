import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

export type ServerStatus = 'running' | 'stopped';

export class ServerManager {
  private process: cp.ChildProcess | null = null;
  private readonly _onStatusChange = new vscode.EventEmitter<ServerStatus>();
  readonly onStatusChange = this._onStatusChange.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async detectInkDownPath(): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('inkdown');
    const configured = config.get<string>('inkdownPath', '');

    if (configured && fs.existsSync(path.join(configured, 'server.js'))) {
      return configured;
    }

    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const p = folder.uri.fsPath;
      if (
        fs.existsSync(path.join(p, 'server.js')) &&
        fs.existsSync(path.join(p, 'src', 'cli.js'))
      ) {
        await config.update('inkdownPath', p, vscode.ConfigurationTarget.Workspace);
        return p;
      }
    }

    return null;
  }

  async getInkDownPath(): Promise<string | null> {
    return this.detectInkDownPath();
  }

  async start(): Promise<void> {
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

    await this.waitForServer(10_000);
    this._onStatusChange.fire('running');
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this._onStatusChange.fire('stopped');
  }

  async isRunning(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('inkdown');
    const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');
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
      } catch {
        resolve(false);
      }
    });
  }

  private async waitForServer(maxMs: number): Promise<void> {
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
