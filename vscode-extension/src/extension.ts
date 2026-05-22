import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { StatusBarManager } from './statusBar';
import { ServerManager } from './serverManager';

let statusBar: StatusBarManager;
let serverManager: ServerManager;

export function activate(context: vscode.ExtensionContext): void {
  serverManager = new ServerManager(context);
  statusBar = new StatusBarManager(serverManager);

  registerCommands(context, serverManager);
  statusBar.register(context);

  // Silently check if InkDown is available — only warn on first conversion failure.
  // This avoids noisy warnings in workspaces where the user hasn't converted yet.
  serverManager.detectInkDownPath();
  // If not found, don't warn on activation. The error will surface
  // when the user actually tries to convert, with actionable guidance.
}

export function deactivate(): void {
  statusBar?.dispose();
  serverManager?.stop();
}
