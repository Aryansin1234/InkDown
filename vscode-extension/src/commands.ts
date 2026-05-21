import * as vscode from 'vscode';
import * as path from 'path';
import { InkDownClient, ConvertOptions } from './inkdownClient';
import { PreviewPanel } from './previewPanel';
import { ServerManager } from './serverManager';

export function registerCommands(
  context: vscode.ExtensionContext,
  serverManager: ServerManager
): void {
  const client = new InkDownClient(serverManager);

  context.subscriptions.push(
    vscode.commands.registerCommand('inkdown.convertToPdf', (uri?: vscode.Uri) =>
      runConvert(uri, 'pdf', client, false)
    ),
    vscode.commands.registerCommand('inkdown.convertToDocx', (uri?: vscode.Uri) =>
      runConvert(uri, 'docx', client, false)
    ),
    vscode.commands.registerCommand('inkdown.convertWithOptions', (uri?: vscode.Uri) =>
      runConvert(uri, null, client, true)
    ),
    vscode.commands.registerCommand('inkdown.openPreview', () =>
      PreviewPanel.createOrShow(context.extensionUri)
    ),
    vscode.commands.registerCommand('inkdown.startServer', async () => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'InkDown: Starting server…',
            cancellable: false,
          },
          () => serverManager.start()
        );
        vscode.window.showInformationMessage('InkDown server is running.');
      } catch (e: unknown) {
        vscode.window.showErrorMessage(
          `InkDown: Failed to start server — ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }),
    vscode.commands.registerCommand('inkdown.stopServer', () => {
      serverManager.stop();
      vscode.window.showInformationMessage('InkDown server stopped.');
    })
  );
}

async function runConvert(
  uri: vscode.Uri | undefined,
  format: 'pdf' | 'docx' | null,
  client: InkDownClient,
  promptOptions: boolean
): Promise<void> {
  const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;

  if (!fileUri || fileUri.scheme !== 'file') {
    vscode.window.showErrorMessage('InkDown: Open a Markdown file (.md) to convert.');
    return;
  }
  if (path.extname(fileUri.fsPath).toLowerCase() !== '.md') {
    vscode.window.showErrorMessage('InkDown: Only .md files can be converted.');
    return;
  }

  const config = vscode.workspace.getConfiguration('inkdown');
  const sourcePath = fileUri.fsPath;
  const baseName = path.basename(sourcePath, '.md');

  let options: ConvertOptions = {
    format: (format ?? config.get<string>('defaultFormat', 'pdf')) as 'pdf' | 'docx',
    title: baseName,
    toc: config.get<boolean>('defaultToc', false),
    autoBreak: config.get<boolean>('defaultAutoBreak', false),
  };

  if (promptOptions) {
    const picked = await gatherOptions(options);
    if (!picked) { return; }
    options = picked;
  }

  const outDir = config.get<string>('outputDirectory', '') || path.dirname(sourcePath);
  const outputPath = path.join(outDir, `${baseName}.${options.format}`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `InkDown: Converting to ${options.format.toUpperCase()}…`,
        cancellable: false,
      },
      (progress) => client.convert(sourcePath, outputPath, options, progress)
    );

    const label = path.basename(outputPath);
    const openAfter = config.get<boolean>('openAfterConvert', true);

    if (openAfter) {
      vscode.window
        .showInformationMessage(`InkDown: Saved ${label}`, 'Open File')
        .then((action) => {
          if (action === 'Open File') {
            vscode.env.openExternal(vscode.Uri.file(outputPath));
          }
        });
    } else {
      vscode.window.showInformationMessage(`InkDown: Saved ${label}`);
    }
  } catch (e: unknown) {
    vscode.window.showErrorMessage(
      `InkDown: Conversion failed — ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

interface FormatItem extends vscode.QuickPickItem {
  value: 'pdf' | 'docx';
}

interface OptionItem extends vscode.QuickPickItem {
  id: string;
}

async function gatherOptions(defaults: ConvertOptions): Promise<ConvertOptions | undefined> {
  const formatItems: FormatItem[] = [
    {
      label: '$(file-pdf) PDF',
      description: 'A4, print-quality PDF',
      value: 'pdf',
      picked: defaults.format === 'pdf',
    },
    {
      label: '$(file-text) DOCX',
      description: 'Microsoft Word document',
      value: 'docx',
      picked: defaults.format === 'docx',
    },
  ];

  const formatPick = await vscode.window.showQuickPick<FormatItem>(formatItems, {
    placeHolder: 'Select output format',
    title: 'InkDown — Step 1 of 3: Format',
  });
  if (!formatPick) { return undefined; }

  const title = await vscode.window.showInputBox({
    prompt: 'Document title (leave blank to use the filename)',
    value: defaults.title ?? '',
    title: 'InkDown — Step 2 of 3: Title',
  });
  if (title === undefined) { return undefined; }

  const optionItems: OptionItem[] = [
    {
      label: '$(list-ordered) Table of Contents',
      description: 'Prepend an auto-generated TOC',
      id: 'toc',
      picked: defaults.toc ?? false,
    },
    {
      label: '$(symbol-ruler) Auto page breaks before H1',
      description: 'Insert a page break before every top-level heading',
      id: 'autoBreak',
      picked: defaults.autoBreak ?? false,
    },
  ];

  const extras = await vscode.window.showQuickPick<OptionItem>(optionItems, {
    placeHolder: 'Toggle optional features (Space to select, Enter to confirm)',
    title: 'InkDown — Step 3 of 3: Options',
    canPickMany: true,
  });
  if (!extras) { return undefined; }

  return {
    format: formatPick.value,
    title: title.trim() || (defaults.title ?? ''),
    toc: extras.some((e) => e.id === 'toc'),
    autoBreak: extras.some((e) => e.id === 'autoBreak'),
  };
}
