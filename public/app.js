'use strict';

/* ══════════════════════════════════════════════════════════════
   InkDown — Frontend Application
   ══════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────
const state = {
  mode:          'editor',   // 'editor' | 'upload' | 'url'
  format:        'pdf',
  markdownText:  '',
  uploadedFile:  null,
  urlValue:      '',
  urlLoaded:     false,
  options: {
    toc:       false,
    autoBreak: false,
    title:     '',
  },
  loading:        false,
  previewTimer:   null,
};

// ── Default sample content ────────────────────────────────────
const SAMPLE_MD = `# InkDown

Welcome to **InkDown** — your Markdown documents, beautifully formatted.

## Features

- Syntax-highlighted code blocks (190+ languages)
- Smart tables that never overflow
- Auto-generated Table of Contents
- Manual \`<!-- pagebreak -->\` or auto page breaks

## Code Example

\`\`\`javascript
async function fetchData(url) {
  const res  = await fetch(url);
  const data = await res.json();
  return data;
}
\`\`\`

## Table Example

| Feature       | Status | Notes                     |
|---------------|--------|---------------------------|
| Code blocks   | ✅ Done | wrap-safe + syntax colors |
| Tables        | ✅ Done | scales to page width      |
| Images        | ✅ Done | base64 inlined            |
| Page breaks   | ✅ Done | manual & auto             |

## Blockquote

> "Great documentation is half the product."
> — Every engineer who had to debug undocumented code.

<!-- pagebreak -->

## Second Chapter

This section starts on a fresh page when **Auto Page Breaks** is enabled, or after the manual \`<!-- pagebreak -->\` comment above.
`;

// ── DOM refs (resolved after DOMContentLoaded) ────────────────
let el = {};

function resolveElements() {
  el = {
    // Nav
    nav:           document.getElementById('nav'),
    hamburger:     document.getElementById('hamburger'),
    mobilePanel:   document.getElementById('mobilePanel'),
    mobilePanelSheet: document.getElementById('mobilePanelSheet'),
    mobilePanelBackdrop: document.getElementById('mobilePanelBackdrop'),
    mobilePanelClose: document.getElementById('mobilePanelClose'),
    mobileThemeToggle: document.getElementById('mobileThemeToggle'),
    themeToggle:   document.getElementById('themeToggle'),

    // Tabs
    tabs:          document.querySelectorAll('.tab'),

    // Editor pane
    editorPane:    document.getElementById('editorPane'),
    mdEditor:      document.getElementById('mdEditor'),
    mdToolbar:     document.getElementById('mdToolbar'),
    clearBtn:      document.getElementById('clearBtn'),
    copyBtn:       document.getElementById('copyBtn'),
    charCount:     document.getElementById('charCount'),
    statWords:     document.getElementById('statWords'),
    statHeadings:  document.getElementById('statHeadings'),
    statPages:     document.getElementById('statPages'),

    // Upload pane
    uploadPane:    document.getElementById('uploadPane'),
    dropZone:      document.getElementById('dropZone'),
    fileInput:     document.getElementById('fileInput'),
    fileSelected:  document.getElementById('fileSelected'),
    fileName:      document.getElementById('fileName'),
    fileSize:      document.getElementById('fileSize'),
    fileRemove:    document.getElementById('fileRemove'),

    // URL pane
    urlPane:       document.getElementById('urlPane'),
    urlInput:      document.getElementById('urlInput'),
    urlLoadBtn:    document.getElementById('urlLoadBtn'),
    urlLoaded:     document.getElementById('urlLoaded'),
    urlLoadedLabel:document.getElementById('urlLoadedLabel'),

    // Preview
    previewPane:   document.getElementById('previewPane'),
    previewFrame:  document.getElementById('previewFrame'),
    previewEmpty:  document.getElementById('previewEmpty'),

    // Options
    tocToggle:        document.getElementById('tocToggle'),
    autoBreakToggle:  document.getElementById('autoBreakToggle'),
    titleInput:       document.getElementById('titleInput'),


    convertInfoText: document.getElementById('convertInfoText'),
    convertBtnLabel: document.getElementById('convertBtnLabel'),
    loadingStepText: document.getElementById('loadingStepText'),
    formatToggle:  document.getElementById('formatToggle'),

    // Convert
    convertBtn:    document.getElementById('convertBtn'),
    convertIdle:   document.querySelector('.btn-convert-idle'),
    convertLoading:document.querySelector('.btn-convert-loading'),
    toastContainer:document.getElementById('toastContainer'),
  };
}

/* ══════════════════════════════════════════════════════════════
   THEME TOGGLE
   ══════════════════════════════════════════════════════════════ */
function initTheme() {
  // Theme is already applied before paint by the inline script in <head>.
  // Here we just wire the button to toggle it.
  el.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('md-theme', next);
  });
}



/* ══════════════════════════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════════════════════════ */
function initNav() {
  // ── Mobile panel open/close ──
  el.hamburger.addEventListener('click', toggleMobilePanel);
  el.mobilePanelClose.addEventListener('click', closeMobilePanel);
  el.mobilePanelBackdrop.addEventListener('click', closeMobilePanel);

  // Close on mobile link click
  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', closeMobilePanel);
  });

  // Wire mobile theme toggle
  if (el.mobileThemeToggle) {
    el.mobileThemeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('md-theme', next);
    });
  }

  // ── Scrolled state for nav blur/shadow ──
  const navEl = el.nav;
  window.addEventListener('scroll', () => {
    navEl.classList.toggle('nav-scrolled', window.scrollY > 24);
  }, { passive: true });

  // ── Active-link indicator ──
  const indicator = document.getElementById('navIndicator');
  const navLinks  = document.querySelectorAll('.nav-center .nav-link');
  const sections  = Array.from(navLinks).map(l => ({
    link: l,
    target: document.querySelector(l.getAttribute('href')),
  })).filter(s => s.target);

  function moveIndicator(link) {
    if (!link || !indicator) return;
    const rect   = link.getBoundingClientRect();
    const parent = link.closest('.nav-center').getBoundingClientRect();
    indicator.style.left  = (rect.left - parent.left) + 'px';
    indicator.style.width = rect.width + 'px';
  }

  function setActive(link) {
    navLinks.forEach(l => l.classList.remove('active'));
    if (link) {
      link.classList.add('active');
      moveIndicator(link);
    }
  }

  // Set initial active state on first visible nav-link
  if (navLinks.length) {
    setActive(navLinks[0]);
    window.addEventListener('resize', () => {
      const active = document.querySelector('.nav-center .nav-link.active');
      if (active) moveIndicator(active);
    });
  }

  // ScrollTrigger-based section tracking
  if (typeof ScrollTrigger !== 'undefined') {
    sections.forEach(({ link, target }) => {
      ScrollTrigger.create({
        trigger: target,
        start: 'top center',
        end: 'bottom center',
        onEnter:     () => setActive(link),
        onEnterBack: () => setActive(link),
      });
    });
  }

  // Hover preview on links
  navLinks.forEach(link => {
    link.addEventListener('mouseenter', () => moveIndicator(link));
    link.addEventListener('mouseleave', () => {
      const active = document.querySelector('.nav-center .nav-link.active');
      if (active) moveIndicator(active);
    });
  });
}

/* ── Mobile panel open/close with GSAP ── */
let _mobilePanelOpen = false;

function toggleMobilePanel() {
  if (_mobilePanelOpen) closeMobilePanel();
  else openMobilePanel();
}

function openMobilePanel() {
  if (_mobilePanelOpen) return;
  _mobilePanelOpen = true;

  const panel = el.mobilePanel;
  panel.classList.add('is-open');
  el.hamburger.classList.add('is-active');
  document.body.style.overflow = 'hidden';

  // GSAP stagger animation for nav links
  if (typeof gsap !== 'undefined') {
    const links = panel.querySelectorAll('.mobile-nav-link');
    gsap.fromTo(links, {
      opacity: 0,
      x: 24,
    }, {
      opacity: 1,
      x: 0,
      stagger: 0.07,
      duration: 0.4,
      delay: 0.15,
      ease: 'power3.out',
    });

    // Animate footer
    const footer = panel.querySelector('.mobile-panel-footer');
    if (footer) {
      gsap.fromTo(footer, { opacity: 0, y: 16 }, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        delay: 0.35,
        ease: 'power2.out',
      });
    }
  } else {
    // Fallback: just show them
    panel.querySelectorAll('.mobile-nav-link').forEach(l => {
      l.style.opacity = '1';
      l.style.transform = 'none';
    });
  }
}

function closeMobilePanel() {
  if (!_mobilePanelOpen) return;
  _mobilePanelOpen = false;

  el.hamburger.classList.remove('is-active');
  document.body.style.overflow = '';

  const panel = el.mobilePanel;

  if (typeof gsap !== 'undefined') {
    const links = panel.querySelectorAll('.mobile-nav-link');
    gsap.to(links, {
      opacity: 0,
      x: 24,
      stagger: 0.04,
      duration: 0.25,
      ease: 'power2.in',
    });
    // Wait for sheet CSS transition (0.4s) then hide
    setTimeout(() => {
      panel.classList.remove('is-open');
    }, 400);
  } else {
    panel.classList.remove('is-open');
  }

  // Start slide-out immediately via CSS
  panel.querySelector('.mobile-panel-sheet').style.transform = 'translateX(100%)';
  panel.querySelector('.mobile-panel-backdrop').style.opacity = '0';
  setTimeout(() => {
    // Re-enable CSS transitions by removing inline overrides
    panel.querySelector('.mobile-panel-sheet').style.transform = '';
    panel.querySelector('.mobile-panel-backdrop').style.opacity = '';
  }, 450);
}

// Expose globally for onclick handlers
window.closeMobilePanel = closeMobilePanel;

// Close panel on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _mobilePanelOpen) closeMobilePanel();
});

// Auto-close if window resizes past mobile breakpoint
window.addEventListener('resize', () => {
  if (_mobilePanelOpen && window.innerWidth > 768) closeMobilePanel();
});

/* ══════════════════════════════════════════════════════════════
   TABS
   ══════════════════════════════════════════════════════════════ */
function initTabs() {
  el.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function switchTab(mode) {
  state.mode = mode;

  // Update tab active state
  el.tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === mode);
    t.setAttribute('aria-selected', t.dataset.tab === mode);
  });

  // Show/hide panes
  el.editorPane.classList.toggle('hidden', mode !== 'editor');
  el.uploadPane.classList.toggle('hidden', mode !== 'upload');
  el.urlPane.classList.toggle('hidden',    mode !== 'url');

  // Preview pane: hide on upload, show on editor/url
  el.previewPane.classList.toggle('hidden', mode === 'upload');

  // On switching to editor, trigger preview if content exists
  if (mode === 'editor' && state.markdownText) schedulePreview();
}

/* ══════════════════════════════════════════════════════════════
   EDITOR
   ══════════════════════════════════════════════════════════════ */
function initEditor() {
  // Restore from localStorage, else use sample
  const saved = localStorage.getItem('md-content');
  const initial = saved !== null ? saved : SAMPLE_MD;
  el.mdEditor.value = initial;
  state.markdownText = initial;
  updateDocStats(initial);

  el.mdEditor.addEventListener('input', () => {
    state.markdownText = el.mdEditor.value;
    updateDocStats(state.markdownText);
    schedulePreview();
    // Auto-save to localStorage
    localStorage.setItem('md-content', state.markdownText);
  });

  // ⌘+Enter → convert
  el.mdEditor.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleConvert();
    }
    // ⌘B → bold
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      insertMarkdown('bold');
    }
    // ⌘I → italic
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      insertMarkdown('italic');
    }
    // Tab key inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = el.mdEditor.selectionStart;
      const v = el.mdEditor.value;
      el.mdEditor.value = v.slice(0, s) + '  ' + v.slice(s);
      el.mdEditor.selectionStart = el.mdEditor.selectionEnd = s + 2;
      state.markdownText = el.mdEditor.value;
    }
  });

  el.clearBtn.addEventListener('click', () => {
    el.mdEditor.value = '';
    state.markdownText = '';
    updateDocStats('');
    clearPreview();
    localStorage.removeItem('md-content');
  });

  el.copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(state.markdownText).then(() => {
      showToast('Copied to clipboard', 'success');
    });
  });

  // Trigger initial preview
  schedulePreview();
}

function updateDocStats(text) {
  const words     = text.trim() ? text.trim().split(/\s+/).length : 0;
  const headings  = (text.match(/^#{1,6}\s/gm) || []).length;
  const estPages  = Math.max(1, Math.ceil(words / 400));

  if (el.statWords)    el.statWords.textContent    = `${words.toLocaleString()} word${words !== 1 ? 's' : ''}`;
  if (el.statHeadings) el.statHeadings.textContent = `${headings} heading${headings !== 1 ? 's' : ''}`;
  if (el.statPages)    el.statPages.textContent    = `~${estPages} page${estPages !== 1 ? 's' : ''}`;
  if (el.charCount)    el.charCount.textContent    = `${text.length.toLocaleString()} chars`;
}

/* ══════════════════════════════════════════════════════════════
   MARKDOWN TOOLBAR
   ══════════════════════════════════════════════════════════════ */
function initToolbar() {
  if (!el.mdToolbar) return;
  el.mdToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    insertMarkdown(btn.dataset.action);
  });
}

function insertMarkdown(action) {
  const editor = el.mdEditor;
  const start  = editor.selectionStart;
  const end    = editor.selectionEnd;
  const sel    = editor.value.substring(start, end);
  const before = editor.value.substring(0, start);
  const after  = editor.value.substring(end);

  let insert = '';
  let cursorOffset = 0;  // offset to position cursor inside the inserted text
  let selLen = 0;        // length of the "inner" text to re-select

  switch (action) {
    case 'h2': {
      const text = sel || 'Heading';
      insert = `## ${text}`;
      cursorOffset = 3;
      selLen = text.length;
      break;
    }
    case 'h3': {
      const text = sel || 'Heading';
      insert = `### ${text}`;
      cursorOffset = 4;
      selLen = text.length;
      break;
    }
    case 'bold': {
      const text = sel || 'bold text';
      insert = `**${text}**`;
      cursorOffset = 2;
      selLen = text.length;
      break;
    }
    case 'italic': {
      const text = sel || 'italic text';
      insert = `_${text}_`;
      cursorOffset = 1;
      selLen = text.length;
      break;
    }
    case 'strike': {
      const text = sel || 'text';
      insert = `~~${text}~~`;
      cursorOffset = 2;
      selLen = text.length;
      break;
    }
    case 'code': {
      const text = sel || 'code';
      insert = `\`${text}\``;
      cursorOffset = 1;
      selLen = text.length;
      break;
    }
    case 'codeblock': {
      const text = sel || 'your code here';
      insert = `\`\`\`\n${text}\n\`\`\``;
      cursorOffset = 4;
      selLen = text.length;
      break;
    }
    case 'link': {
      const text = sel || 'link text';
      insert = `[${text}](url)`;
      cursorOffset = 1;
      selLen = text.length;
      break;
    }
    case 'quote': {
      const lines = (sel || 'quote').split('\n').map(l => `> ${l}`).join('\n');
      insert = lines;
      cursorOffset = 2;
      selLen = (sel || 'quote').length;
      break;
    }
    case 'ul': {
      const lines = (sel || 'item').split('\n').map(l => `- ${l}`).join('\n');
      insert = lines;
      cursorOffset = 2;
      selLen = (sel || 'item').length;
      break;
    }
    case 'ol': {
      const lines = (sel || 'item').split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n');
      insert = lines;
      cursorOffset = 3;
      selLen = (sel || 'item').length;
      break;
    }
    case 'table': {
      insert = '\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell     | Cell     | Cell     |\n';
      cursorOffset = 2;
      selLen = 8;   // select "Column 1"
      break;
    }
    case 'hr': {
      insert = '\n\n---\n\n';
      cursorOffset = insert.length;
      selLen = 0;
      break;
    }
    case 'pagebreak': {
      insert = '\n\n<!-- pagebreak -->\n\n';
      cursorOffset = insert.length;
      selLen = 0;
      break;
    }
    default:
      return;
  }

  const newValue = before + insert + after;
  editor.value   = newValue;
  editor.focus();
  editor.selectionStart = start + cursorOffset;
  editor.selectionEnd   = start + cursorOffset + selLen;

  state.markdownText = newValue;
  updateDocStats(newValue);
  schedulePreview();
  localStorage.setItem('md-content', newValue);
}

/* ══════════════════════════════════════════════════════════════
   LIVE PREVIEW
   ══════════════════════════════════════════════════════════════ */
function schedulePreview() {
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(() => renderPreview(state.markdownText), 300);
}

function renderPreview(markdown) {
  if (!markdown || !markdown.trim()) {
    clearPreview();
    return;
  }

  let html;
  try {
    html = window.marked ? window.marked.parse(markdown) : markdown;
  } catch (e) {
    html = `<pre>${escHtml(markdown)}</pre>`;
  }

  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github.min.css">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.65;
    color: #24292e;
    padding: 20px 24px;
    margin: 0;
    max-width: 100%;
  }
  h1,h2,h3,h4,h5,h6 { font-weight: 600; margin: 1.2em 0 0.4em; line-height: 1.25; }
  h1 { font-size: 1.8em; border-bottom: 2px solid #e1e4e8; padding-bottom: 0.3em; }
  h2 { font-size: 1.4em; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3em; }
  p  { margin: 0 0 1em; }
  a  { color: #0366d6; }
  code {
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.875em;
    background: #f6f8fa;
    padding: 0.2em 0.4em;
    border-radius: 3px;
  }
  pre {
    background: #f6f8fa;
    border: 1px solid #e1e4e8;
    border-radius: 6px;
    padding: 12px 16px;
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.5;
  }
  pre code { background: none; padding: 0; border-radius: 0; }
  blockquote {
    border-left: 4px solid #dfe2e5;
    padding: 0 1em;
    color: #6a737d;
    margin: 1em 0;
  }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 13px; }
  th, td { border: 1px solid #e1e4e8; padding: 6px 12px; text-align: left; }
  thead { background: #f6f8fa; font-weight: 600; }
  tr:nth-child(even) { background: #f9fafb; }
  img { max-width: 100%; height: auto; }
  hr  { height: 2px; background: #e1e4e8; border: none; margin: 1.5em 0; }
  ul, ol { padding-left: 2em; margin: 0 0 1em; }
  li { margin-bottom: 0.3em; }
</style>
</head>
<body>${html}</body>
</html>`;

  const frame = el.previewFrame;
  frame.srcdoc = doc;
  el.previewEmpty.style.display = 'none';
  frame.style.display = 'block';
}

function clearPreview() {
  el.previewFrame.srcdoc = '';
  el.previewFrame.style.display = 'none';
  el.previewEmpty.style.display = '';
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ══════════════════════════════════════════════════════════════
   DRAG & DROP / FILE UPLOAD
   ══════════════════════════════════════════════════════════════ */
function initDragDrop() {
  const zone = el.dropZone;

  // Drag events
  zone.addEventListener('dragenter', (e) => { e.preventDefault(); zone.classList.add('drag-active'); });
  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-active'); });
  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-active');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-active');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });

  // Click to browse
  zone.addEventListener('click', () => el.fileInput.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); }
  });
  el.fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });

  // Remove file
  el.fileRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    clearFile();
  });
}

function handleFileSelect(file) {
  if (!file) return;

  state.uploadedFile = file;

  // Show file card
  el.fileSelected.classList.remove('hidden');
  el.dropZone.classList.add('hidden');
  el.fileName.textContent = file.name;
  el.fileSize.textContent = formatBytes(file.size);

  // Also populate editor with the content for preview
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    state.markdownText = text;
    // Populate editor too
    el.mdEditor.value = text;
    updateDocStats(text);
    // Show preview (but stay in upload mode)
    el.previewPane.classList.remove('hidden');
    renderPreview(text);
  };
  reader.readAsText(file);
}

function clearFile() {
  state.uploadedFile = null;
  el.fileInput.value = '';
  el.fileSelected.classList.add('hidden');
  el.dropZone.classList.remove('hidden');
  clearPreview();
}

function formatBytes(n) {
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ══════════════════════════════════════════════════════════════
   URL INPUT
   ══════════════════════════════════════════════════════════════ */
function initUrlInput() {
  el.urlLoadBtn.addEventListener('click', loadUrl);
  el.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadUrl();
  });
}

async function loadUrl() {
  const url = el.urlInput.value.trim();
  if (!url) { showToast('Please enter a URL', 'error'); return; }

  el.urlLoadBtn.textContent = '…';
  el.urlLoadBtn.disabled = true;

  try {
    // Fetch the URL through our server-side proxy to avoid CORS
    // We'll store the URL and send it to /api/convert directly
    // For preview, try fetching client-side (works for raw GitHub etc.)
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    state.markdownText = text;
    state.urlValue     = url;
    state.urlLoaded    = true;

    // Populate editor
    el.mdEditor.value = text;
    updateDocStats(text);
    renderPreview(text);

    // Show loaded badge
    el.urlLoaded.classList.remove('hidden');
    el.urlLoadedLabel.textContent = `Loaded (${formatBytes(text.length)})`;
    showToast('URL loaded successfully', 'success');
  } catch (err) {
    // If CORS fails, we still mark the URL so the server can fetch it
    state.urlValue  = url;
    state.urlLoaded = true;
    el.urlLoaded.classList.remove('hidden');
    el.urlLoadedLabel.textContent = 'Will fetch server-side';
    showToast('URL saved — preview unavailable (CORS). PDF will still work.', 'success');
  } finally {
    el.urlLoadBtn.textContent = 'Load';
    el.urlLoadBtn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   OPTIONS
   ══════════════════════════════════════════════════════════════ */
function initOptions() {
  el.tocToggle.addEventListener('change', () => {
    state.options.toc = el.tocToggle.checked;
  });
  el.autoBreakToggle.addEventListener('change', () => {
    state.options.autoBreak = el.autoBreakToggle.checked;
  });
  el.titleInput.addEventListener('input', () => {
    state.options.title = el.titleInput.value.trim();
  });

  // Format toggle (PDF / DOCX)
  if (el.formatToggle) {
    el.formatToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-format]');
      if (!btn) return;
      const fmt = btn.dataset.format;
      state.format = fmt;
      el.formatToggle.querySelectorAll('.format-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.format === fmt);
      });
      // Update button label & info text
      if (el.convertBtnLabel) {
        el.convertBtnLabel.textContent = fmt === 'docx' ? 'Generate DOCX' : 'Generate PDF';
      }
      if (el.convertInfoText) {
        el.convertInfoText.textContent = fmt === 'docx'
          ? 'DOCX renders in ~2 seconds'
          : 'PDF renders in ~5 seconds';
      }
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   CONVERT
   ══════════════════════════════════════════════════════════════ */
function initConvertBtn() {
  el.convertBtn.addEventListener('click', handleConvert);
}

async function handleConvert() {
  if (state.loading) return;

  // Validate input
  if (state.mode === 'editor' && !state.markdownText.trim()) {
    showToast('Please add some Markdown content first', 'error');
    return;
  }
  if (state.mode === 'upload' && !state.uploadedFile) {
    showToast('Please upload a Markdown file first', 'error');
    return;
  }
  if (state.mode === 'url' && !state.urlValue.trim()) {
    showToast('Please enter or load a URL first', 'error');
    return;
  }

  setLoading(true);

  const fd = new FormData();

  // Input
  if (state.mode === 'editor') {
    fd.append('text', state.markdownText);
  } else if (state.mode === 'upload') {
    fd.append('file', state.uploadedFile);
  } else {
    // url mode — if we have the text, send it; otherwise send the URL
    if (state.markdownText && state.markdownText.trim()) {
      fd.append('text', state.markdownText);
    } else {
      fd.append('url', state.urlValue);
    }
  }

  // Options
  fd.append('toc',       state.options.toc.toString());
  fd.append('autoBreak', state.options.autoBreak.toString());
  fd.append('format',    state.format || 'pdf');
  if (state.options.title) fd.append('title', state.options.title);

  try {
    const resp = await fetch('/api/convert', { method: 'POST', body: fd });

    if (!resp.ok) {
      let msg = `Server error (${resp.status})`;
      try {
        const data = await resp.json();
        msg = data.error || msg;
      } catch { /* ignore */ }
      throw new Error(msg);
    }

    // Derive filename from Content-Disposition header
    const ext = state.format === 'docx' ? 'docx' : 'pdf';
    let filename = `document.${ext}`;
    const cd = resp.headers.get('Content-Disposition');
    if (cd) {
      const m = cd.match(/filename="([^"]+)"/);
      if (m) filename = m[1];
    }

    // Trigger browser download
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    showToast(`${filename} downloaded!`, 'success');
  } catch (err) {
    showToast(err.message || 'Conversion failed', 'error');
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  state.loading = isLoading;
  el.convertBtn.disabled = isLoading;
  el.convertIdle.classList.toggle('hidden', isLoading);
  el.convertLoading.classList.toggle('hidden', !isLoading);

  if (isLoading) {
    // Cycle through status messages while loading
    const msgs = state.format === 'pdf'
      ? ['Parsing Markdown…', 'Rendering HTML…', 'Processing code blocks…', 'Applying styles…', 'Launching Chrome…', 'Rendering PDF…', 'Finalising…']
      : ['Parsing Markdown…', 'Building structure…', 'Formatting styles…', 'Writing DOCX…', 'Finalising…'];

    let idx = 0;
    if (el.loadingStepText) el.loadingStepText.textContent = msgs[0];
    state._loadingTimer = setInterval(() => {
      idx = (idx + 1) % msgs.length;
      if (el.loadingStepText) el.loadingStepText.textContent = msgs[idx];
    }, 1200);
  } else {
    clearInterval(state._loadingTimer);
    if (el.loadingStepText) el.loadingStepText.textContent = 'Generating…';
  }
}

/* ══════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ══════════════════════════════════════════════════════════════ */
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = document.createElement('span');
  icon.className = `toast-icon-${type}`;
  icon.innerHTML = type === 'success'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

  const text = document.createElement('span');
  text.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(text);
  el.toastContainer.appendChild(toast);

  // Auto-remove
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(4px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ══════════════════════════════════════════════════════════════
   GSAP ANIMATIONS
   ══════════════════════════════════════════════════════════════ */
function initScrollAnimations() {
  // Bail out gracefully if GSAP didn't load
  if (typeof gsap === 'undefined') {
    document.querySelectorAll('.animate-in').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  // ── Global defaults ──
  gsap.defaults({ ease: 'power3.out', duration: 0.8 });

  // ── Nav entrance ──
  gsap.from('.nav', {
    y: -60,
    opacity: 0,
    duration: 0.6,
    ease: 'power2.out',
    delay: 0.1,
  });

  // ── Hero staggered reveal ──
  const heroItems = gsap.utils.toArray('.hero-content .animate-in');
  if (heroItems.length) {
    gsap.fromTo(heroItems, {
      opacity: 0,
      y: 32,
    }, {
      opacity: 1,
      y: 0,
      stagger: 0.12,
      duration: 0.85,
      delay: 0.35,
      ease: 'power3.out',
    });
  }

  // ── Hero background glows pulse ──
  gsap.to('.hero-glow-red', {
    scale: 1.08,
    opacity: 0.7,
    duration: 4,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
  gsap.to('.hero-glow-blue', {
    scale: 1.12,
    opacity: 0.6,
    duration: 5,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
    delay: 1,
  });

  // ── Scroll-triggered sections (generic .animate-in elements below hero) ──
  const scrollTargets = gsap.utils.toArray('.animate-in').filter(
    el => !el.closest('.hero-content')
  );

  scrollTargets.forEach((target, i) => {
    gsap.fromTo(target, {
      opacity: 0,
      y: 24,
    }, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      delay: (i % 4) * 0.08,
      scrollTrigger: {
        trigger: target,
        start: 'top 88%',
        toggleActions: 'play none none none',
      },
    });
  });

  // ── App panel scale-in ──
  const appPanel = document.getElementById('appPanel');
  if (appPanel) {
    gsap.fromTo(appPanel, {
      opacity: 0,
      scale: 0.96,
      y: 30,
    }, {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.9,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: appPanel,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
    });
  }

  // ── Feature rows stagger ──
  const featureRows = gsap.utils.toArray('.feature-row');
  if (featureRows.length) {
    gsap.fromTo(featureRows, {
      opacity: 0,
      x: -16,
    }, {
      opacity: 1,
      x: 0,
      stagger: 0.08,
      duration: 0.55,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: featureRows[0],
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
    });
  }

  // ── Steps stagger ──
  const steps = gsap.utils.toArray('.step');
  if (steps.length) {
    gsap.fromTo(steps, {
      opacity: 0,
      y: 20,
    }, {
      opacity: 1,
      y: 0,
      stagger: 0.15,
      duration: 0.65,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: steps[0],
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
    });
  }

  // ── Footer fade-up ──
  const footer = document.querySelector('.footer');
  if (footer) {
    gsap.fromTo(footer, {
      opacity: 0,
      y: 20,
    }, {
      opacity: 1,
      y: 0,
      duration: 0.6,
      scrollTrigger: {
        trigger: footer,
        start: 'top 92%',
        toggleActions: 'play none none none',
      },
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   API DOCS — language tabs + copy buttons
   ══════════════════════════════════════════════════════════════ */
function initApiDocs() {
  // ── Language tab switching ──
  const langTabs = document.querySelectorAll('.api-lang-tab');

  langTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const lang = tab.dataset.lang;
      // Find the parent .api-examples container
      const examples = tab.closest('.api-examples');
      if (!examples) return;

      examples.querySelectorAll('.api-lang-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.lang === lang);
        t.setAttribute('aria-selected', t.dataset.lang === lang);
      });
      examples.querySelectorAll('.api-code-block').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
      });
    });
  });

  // ── Copy buttons ──
  document.querySelectorAll('.api-code-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const block = btn.closest('.api-code-block');
      const code  = block ? block.querySelector('code') : null;
      if (!code) return;

      // Decode HTML entities before copying
      const text = code.innerText || code.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = orig;
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });

  // ── Set base URL dynamically ──
  const baseEl = document.getElementById('apiBaseUrl');
  if (baseEl) {
    baseEl.textContent = `${window.location.origin}/api/v1`;
  }
}

/* ══════════════════════════════════════════════════════════════
   BOOTSTRAP
   ══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  resolveElements();
  initTheme();
  initNav();
  initTabs();
  initEditor();
  initToolbar();
  initDragDrop();
  initUrlInput();
  initOptions();
  initConvertBtn();
  initApiDocs();
  initScrollAnimations();
});
