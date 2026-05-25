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
exports.PreviewPanel = void 0;
const vscode = __importStar(require("vscode"));
const PREVIEW_TYPE = 'inkdownPreview';
const DEBOUNCE_MS = 250;
class PreviewPanel {
    static createOrShow(extensionUri) {
        // Snapshot the active markdown document BEFORE creating the panel.
        // Panel creation (ViewColumn.Beside) can transiently clear activeTextEditor,
        // so we must capture the reference now.
        const activeEditor = vscode.window.activeTextEditor;
        const initialDoc = activeEditor?.document.languageId === 'markdown' ? activeEditor.document : undefined;
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside, true);
            PreviewPanel.currentPanel.syncWithActiveEditor(initialDoc);
            return;
        }
        const title = initialDoc
            ? `InkDown: ${initialDoc.fileName.split('/').pop() ?? 'Preview'}`
            : 'InkDown Preview';
        const panel = vscode.window.createWebviewPanel(PREVIEW_TYPE, title, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [extensionUri],
        });
        PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri, initialDoc);
    }
    static getNonce() {
        let text = '';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return text;
    }
    constructor(panel, extensionUri, initialDoc) {
        this.disposables = [];
        this.lastEditorScrollLine = -1;
        this.ignoreEditorScroll = false;
        this.panel = panel;
        this.extensionUri = extensionUri;
        const initialMarkdown = initialDoc?.getText() ?? '';
        // Register all handlers BEFORE setting webview.html so no message is
        // ever missed due to a race condition.
        this.disposables.push(this.panel.webview.onDidReceiveMessage((msg) => {
            // 'ready' is sent when the webview script has executed.  Push any
            // pending live-update that arrived while the webview was reloading.
            if (msg.type === 'ready' && this.pendingMarkdown !== undefined) {
                void this.panel.webview.postMessage({ type: 'update', markdown: this.pendingMarkdown });
                this.pendingMarkdown = undefined;
            }
            // Scroll sync: preview scrolled → reveal line in editor
            if (msg.type === 'scrollSync' && typeof msg.line === 'number') {
                const editor = vscode.window.visibleTextEditors.find((e) => e.document.languageId === 'markdown' && e.viewColumn !== this.panel.viewColumn);
                if (editor) {
                    const line = Math.min(msg.line, editor.document.lineCount - 1);
                    // Suppress the editor scroll event from bouncing back
                    this.ignoreEditorScroll = true;
                    const range = new vscode.Range(line, 0, line, 0);
                    editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
                    setTimeout(() => { this.ignoreEditorScroll = false; }, 400);
                }
            }
        }), vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document === vscode.window.activeTextEditor?.document &&
                e.document.languageId === 'markdown') {
                this.scheduleUpdate(e.document.getText());
            }
        }), vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor?.document.languageId === 'markdown') {
                const name = editor.document.fileName.split('/').pop() ?? 'Preview';
                this.panel.title = `InkDown: ${name}`;
                this.push(editor.document.getText());
            }
        }), 
        // Scroll sync: editor scrolled → reveal line in preview (debounced)
        vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
            if (this.ignoreEditorScroll) {
                return;
            }
            if (e.textEditor.document.languageId === 'markdown' &&
                e.textEditor.viewColumn !== this.panel.viewColumn &&
                e.visibleRanges.length > 0) {
                const topLine = e.visibleRanges[0].start.line;
                // Only send if line actually changed
                if (topLine === this.lastEditorScrollLine) {
                    return;
                }
                this.lastEditorScrollLine = topLine;
                if (this.scrollSyncTimer) {
                    clearTimeout(this.scrollSyncTimer);
                }
                this.scrollSyncTimer = setTimeout(() => {
                    void this.panel.webview.postMessage({ type: 'revealLine', line: topLine });
                }, 60);
            }
        }), this.panel.onDidDispose(() => this.dispose(), null, this.disposables));
        // Embed initial markdown as base64 in a <body> data attribute — purely
        // declarative HTML, zero CSP/postMessage dependency.  The inline script
        // reads it with atob() as soon as the DOM is ready.
        this.panel.webview.html = this.buildHtml(PreviewPanel.getNonce(), initialMarkdown);
    }
    syncWithActiveEditor(doc) {
        const d = doc ?? vscode.window.activeTextEditor?.document;
        if (d?.languageId === 'markdown') {
            const name = d.fileName.split('/').pop() ?? 'Preview';
            this.panel.title = `InkDown: ${name}`;
            this.push(d.getText());
        }
    }
    scheduleUpdate(markdown) {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => this.push(markdown), DEBOUNCE_MS);
    }
    push(markdown) {
        // Store as pending in case the webview isn't ready yet; cleared on 'ready' ack
        this.pendingMarkdown = markdown;
        void this.panel.webview.postMessage({ type: 'update', markdown });
    }
    buildHtml(nonce, initialMarkdown) {
        // Encode initial markdown as base64 so it can be stored safely in an HTML
        // attribute (base64 chars are all attribute-safe — no escaping needed).
        const initialBase64 = Buffer.from(initialMarkdown, 'utf8').toString('base64');
        // marked is bundled locally — guaranteed to load with no network dependency.
        const markedUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'marked.min.js')).toString();
        // Optional CDN libraries (loaded async — preview works without them):
        const hljsCdn = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
        const hljsCss = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
        const hljsCssDark = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
        const katexCss = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
        const katexJs = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
        const mermaidJs = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
        // The webview's own scheme must be in script-src so the local marked file loads.
        const cspSource = this.panel.webview.cspSource;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
    script-src 'nonce-${nonce}' ${cspSource} https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;
    img-src data: https: blob:;
    font-src https://cdn.jsdelivr.net;
    connect-src https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;
    worker-src blob:;
  ">
  <title>InkDown Preview</title>
  <link id="hljs-light" rel="stylesheet" href="${hljsCss}">
  <link id="hljs-dark"  rel="stylesheet" href="${hljsCssDark}" disabled>
  <link rel="stylesheet" href="${katexCss}">
  <!-- marked is local and synchronous — loads instantly, no CDN dependency -->
  <script nonce="${nonce}" src="${markedUri}"></script>
  <!-- Optional CDN libs loaded async — if they time out, features degrade gracefully -->
  <script nonce="${nonce}" src="${hljsCdn}" async></script>
  <script nonce="${nonce}" src="${katexJs}" async></script>
  <script nonce="${nonce}" src="${mermaidJs}" async></script>
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
    html { scroll-behavior: auto; }
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
    .mermaid-wrap { text-align: center; margin: 1.5em 0; overflow-x: auto; }
    .mermaid-wrap svg { height: auto; min-width: 100%; }
    .mermaid-error { color: #cf222e; background: #fff8f0; border: 1px solid #ffa198;
                     border-radius: 4px; padding: 0.75em 1em; font-family: monospace; font-size: 0.85em; }
    sup a { color: var(--link); text-decoration: none; font-weight: 600; }
    li[id^="fn-"] { font-size: 0.9em; color: var(--bq-color); margin: 0.3em 0; }
    li[id^="fn-"] a { color: var(--link); text-decoration: none; }
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
<body data-initial="${initialBase64}">
  <div id="spinner"></div>
  <div id="preview"></div>

  <script nonce="${nonce}">
    // ── Core references ───────────────────────────────────────────────────────
    const preview = document.getElementById('preview');
    const spinner = document.getElementById('spinner');
    const vscode  = acquireVsCodeApi();

    let mermaidCounter = 0;

    // ── KaTeX math rendering ──────────────────────────────────────────────────
    function renderMathPlaceholders(container) {
      if (typeof katex === 'undefined') { return; }
      const placeholders = container.querySelectorAll('.math-placeholder');
      placeholders.forEach(function(el) {
        const tex = el.getAttribute('data-math')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"');
        const displayMode = el.getAttribute('data-display') === 'true';
        try {
          katex.render(tex, el, { displayMode: displayMode, throwOnError: false });
          el.classList.remove('math-placeholder');
          el.classList.add(displayMode ? 'math-block-rendered' : 'math-inline-rendered');
        } catch (err) {
          el.textContent = tex;
        }
      });
    }

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
        // Tokenize and annotate with line numbers for scroll sync
        const tokens = marked.lexer(markdown);
        let line = 0;
        for (var i = 0; i < tokens.length; i++) {
          tokens[i]._line = line;
          if (tokens[i].raw) {
            var matches = tokens[i].raw.match(/\\n/g);
            line += matches ? matches.length : 0;
          }
        }
        const html = marked.parser(tokens);
        preview.innerHTML = typeof html === 'string' ? html : await html;

        renderMathPlaceholders(preview);
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

      // When async CDN libs finish loading, ensure mermaid is initialized with
      // the correct theme so diagrams render properly on the next update.
      document.querySelectorAll('script[async]').forEach(function(s) {
        s.addEventListener('load', function() {
          applyTheme();
          // Once mermaid loads, render any placeholders from the initial render
          if (typeof mermaid !== 'undefined') {
            renderMermaidBlocks(preview);
          }
          // Once KaTeX loads, render any math placeholders from the initial render
          if (typeof katex !== 'undefined') {
            renderMathPlaceholders(preview);
          }
        });
      });

      // ── Math (KaTeX) protection for marked ──────────────────────────────────
      // Protect $...$ and $$...$$ from being mangled by marked's inline processing.
      // Outputs placeholders that are rendered by KaTeX after marked finishes.
      var mathExtension = {
        extensions: [
          {
            name: 'mathBlock',
            level: 'block',
            start: function(src) { var m = src.match(/\\$\\$/); return m ? m.index : undefined; },
            tokenizer: function(src) {
              var match = src.match(/^\\$\\$([\\s\\S]+?)\\$\\$/);
              if (match) {
                return { type: 'mathBlock', raw: match[0], text: match[1].trim() };
              }
            },
            renderer: function(token) {
              var escaped = token.text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
              return '<div class="math-placeholder" data-math="' + escaped + '" data-display="true"></div>';
            }
          },
          {
            name: 'mathInline',
            level: 'inline',
            start: function(src) { var m = src.match(/\\$/); return m ? m.index : undefined; },
            tokenizer: function(src) {
              var match = src.match(/^\\$([^\\$\\n]+?)\\$/);
              if (match) {
                return { type: 'mathInline', raw: match[0], text: match[1] };
              }
            },
            renderer: function(token) {
              var escaped = token.text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
              return '<span class="math-placeholder" data-math="' + escaped + '" data-display="false"></span>';
            }
          }
        ]
      };

      // ── Footnotes extension for marked ──────────────────────────────────────
      // Handles [^id] references and [^id]: definition blocks.
      var footnoteExtension = {
        extensions: [
          {
            name: 'footnoteDef',
            level: 'block',
            start: function(src) { var m = src.match(/^\\[\\^/m); return m ? m.index : undefined; },
            tokenizer: function(src) {
              var match = src.match(/^\\[\\^([^\\]]+)\\]:\\s+([^\\n]+(?:\\n|$))/);
              if (match) {
                return { type: 'footnoteDef', raw: match[0], id: match[1], text: match[2].trim() };
              }
            },
            renderer: function(token) {
              return '<li id="fn-' + token.id + '"><p>' + token.text +
                ' <a href="#fnref-' + token.id + '">&#8617;</a></p></li>';
            }
          },
          {
            name: 'footnoteRef',
            level: 'inline',
            start: function(src) { var m = src.match(/\\[\\^/); return m ? m.index : undefined; },
            tokenizer: function(src) {
              var match = src.match(/^\\[\\^([^\\]]+)\\]/);
              if (match && !src.startsWith('[^' + match[1] + ']:')) {
                return { type: 'footnoteRef', raw: match[0], id: match[1] };
              }
            },
            renderer: function(token) {
              return '<sup id="fnref-' + token.id + '"><a href="#fn-' + token.id + '">' +
                token.id + '</a></sup>';
            }
          }
        ]
      };

      // marked is bundled locally — always available, no existence check needed.
      const renderer = new marked.Renderer();

      // Helper: returns data-line attribute string if token has line info
      function lineAttr(token) {
        return token._line != null ? ' data-line="' + token._line + '"' : '';
      }

      renderer.heading = function(token) {
        const text = this.parser.parseInline(token.tokens);
        const depth = token.depth;
        return '<h' + depth + lineAttr(token) + '>' + text + '</h' + depth + '>';
      };

      renderer.paragraph = function(token) {
        const text = this.parser.parseInline(token.tokens);
        return '<p' + lineAttr(token) + '>' + text + '</p>\\n';
      };

      renderer.code = function(token) {
        const code = token.text;
        const lang = (token.lang || '').toLowerCase();
        const la = lineAttr(token);
        if (lang === 'mermaid') {
          const escaped = code.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
          return '<div class="mermaid-placeholder"' + la + ' data-code="' + escaped + '"></div>';
        }
        if (typeof hljs !== 'undefined') {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          const highlighted = hljs.highlight(code, { language }).value;
          return '<pre' + la + '><code class="hljs language-' + language + '">' + highlighted + '</code></pre>';
        }
        return '<pre' + la + '><code>' + code + '</code></pre>';
      };

      renderer.blockquote = function(token) {
        const body = this.parser.parse(token.tokens);
        return '<blockquote' + lineAttr(token) + '>' + body + '</blockquote>\\n';
      };

      renderer.list = function(token) {
        const tag = token.ordered ? 'ol' : 'ul';
        const self = this;
        const body = token.items.map(function(item) {
          return self.listitem(item);
        }).join('');
        return '<' + tag + lineAttr(token) + '>' + body + '</' + tag + '>\\n';
      };

      renderer.listitem = function(token) {
        var body = this.parser.parse(token.tokens, !!token.loose);
        if (token.task) {
          const checked = token.checked ? 'checked' : '';
          return '<li class="task-list-item"><input type="checkbox" disabled ' + checked + '> ' +
                 body + '</li>';
        }
        return '<li>' + body + '</li>';
      };

      renderer.table = function(token) {
        var self = this;
        var headerRow = '<tr>' + token.header.map(function(cell) {
          var align = cell.align ? ' style="text-align:' + cell.align + '"' : '';
          return '<th' + align + '>' + self.parser.parseInline(cell.tokens) + '</th>';
        }).join('') + '</tr>';
        var bodyRows = token.rows.map(function(row) {
          return '<tr>' + row.map(function(cell) {
            var align = cell.align ? ' style="text-align:' + cell.align + '"' : '';
            return '<td' + align + '>' + self.parser.parseInline(cell.tokens) + '</td>';
          }).join('') + '</tr>';
        }).join('');
        return '<table' + lineAttr(token) + '><thead>' + headerRow + '</thead><tbody>' + bodyRows + '</tbody></table>\\n';
      };

      renderer.hr = function(token) {
        return '<hr' + lineAttr(token) + '>\\n';
      };

      marked.use(mathExtension);
      marked.use(footnoteExtension);
      marked.use({ renderer, gfm: true, breaks: false, useNewRenderer: true });
    } catch (initErr) {
      console.error('InkDown: library init error', initErr);
    }

    // ── Initial render from body data attribute (base64, no CSP/postMessage) ──
    try {
      const encoded = document.body.getAttribute('data-initial');
      if (encoded) {
        // Decode base64 → UTF-8 correctly (atob alone mangles multi-byte chars)
        const bytes = Uint8Array.from(atob(encoded), function(c) { return c.charCodeAt(0); });
        const text = new TextDecoder().decode(bytes);
        void renderMarkdown(text);
      }
    } catch (e) {
      console.error('InkDown: initial render failed', e);
    }

    // ── Scroll sync state ────────────────────────────────────────────────────
    var isScrollingSelf = false;
    var scrollSelfTimer = null;
    var scrollDebounce = null;
    var lastSyncedLine = -1;
    var scrollAnimFrame = null;

    // Helper: get sorted array of {el, line, top} for all data-line elements
    function getLineAnchors() {
      var elements = preview.querySelectorAll('[data-line]');
      var anchors = [];
      for (var i = 0; i < elements.length; i++) {
        var line = parseInt(elements[i].getAttribute('data-line'), 10);
        var rect = elements[i].getBoundingClientRect();
        anchors.push({ el: elements[i], line: line, top: rect.top + window.scrollY });
      }
      return anchors;
    }

    // Smooth scroll to a pixel position using requestAnimationFrame
    function smoothScrollTo(targetY, duration) {
      if (scrollAnimFrame) { cancelAnimationFrame(scrollAnimFrame); }
      var startY = window.scrollY;
      var distance = targetY - startY;
      if (Math.abs(distance) < 2) { return; }
      var startTime = null;
      duration = duration || 300;

      function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }

      function step(timestamp) {
        if (!startTime) { startTime = timestamp; }
        var elapsed = timestamp - startTime;
        var progress = Math.min(elapsed / duration, 1);
        var eased = easeInOutCubic(progress);
        window.scrollTo(0, startY + distance * eased);
        if (progress < 1) {
          scrollAnimFrame = requestAnimationFrame(step);
        } else {
          scrollAnimFrame = null;
        }
      }
      scrollAnimFrame = requestAnimationFrame(step);
    }

    // ── Live-update listener (typing / editor switch) ─────────────────────────
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'update' && typeof msg.markdown === 'string') {
        void renderMarkdown(msg.markdown);
      }
      // Scroll sync: editor → preview (interpolated positioning)
      if (msg.type === 'revealLine' && typeof msg.line === 'number') {
        const target = msg.line;
        const anchors = getLineAnchors();
        if (anchors.length === 0) { return; }

        // Find the two anchors that bracket the target line
        var before = null;
        var after = null;
        for (var i = 0; i < anchors.length; i++) {
          if (anchors[i].line <= target) {
            before = anchors[i];
          } else {
            after = anchors[i];
            break;
          }
        }

        var scrollTarget;
        if (!before) {
          scrollTarget = 0;
        } else if (!after) {
          // Past the last anchor — scroll to it
          scrollTarget = before.top;
        } else {
          // Interpolate between the two bracketing anchors
          var lineRange = after.line - before.line;
          var fraction = lineRange > 0 ? (target - before.line) / lineRange : 0;
          scrollTarget = before.top + (after.top - before.top) * fraction;
        }

        isScrollingSelf = true;
        smoothScrollTo(Math.max(0, scrollTarget - 20), 250);
        clearTimeout(scrollSelfTimer);
        scrollSelfTimer = setTimeout(function() { isScrollingSelf = false; }, 600);
      }
    });

    // ── Scroll sync: preview → editor (interpolated line calculation) ─────────
    window.addEventListener('scroll', function() {
      if (isScrollingSelf) { return; }
      clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(function() {
        var anchors = getLineAnchors();
        if (anchors.length === 0) { return; }

        var viewTop = window.scrollY + 20;
        var before = null;
        var after = null;
        for (var i = 0; i < anchors.length; i++) {
          if (anchors[i].top <= viewTop) {
            before = anchors[i];
          } else {
            after = anchors[i];
            break;
          }
        }

        var line;
        if (!before) {
          line = 0;
        } else if (!after) {
          line = before.line;
        } else {
          // Interpolate fractional line between the two anchors
          var pixelRange = after.top - before.top;
          var fraction = pixelRange > 0 ? (viewTop - before.top) / pixelRange : 0;
          line = Math.round(before.line + (after.line - before.line) * fraction);
        }

        // Only send if the line actually changed (reduces noise)
        if (line !== lastSyncedLine) {
          lastSyncedLine = line;
          vscode.postMessage({ type: 'scrollSync', line: line });
        }
      }, 80);
    });

    // Tell the extension we are alive (so it can push a pending update if any)
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
    }
    dispose() {
        PreviewPanel.currentPanel = undefined;
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.panel.dispose();
        this.disposables.forEach((d) => d.dispose());
    }
}
exports.PreviewPanel = PreviewPanel;
//# sourceMappingURL=previewPanel.js.map