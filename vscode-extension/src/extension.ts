import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { StatusBarManager } from './statusBar';
import { ServerManager } from './serverManager';
import { WordCountStatusBar } from './wordCount';
import { MarkdownSymbolProvider } from './symbolProvider';

let statusBar: StatusBarManager;
let serverManager: ServerManager;
let wordCountBar: WordCountStatusBar;

export function activate(context: vscode.ExtensionContext): void {
  serverManager = new ServerManager(context);
  statusBar     = new StatusBarManager(serverManager);
  wordCountBar  = new WordCountStatusBar();

  registerCommands(context, serverManager);
  statusBar.register(context);
  wordCountBar.register(context);

  // Document symbol provider — headings appear in VS Code Outline panel (E7)
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'markdown' },
      new MarkdownSymbolProvider()
    )
  );

  // Silently check if InkDown is available — only warn on first conversion failure.
  serverManager.detectInkDownPath();
}

export function deactivate(): void {
  statusBar?.dispose();
  wordCountBar?.dispose();
  serverManager?.stop();
}
