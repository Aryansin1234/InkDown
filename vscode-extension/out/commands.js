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
exports.registerCommands = registerCommands;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const inkdownClient_1 = require("./inkdownClient");
const previewPanel_1 = require("./previewPanel");
function registerCommands(context, serverManager) {
    const client = new inkdownClient_1.InkDownClient(serverManager);
    context.subscriptions.push(vscode.commands.registerCommand('inkdown.convertToPdf', (uri) => runConvert(uri, 'pdf', client, false)), vscode.commands.registerCommand('inkdown.convertToDocx', (uri) => runConvert(uri, 'docx', client, false)), vscode.commands.registerCommand('inkdown.convertWithOptions', (uri) => runConvert(uri, null, client, true)), vscode.commands.registerCommand('inkdown.openPreview', () => previewPanel_1.PreviewPanel.createOrShow(context.extensionUri)), vscode.commands.registerCommand('inkdown.startServer', async () => {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'InkDown: Starting server…',
                cancellable: false,
            }, () => serverManager.start());
            vscode.window.showInformationMessage('InkDown server is running.');
        }
        catch (e) {
            vscode.window.showErrorMessage(`InkDown: Failed to start server — ${e instanceof Error ? e.message : String(e)}`);
        }
    }), vscode.commands.registerCommand('inkdown.stopServer', () => {
        serverManager.stop();
        vscode.window.showInformationMessage('InkDown server stopped.');
    }));
}
async function runConvert(uri, format, client, promptOptions) {
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
    let options = {
        format: (format ?? config.get('defaultFormat', 'pdf')),
        title: baseName,
        toc: config.get('defaultToc', false),
        autoBreak: config.get('defaultAutoBreak', false),
    };
    if (promptOptions) {
        const picked = await gatherOptions(options);
        if (!picked) {
            return;
        }
        options = picked;
    }
    const outDir = config.get('outputDirectory', '') || path.dirname(sourcePath);
    // Use the custom title for the output filename if the user changed it
    const outName = options.title && options.title !== baseName
        ? options.title.replace(/[/\\?%*:|"<>]/g, '-')
        : baseName;
    const outputPath = path.join(outDir, `${outName}.${options.format}`);
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `InkDown: Converting to ${options.format.toUpperCase()}…`,
            cancellable: false,
        }, (progress) => client.convert(sourcePath, outputPath, options, progress));
        const label = path.basename(outputPath);
        const openAfter = config.get('openAfterConvert', true);
        if (openAfter) {
            vscode.window
                .showInformationMessage(`InkDown: Saved ${label}`, 'Open File')
                .then((action) => {
                if (action === 'Open File') {
                    vscode.env.openExternal(vscode.Uri.file(outputPath));
                }
            });
        }
        else {
            vscode.window.showInformationMessage(`InkDown: Saved ${label}`);
        }
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes('pandoc is not installed')) {
            const action = await vscode.window.showErrorMessage('InkDown: DOCX conversion requires Pandoc. Install it now?', 'Install with Homebrew', 'Show Instructions');
            if (action === 'Install with Homebrew') {
                const terminal = vscode.window.createTerminal('InkDown — Install Pandoc');
                terminal.show();
                terminal.sendText('brew install pandoc && echo "\\n✓ Pandoc installed. Try converting again."');
            }
            else if (action === 'Show Instructions') {
                vscode.env.openExternal(vscode.Uri.parse('https://pandoc.org/installing.html'));
            }
            return;
        }
        vscode.window.showErrorMessage(`InkDown: Conversion failed — ${msg}`);
    }
}
async function gatherOptions(defaults) {
    const formatItems = [
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
    const formatPick = await vscode.window.showQuickPick(formatItems, {
        placeHolder: 'Select output format',
        title: 'InkDown — Step 1 of 3: Format',
    });
    if (!formatPick) {
        return undefined;
    }
    const title = await vscode.window.showInputBox({
        prompt: 'Document title (leave blank to use the filename)',
        value: defaults.title ?? '',
        title: 'InkDown — Step 2 of 3: Title',
    });
    if (title === undefined) {
        return undefined;
    }
    const optionItems = [
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
    const extras = await vscode.window.showQuickPick(optionItems, {
        placeHolder: 'Toggle optional features (Space to select, Enter to confirm)',
        title: 'InkDown — Step 3 of 3: Options',
        canPickMany: true,
    });
    if (!extras) {
        return undefined;
    }
    return {
        format: formatPick.value,
        title: title.trim() || (defaults.title ?? ''),
        toc: extras.some((e) => e.id === 'toc'),
        autoBreak: extras.some((e) => e.id === 'autoBreak'),
    };
}
//# sourceMappingURL=commands.js.map