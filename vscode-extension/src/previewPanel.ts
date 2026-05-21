import * as vscode from 'vscode';

const PREVIEW_TYPE = 'inkdownPreview';
const DEBOUNCE_MS = 250;

export class PreviewPanel {
  static currentPanel: PreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    // Snapshot the active markdown document BEFORE creating the panel.
    // Panel creation (ViewColumn.Beside) can transiently clear activeTextEditor,
    // so we must capture the reference now.
    const activeEditor = vscode.window.activeTextEditor;
    const initialDoc =
      activeEditor?.document.languageId === 'markdown' ? activeEditor.document : undefined;

    if (PreviewPanel.currentPanel) {
      PreviewPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside, true);
      PreviewPanel.currentPanel.syncWithActiveEditor(initialDoc);
      return;
    }

    const title = initialDoc
      ? `InkDown: ${initialDoc.fileName.split('/').pop() ?? 'Preview'}`
      : 'InkDown Preview';

    const panel = vscode.window.createWebviewPanel(
      PREVIEW_TYPE,
      title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri, initialDoc);
  }

  // pendingMarkdown is only used for *live update* postMessage delivery.
  // The very first render is handled by embedding the markdown in the HTML.
  private pendingMarkdown: string | undefined;

  private static getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    _extensionUri: vscode.Uri,
    initialDoc?: vscode.TextDocument
  ) {
    this.panel = panel;
    // Embed the initial markdown directly in the HTML so the preview renders
    // immediately — no postMessage round-trip needed for the first paint.
    this.panel.webview.html = this.buildHtml(
      PreviewPanel.getNonce(),
      initialDoc?.getText() ?? ''
    );

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((msg) => {
        // 'ready' is still sent by the webview; use it to push any update that
        // arrived while the webview was reloading / hidden.
        if (msg.type === 'ready' && this.pendingMarkdown !== undefined) {
          void this.panel.webview.postMessage({ type: 'update', markdown: this.pendingMarkdown });
          this.pendingMarkdown = undefined;
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (
          e.document === vscode.window.activeTextEditor?.document &&
          e.document.languageId === 'markdown'
        ) {
          this.scheduleUpdate(e.document.getText());
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.languageId === 'markdown') {
          const name = editor.document.fileName.split('/').pop() ?? 'Preview';
          this.panel.title = `InkDown: ${name}`;
          this.push(editor.document.getText());
        }
      }),
      this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
    );
  }

  private syncWithActiveEditor(doc?: vscode.TextDocument): void {
    const d = doc ?? vscode.window.activeTextEditor?.document;
    if (d?.languageId === 'markdown') {
      const name = d.fileName.split('/').pop() ?? 'Preview';
      this.panel.title = `InkDown: ${name}`;
      this.push(d.getText());
    }
  }

  private scheduleUpdate(markdown: string): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.debounceTimer = setTimeout(() => this.push(markdown), DEBOUNCE_MS);
  }

  private push(markdown: string): void {
    // Store as pending in case the webview isn't ready yet; cleared on 'ready' ack
    this.pendingMarkdown = markdown;
    void this.panel.webview.postMessage({ type: 'update', markdown });
  }

  private buildHtml(nonce: string, initialMarkdown: string): string {
    // Safely embed initial markdown as JSON so it can be read without any
    // postMessage round-trip.  Escape </script> so the HTML parser can't be
    // tricked into ending the element early.
    const initialDataJson = JSON.stringify(initialMarkdown).replace(/<\//g, '<\\/');
    // CDN versions pinned for stability
    const markedCdn = 'https://cdn.jsdelivr.net/npm/marked@13/marked.min.js';
    const hljsCdn = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
    const hljsCss = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    const hljsCssDark = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
    const katexCss = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
    const katexJs = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    const katexAutoRender = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js';
    const mermaidJs = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Initial markdown embedded directly — no postMessage needed for first paint -->
  <script id="inkdown-initial-data" type="application/json" nonce="${nonce}">${initialDataJson}</script>
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
    script-src 'nonce-${nonce}' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;
    img-src data: https: blob:;
    font-src https://cdn.jsdelivr.net;
    connect-src https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;
    worker-src blob:;
  ">
  <title>InkDown Preview</title>
  <link id="hljs-light" rel="stylesheet" href="${hljsCss}">
  <link id="hljs-dark"  rel="stylesheet" href="${hljsCssDark}" disabled>
  <link rel="stylesheet" href="${katexCss}">
  <script nonce="${nonce}" src="${markedCdn}"></script>
  <script nonce="${nonce}" src="${hljsCdn}"></script>
  <script nonce="${nonce}" src="${katexJs}"></script>
  <script nonce="${nonce}" src="${katexAutoRender}"></script>
  <script nonce="${nonce}" src="${mermaidJs}"></script>
  <style>
    :root {
      --bg:       #ffffff;
      --text:     #24292e;
      --border:   #e1e4e8;
      --code-bg:  #f6f8fa;
      --bq-border:#dfe2e5;
      --bq-color: #6a737d;
      --link:     #0366d6;
      --heading-border: #eaecef;
    }
    .vscode-dark, .vscode-high-contrast {
      --bg:       #0d1117;
      --text:     #c9d1d9;
      --border:   #30363d;
      --code-bg:  #161b22;
      --bq-border:#3b434b;
      --bq-color: #8b949e;
      --link:     #58a6ff;
      --heading-border: #21262d;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 15px;
      line-height: 1.7;
      color: var(--text);
      background: var(--bg);
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 2.5rem 6rem;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
      line-height: 1.25;
    }
    h1 { font-size: 2em;   border-bottom: 1px solid var(--heading-border); padding-bottom: .3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid var(--heading-border); padding-bottom: .3em; }
    h3 { font-size: 1.25em; }
    p { margin: 0.6em 0 1em; }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.875em;
      background: var(--code-bg);
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }
    pre {
      background: var(--code-bg);
      border-radius: 6px;
      padding: 1em 1.2em;
      overflow-x: auto;
      line-height: 1.5;
    }
    pre code {
      background: none;
      padding: 0;
      border-radius: 0;
      font-size: 0.875em;
    }
    blockquote {
      margin: 1em 0;
      padding: 0.5em 1em;
      color: var(--bq-color);
      border-left: 0.25em solid var(--bq-border);
      background: transparent;
    }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; overflow-x: auto; display: block; }
    th, td { border: 1px solid var(--border); padding: 6px 13px; }
    th { background: var(--code-bg); font-weight: 600; }
    tr:nth-child(even) td { background: var(--code-bg); }
    img { max-width: 100%; border-radius: 4px; }
    hr { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }
    .task-list-item { list-style-type: none; margin-left: -1.5em; }
    .task-list-item input { margin-right: 0.5em; }
    .mermaid-wrap { text-align: center; margin: 1.5em 0; }
    .mermaid-wrap svg { max-width: 100%; height: auto; }
    .mermaid-error { color: #cf222e; background: #fff8f0; border: 1px solid #ffa198;
                     border-radius: 4px; padding: 0.75em 1em; font-family: monospace; font-size: 0.85em; }
    #spinner {
      position: fixed; top: 12px; right: 16px;
      width: 20px; height: 20px;
      border: 2px solid var(--border);
      border-top-color: var(--link);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      opacity: 0;
      transition: opacity 0.1s;
    }
    #spinner.active { opacity: 1; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="spinner"></div>
  <div id="preview"></div>

  <script nonce="${nonce}">
    // ── Core references ───────────────────────────────────────────────────────
    const preview = document.getElementById('preview');
    const spinner = document.getElementById('spinner');
    const vscode  = acquireVsCodeApi();

    let mermaidCounter = 0;

    // ── Mermaid rendering ─────────────────────────────────────────────────────
    async function renderMermaidBlocks(container) {
      if (typeof mermaid === 'undefined') { return; }
      const placeholders = container.querySelectorAll('.mermaid-placeholder');
      for (const el of placeholders) {
        const code = el.getAttribute('data-code')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        const wrap = document.createElement('div');
        wrap.className = 'mermaid-wrap';
        try {
          const id = 'inkdown-mmd-' + (++mermaidCounter);
          const { svg } = await mermaid.render(id, code);
          wrap.innerHTML = svg;
        } catch (err) {
          wrap.innerHTML = '<div class="mermaid-error">Mermaid error: ' + err.message + '</div>';
        }
        el.replaceWith(wrap);
      }
    }

    // ── Render markdown → HTML ────────────────────────────────────────────────
    async function renderMarkdown(markdown) {
      spinner.classList.add('active');
      try {
        if (typeof marked === 'undefined') {
          throw new Error('marked.js did not load. Check network/CSP settings.');
        }
        const html = marked.parse(markdown);
        preview.innerHTML = typeof html === 'string' ? html : await html;

        if (typeof renderMathInElement !== 'undefined') {
          renderMathInElement(preview, {
            delimiters: [
              { left: '$$', right: '$$', display: true  },
              { left: '$',  right: '$',  display: false },
            ],
            throwOnError: false,
          });
        }

        await renderMermaidBlocks(preview);
      } catch (err) {
        preview.innerHTML =
          '<pre style="color:red;white-space:pre-wrap">InkDown preview error:\\n' +
          (err && err.message ? err.message : String(err)) + '</pre>';
      } finally {
        spinner.classList.remove('active');
      }
    }

    // ── Library initialisation (non-fatal) ────────────────────────────────────
    try {
      const body      = document.body;
      const hljsLight = document.getElementById('hljs-light');
      const hljsDark  = document.getElementById('hljs-dark');

      function applyTheme() {
        const dark = body.classList.contains('vscode-dark') ||
                     body.classList.contains('vscode-high-contrast');
        if (hljsLight) { hljsLight.disabled = dark; }
        if (hljsDark)  { hljsDark.disabled  = !dark; }
        if (typeof mermaid !== 'undefined') {
          mermaid.initialize({ startOnLoad: false,
            theme: dark ? 'dark' : 'default', securityLevel: 'loose' });
        }
      }

      applyTheme();
      new MutationObserver(applyTheme)
        .observe(body, { attributes: true, attributeFilter: ['class'] });

      if (typeof marked !== 'undefined') {
        const renderer = new marked.Renderer();

        renderer.code = function(token) {
          const code = token.text;
          const lang = (token.lang || '').toLowerCase();
          if (lang === 'mermaid') {
            const escaped = code.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            return '<div class="mermaid-placeholder" data-code="' + escaped + '"></div>';
          }
          if (typeof hljs !== 'undefined') {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            const highlighted = hljs.highlight(code, { language }).value;
            return '<pre><code class="hljs language-' + language + '">' + highlighted + '</code></pre>';
          }
          return '<pre><code>' + code + '</code></pre>';
        };

        renderer.listitem = function(token) {
          if (token.task) {
            const checked = token.checked ? 'checked' : '';
            return '<li class="task-list-item"><input type="checkbox" disabled ' + checked + '> ' +
                   token.text + '</li>';
          }
          return '<li>' + token.text + '</li>';
        };

        marked.use({ renderer, gfm: true, breaks: false, useNewRenderer: true });
      }
    } catch (initErr) {
      console.error('InkDown: library init error', initErr);
    }

    // ── Initial render from embedded data (no postMessage needed) ────────────
    try {
      const dataEl = document.getElementById('inkdown-initial-data');
      const initialMd = dataEl ? JSON.parse(dataEl.textContent) : '';
      if (initialMd) { void renderMarkdown(initialMd); }
    } catch (e) {
      console.error('InkDown: failed to parse initial data', e);
    }

    // ── Live-update listener (typing / editor switch) ─────────────────────────
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'update' && typeof msg.markdown === 'string') {
        void renderMarkdown(msg.markdown);
      }
    });

    // Tell the extension we are alive (so it can push a pending update if any)
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }

  dispose(): void {
    PreviewPanel.currentPanel = undefined;
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
