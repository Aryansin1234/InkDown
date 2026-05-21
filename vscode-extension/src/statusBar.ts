import * as vscode from 'vscode';
import { ServerManager, ServerStatus } from './serverManager';

export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly serverManager: ServerManager) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.render('stopped');

    serverManager.onStatusChange((status) => this.render(status));

    // Reflect actual server state on startup
    serverManager.isRunning().then((running) => this.render(running ? 'running' : 'stopped'));
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.item);
    this.item.show();
  }

  private render(status: ServerStatus): void {
    if (status === 'running') {
      this.item.text = '$(check) InkDown';
      this.item.tooltip = 'InkDown server is running — click to stop';
      this.item.backgroundColor = undefined;
      this.item.command = 'inkdown.stopServer';
    } else {
      this.item.text = '$(circle-slash) InkDown';
      this.item.tooltip = 'InkDown server stopped — click to start';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.item.command = 'inkdown.startServer';
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
