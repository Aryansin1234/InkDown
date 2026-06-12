import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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
    vscode.commands.registerCommand('inkdown.convertToHtml', (uri?: vscode.Uri) =>
      runConvert(uri, 'html', client, false)
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
    }),

    // ── Batch export (E2) ──────────────────────────────────
    vscode.commands.registerCommand('inkdown.batchExportFolder', async (uri?: vscode.Uri) => {
      const folderUri = uri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!folderUri) {
        vscode.window.showErrorMessage('InkDown: No folder selected.');
        return;
      }
      const pattern = new vscode.RelativePattern(folderUri, '**/*.md');
      const mdFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
      if (mdFiles.length === 0) {
        vscode.window.showInformationMessage('InkDown: No Markdown files found in the selected folder.');
        return;
      }
      const config = vscode.workspace.getConfiguration('inkdown');
      const format = config.get<string>('defaultFormat', 'pdf') as ConvertOptions['format'];
      const outDir = config.get<string>('outputDirectory', '') || folderUri.fsPath;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `InkDown: Exporting ${mdFiles.length} files…`, cancellable: false },
        async (progress) => {
          const cli = new InkDownClient(serverManager);
          let done = 0;
          let errors = 0;
          for (const fileUri of mdFiles) {
            const baseName  = path.basename(fileUri.fsPath, '.md');
            const outputPath = path.join(outDir, `${baseName}.${format}`);
            try {
              await cli.convert(fileUri.fsPath, outputPath, { format, title: baseName });
              done++;
            } catch {
              errors++;
            }
            progress.report({ message: `${done + errors}/${mdFiles.length}` });
          }
          vscode.window.showInformationMessage(
            `InkDown: Batch export complete — ${done} succeeded${errors > 0 ? `, ${errors} failed` : ''}.`
          );
        }
      );
    }),

    // ── Toggle auto-export (E1) ────────────────────────────
    vscode.commands.registerCommand('inkdown.toggleAutoExport', () => {
      const config  = vscode.workspace.getConfiguration('inkdown');
      const current = config.get<boolean>('autoExport', false);
      config.update('autoExport', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `InkDown: Auto-export on save is now ${!current ? 'enabled' : 'disabled'}.`
      );
    })
  );

  // ── Auto-export on save (E1) ───────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (doc.languageId !== 'markdown') { return; }
      const config = vscode.workspace.getConfiguration('inkdown');
      if (!config.get<boolean>('autoExport', false)) { return; }

      const format  = config.get<string>('autoExportFormat', 'pdf') as ConvertOptions['format'];
      const outDir  = config.get<string>('outputDirectory', '') || path.dirname(doc.uri.fsPath);
      const baseName = path.basename(doc.uri.fsPath, '.md');
      const outputPath = path.join(outDir, `${baseName}.${format}`);
      const cli = new InkDownClient(serverManager);

      try {
        await cli.convert(doc.uri.fsPath, outputPath, { format, title: baseName });
        vscode.window.setStatusBarMessage(`InkDown: Saved ${baseName}.${format}`, 3000);
      } catch (e: unknown) {
        vscode.window.showErrorMessage(
          `InkDown: Auto-export failed — ${e instanceof Error ? e.message : String(e)}`
        );
      }
    })
  );
}

function getPandocInstallOption(): { label: string; command: string } | null {
  switch (process.platform) {
    case 'darwin':
      return {
        label: 'Install with Homebrew',
        command: 'brew install pandoc && echo "\\n✓ Pandoc installed. Try converting again."',
      };
    case 'win32':
      return {
        label: 'Install on Windows (winget/choco)',
        command:
          'powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Command winget -ErrorAction SilentlyContinue) { winget install --id JohnMacFarlane.Pandoc -e --accept-package-agreements --accept-source-agreements } elseif (Get-Command choco -ErrorAction SilentlyContinue) { choco install pandoc -y } else { Write-Host \"Install Pandoc from https://pandoc.org/installing.html\" }"',
      };
    default:
      return null;
  }
}

async function runConvert(
  uri: vscode.Uri | undefined,
  format: ConvertOptions['format'] | null,
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
  const workspaceConfig = loadWorkspaceConfig();
  const sourcePath = fileUri.fsPath;
  const baseName = path.basename(sourcePath, '.md');

  let options: ConvertOptions = {
    format: (format ?? config.get<string>('defaultFormat', 'pdf') ?? workspaceConfig.format ?? 'pdf') as ConvertOptions['format'],
    title: baseName,
    toc: workspaceConfig.toc ?? config.get<boolean>('defaultToc', false),
    autoBreak: workspaceConfig.autoBreak ?? config.get<boolean>('defaultAutoBreak', false),
    pageSize: workspaceConfig.pageSize ?? 'A4',
    referenceDoc: workspaceConfig.referenceDoc,
  };

  if (promptOptions) {
    const picked = await gatherOptions(options, sourcePath, client);
    if (!picked) { return; }
    options = picked;
  }

  const outDir = config.get<string>('outputDirectory', '') || workspaceConfig.outputDirectory || path.dirname(sourcePath);
  // Use the custom title for the output filename if the user changed it
  const outName = options.title && options.title !== baseName
    ? options.title.replace(/[/\\?%*:|"<>]/g, '-')
    : baseName;
  const outputPath = path.join(outDir, `${outName}.${options.format}`);

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
    const msg = e instanceof Error ? e.message : String(e);

    if (msg.toLowerCase().includes('pandoc is not installed')) {
      const installOption = getPandocInstallOption();
      const actions = installOption
        ? [installOption.label, 'Show Instructions']
        : ['Show Instructions'];
      const action = await vscode.window.showErrorMessage(
        'InkDown: DOCX conversion requires Pandoc. Install it now?',
        ...actions
      );
      if (installOption && action === installOption.label) {
        const terminal = vscode.window.createTerminal('InkDown — Install Pandoc');
        terminal.show();
        terminal.sendText(installOption.command);
      } else if (action === 'Show Instructions') {
        vscode.env.openExternal(vscode.Uri.parse('https://pandoc.org/installing.html'));
      }
      return;
    }

    vscode.window.showErrorMessage(
      `InkDown: Conversion failed — ${msg}`
    );
  }
}

interface FormatItem extends vscode.QuickPickItem {
  value: 'pdf' | 'docx' | 'html';
}

interface OptionItem extends vscode.QuickPickItem {
  id: string;
}

// ── YAML frontmatter helpers ────────────────────────────────────────────
/** Returns the frontmatter block (without delimiters) if one exists, else null. */
function parseFrontmatter(content: string): { body: string; fm: Record<string, string> } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) { return { body: content, fm: {} }; }
  const fm: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (m) { fm[m[1]] = m[2]; }
  }
  return { body: content.slice(match[0].length), fm };
}

/** Serialises a frontmatter map back to a YAML string. */
function serialiseFrontmatter(fm: Record<string, string>): string {
  if (Object.keys(fm).length === 0) { return ''; }
  const lines = Object.entries(fm)
    .filter(([, v]) => v.trim() !== '')
    .map(([k, v]) => `${k}: "${v}"`);
  return lines.length === 0 ? '' : `---\n${lines.join('\n')}\n---\n\n`;
}

/**
 * Reads `filePath`, merges `updates` into the YAML frontmatter, and writes
 * the file back. Returns the updated frontmatter values so the caller can
 * pass them to the converter without re-reading the file.
 */
function upsertFrontmatter(
  filePath: string,
  updates: Record<string, string>
): Record<string, string> {
  const original = fs.readFileSync(filePath, 'utf-8');
  const { body, fm } = parseFrontmatter(original);
  const merged: Record<string, string> = { ...fm, ...updates };
  // Remove keys the user explicitly cleared
  for (const [k, v] of Object.entries(updates)) {
    if (v.trim() === '') { delete merged[k]; }
  }
  const newContent = serialiseFrontmatter(merged) + body;
  fs.writeFileSync(filePath, newContent, 'utf-8');
  return merged;
}

// ── gatherOptions wizard ────────────────────────────────────────────────

/** Full metadata for each bundled theme — used to build rich QuickPick items. */
interface BundledThemeMeta {
  name: string;
  description: string;
  file: string;
  font: string;
  palette: string;
  useCase: string;
}

const BUNDLED_THEMES: BundledThemeMeta[] = [
  {
    name: 'Default',
    description: 'Clean GitHub-inspired stylesheet',
    file: '',
    font: 'System sans-serif / Inter',
    palette: 'Black & grey · White background',
    useCase: 'General purpose',
  },
  {
    name: 'Modern',
    description: 'Teal accents, generous whitespace',
    file: 'modern.css',
    font: 'Inter / DM Sans',
    palette: 'Teal #0d9488 · White background',
    useCase: 'Product docs & handbooks',
  },
  {
    name: 'Academic',
    description: 'Justified serif, LaTeX-inspired',
    file: 'academic.css',
    font: 'Palatino / Georgia  (serif)',
    palette: 'Dark ink · White background',
    useCase: 'Research papers & formal reports',
  },
  {
    name: 'Corporate',
    description: 'Professional business look',
    file: 'corporate.css',
    font: 'Calibri / Segoe UI',
    palette: 'Navy #1a1a2e · Grey accents',
    useCase: 'Business reports & proposals',
  },
  {
    name: 'Dark',
    description: 'Dark background, easy on the eyes',
    file: 'dark.css',
    font: 'JetBrains Mono / Fira Code',
    palette: 'Cyan #64ffda · Near-black background',
    useCase: 'Code-heavy docs & night reading',
  },
  {
    name: 'Warm',
    description: 'Amber tones, inviting feel',
    file: 'warm.css',
    font: 'Lora / Georgia  (serif)',
    palette: 'Amber #b45309 · Cream background',
    useCase: 'Essays & creative writing',
  },
  {
    name: 'Minimal',
    description: 'Stripped-back, timeless serif',
    file: 'minimal.css',
    font: 'Georgia / Cambria  (serif)',
    palette: 'Near-black · Pure white background',
    useCase: 'Clean professional documents',
  },
];

interface ThemeItem extends vscode.QuickPickItem {
  themePath?: string | undefined;
  isBrowse?: boolean;
}

async function pickTheme(
  client: InkDownClient,
  current: string | undefined,
  title: string
): Promise<string | undefined | null> {
  const themesDir = await client.getThemesDir();

  const items: ThemeItem[] = BUNDLED_THEMES.map((t) => {
    const fullPath = themesDir && t.file ? path.join(themesDir, t.file) : undefined;
    const isActive = t.file === '' ? !current : current === fullPath;
    return {
      label: `$(paintcan) ${t.name}`,
      description: t.palette,
      detail: `${t.description}  ·  Font: ${t.font}  ·  Best for: ${t.useCase}`,
      picked: isActive,
      themePath: fullPath,
      isBrowse: false,
    };
  });

  items.push({ label: 'Custom', kind: vscode.QuickPickItemKind.Separator });
  items.push({
    label: '$(file-code) Browse for CSS…',
    description: 'Select a custom .css file from disk',
    detail: 'Upload any stylesheet to fully control the document appearance',
    themePath: undefined,
    isBrowse: true,
  });

  const pick = await vscode.window.showQuickPick<ThemeItem>(items, {
    placeHolder: 'Choose a CSS theme for the output document',
    title,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!pick) { return null; }

  if (pick.isBrowse) {
    const files = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'CSS files': ['css'] },
      title: 'Select a custom CSS theme',
    });
    return files?.[0]?.fsPath;
  }

  return pick.themePath;
}

async function gatherOptions(
  defaults: ConvertOptions,
  sourcePath: string,
  client: InkDownClient
): Promise<ConvertOptions | undefined> {
  // ── Step 1: Format ──────────────────────────────────────────
  const formatItems: FormatItem[] = [
    { label: '$(file-pdf) PDF',    description: 'Print-quality PDF via Puppeteer', value: 'pdf',  picked: defaults.format === 'pdf' },
    { label: '$(file-text) DOCX',  description: 'Microsoft Word document via Pandoc', value: 'docx', picked: defaults.format === 'docx' },
    { label: '$(globe) HTML',      description: 'Self-contained HTML with live Mermaid & KaTeX', value: 'html', picked: defaults.format === 'html' },
  ];
  const formatPick = await vscode.window.showQuickPick<FormatItem>(formatItems, {
    placeHolder: 'Select output format',
    title: 'InkDown — Step 1: Format',
  });
  if (!formatPick) { return undefined; }

  // ── Step 2: Document metadata ───────────────────────────────
  // Read existing frontmatter to pre-fill fields
  let existingFm: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(sourcePath, 'utf-8');
    existingFm = parseFrontmatter(raw).fm;
  } catch { /* file unreadable, proceed with empty */ }

  const title = await vscode.window.showInputBox({
    prompt: 'Document title  (leave blank to use the filename)',
    value: existingFm.title ?? defaults.title ?? '',
    title: 'InkDown — Step 2a: Title',
  });
  if (title === undefined) { return undefined; }

  const author = await vscode.window.showInputBox({
    prompt: 'Author  (optional, leave blank to omit)',
    value: existingFm.author ?? '',
    title: 'InkDown — Step 2b: Author',
  });
  if (author === undefined) { return undefined; }

  const date = await vscode.window.showInputBox({
    prompt: 'Date  (optional, e.g. "June 2026")',
    value: existingFm.date ?? '',
    title: 'InkDown — Step 2c: Date',
  });
  if (date === undefined) { return undefined; }

  const watermark = await vscode.window.showInputBox({
    prompt: 'Watermark text  (optional, e.g. "DRAFT", "CONFIDENTIAL")',
    value: existingFm.watermark ?? '',
    title: 'InkDown — Step 2d: Watermark',
  });
  if (watermark === undefined) { return undefined; }

  // ── Step 3: Format-specific options ────────────────────────
  let pageSize = defaults.pageSize ?? 'A4';
  let referenceDoc = defaults.referenceDoc;
  let theme = defaults.theme;

  if (formatPick.value === 'pdf') {
    // Page size
    const pageSizeItems = [
      { label: 'A4',     description: '210 × 297 mm  (default)', picked: pageSize === 'A4' },
      { label: 'Letter', description: '8.5 × 11 in',             picked: pageSize === 'Letter' },
      { label: 'A3',     description: '297 × 420 mm',            picked: pageSize === 'A3' },
      { label: 'A5',     description: '148 × 210 mm',            picked: pageSize === 'A5' },
      { label: 'Legal',  description: '8.5 × 14 in',             picked: pageSize === 'Legal' },
    ];
    const sizePick = await vscode.window.showQuickPick(pageSizeItems, {
      placeHolder: 'Select page size',
      title: 'InkDown — Step 3a: Page Size',
    });
    if (!sizePick) { return undefined; }
    pageSize = sizePick.label;

    // CSS theme
    const pickedTheme = await pickTheme(client, theme, 'InkDown — Step 3b: CSS Theme  (PDF · 7 bundled styles)');
    if (pickedTheme === null) { return undefined; }
    theme = pickedTheme;

  } else if (formatPick.value === 'docx') {
    // DOCX reference template
    const currentDocLabel = referenceDoc
      ? `$(check) Keep current: ${path.basename(referenceDoc)}`
      : null;
    const templateItems = [
      { label: '$(file-text) Default template',     description: 'Built-in InkDown Word styles',     picked: !referenceDoc },
      { label: '$(folder-opened) Browse for .docx…', description: 'Pick a custom reference document' },
      ...(currentDocLabel ? [{ label: currentDocLabel, description: referenceDoc!, picked: true }] : []),
    ];
    const templatePick = await vscode.window.showQuickPick(templateItems, {
      placeHolder: 'Select DOCX template',
      title: 'InkDown — Step 3: DOCX Reference Template',
    });
    if (!templatePick) { return undefined; }
    if (templatePick.label.includes('Browse')) {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Word Documents': ['docx'] },
        title: 'Select a .docx reference template',
      });
      if (picked && picked[0]) { referenceDoc = picked[0].fsPath; }
    } else if (templatePick.label.includes('Default')) {
      referenceDoc = undefined;
    }

    // CSS does not apply to DOCX — Pandoc uses Word styles from the reference template above.
    theme = undefined;

  } else {
    // HTML: CSS theme picker
    const pickedThemeHtml = await pickTheme(client, theme, 'InkDown — Step 3: CSS Theme  (HTML · 7 bundled styles)');
    if (pickedThemeHtml === null) { return undefined; }
    theme = pickedThemeHtml;
  }

  // ── Step 4: General options ─────────────────────────────────
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
    {
      label: '$(pencil) Write options to YAML frontmatter',
      description: 'Save title / author / date / watermark back into the .md file',
      id: 'writeFm',
      picked: true,
    },
  ];

  const extras = await vscode.window.showQuickPick<OptionItem>(optionItems, {
    placeHolder: 'Toggle options  (Space to select, Enter to confirm)',
    title: 'InkDown — Step 4: Options',
    canPickMany: true,
  });
  if (!extras) { return undefined; }

  // ── Write frontmatter back if requested ────────────────────
  if (extras.some((e) => e.id === 'writeFm')) {
    const fmUpdates: Record<string, string> = {};
    if (title.trim())     { fmUpdates.title     = title.trim(); }
    if (author.trim())    { fmUpdates.author    = author.trim(); }
    if (date.trim())      { fmUpdates.date      = date.trim(); }
    if (watermark.trim()) { fmUpdates.watermark = watermark.trim(); }
    if (Object.keys(fmUpdates).length > 0) {
      upsertFrontmatter(sourcePath, fmUpdates);
    }
  }

  return {
    format: formatPick.value,
    title:     title.trim()     || (defaults.title ?? ''),
    author:    author.trim()    || undefined,
    toc:       extras.some((e) => e.id === 'toc'),
    autoBreak: extras.some((e) => e.id === 'autoBreak'),
    pageSize,
    referenceDoc,
    theme,
    watermark: watermark.trim() || undefined,
  };
}

// ── Workspace config (.inkdown.json) ─────────────────────────
// Reads project-level defaults from .inkdown.json in the workspace root.
// These fill in settings not explicitly set by the user in VS Code settings.
interface WorkspaceConfig extends Partial<ConvertOptions> {
  outputDirectory?: string;
}

function loadWorkspaceConfig(): WorkspaceConfig {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) { return {}; }

  for (const folder of folders) {
    const configPath = path.join(folder.uri.fsPath, '.inkdown.json');
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw) as WorkspaceConfig;
      } catch {
        // Invalid JSON — silently ignore, use defaults
      }
    }
  }
  return {};
}
