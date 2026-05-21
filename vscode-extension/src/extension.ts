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

  serverManager.detectInkDownPath().then((found) => {
    if (!found) {
      vscode.window
        .showWarningMessage(
          'InkDown: Could not find an InkDown installation in this workspace. Configure `inkdown.inkdownPath` in settings.',
          'Open Settings'
        )
        .then((action) => {
          if (action === 'Open Settings') {
            vscode.commands.executeCommand(
              'workbench.action.openSettings',
              'inkdown.inkdownPath'
            );
          }
        });
    }
  });
}

export function deactivate(): void {
  statusBar?.dispose();
  serverManager?.stop();
}
