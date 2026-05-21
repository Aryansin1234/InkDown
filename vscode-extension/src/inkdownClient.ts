import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { ServerManager } from './serverManager';

export interface ConvertOptions {
  format: 'pdf' | 'docx';
  title?: string;
  toc?: boolean;
  autoBreak?: boolean;
  author?: string;
}

export class InkDownClient {
  constructor(private readonly serverManager: ServerManager) {}

  async convert(
    sourcePath: string,
    outputPath: string,
    options: ConvertOptions,
    progress?: vscode.Progress<{ message?: string }>
  ): Promise<void> {
    progress?.report({ message: 'Checking server…' });
    const serverRunning = await this.serverManager.isRunning();

    if (serverRunning) {
      progress?.report({ message: `Converting via API to ${options.format.toUpperCase()}…` });
      await this.convertViaApi(sourcePath, outputPath, options);
    } else {
      progress?.report({ message: `Converting via CLI to ${options.format.toUpperCase()}…` });
      await this.convertViaCli(sourcePath, outputPath, options);
    }
  }

  private async convertViaApi(
    sourcePath: string,
    outputPath: string,
    options: ConvertOptions
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('inkdown');
    const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');
    const apiKey = config.get<string>('apiKey', '');

    const markdown = fs.readFileSync(sourcePath, 'utf-8');
    const title = options.title ?? path.basename(sourcePath, '.md');

    const body: Record<string, unknown> = {
      markdown,
      format: options.format,
      title,
      toc: options.toc ?? false,
      autoBreak: options.autoBreak ?? false,
    };
    if (options.author) {
      body.author = options.author;
    }

    const jsonBody = JSON.stringify(body);
    const url = new URL('/api/v1/convert', serverUrl);
    const transport = url.protocol === 'https:' ? https : http;

    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonBody),
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers,
        },
        (res) => {
          if (res.statusCode !== 200) {
            let errBody = '';
            res.on('data', (d: Buffer) => (errBody += d.toString()));
            res.on('end', () =>
              reject(new Error(`API returned ${res.statusCode}: ${errBody}`))
            );
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.write(jsonBody);
      req.end();
    });

    fs.writeFileSync(outputPath, buffer);
  }

  private async convertViaCli(
    sourcePath: string,
    outputPath: string,
    options: ConvertOptions
  ): Promise<void> {
    const inkdownPath = await this.serverManager.getInkDownPath();
    if (!inkdownPath) {
      throw new Error(
        'InkDown not found. Set inkdown.inkdownPath in extension settings.'
      );
    }

    const cliPath = path.join(inkdownPath, 'src', 'cli.js');
    if (!fs.existsSync(cliPath)) {
      throw new Error(`InkDown CLI not found at: ${cliPath}`);
    }

    const args: string[] = [cliPath];
    if (options.toc) { args.push('--toc'); }
    if (options.autoBreak) { args.push('--auto-break'); }
    if (options.title) { args.push('--title', options.title); }
    args.push('--format', options.format);
    args.push(sourcePath, outputPath);

    await new Promise<void>((resolve, reject) => {
      const proc = cp.spawn('node', args, { cwd: inkdownPath, stdio: 'pipe' });
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`CLI exited with code ${code}: ${stderr.trim()}`));
        } else {
          resolve();
        }
      });
      proc.on('error', reject);
    });
  }
}
