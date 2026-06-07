'use strict';

/**
 * converter.js — core Markdown → PDF logic
 *
 * Usage (programmatic):
 *   const { convert } = require('./converter');
 *   await convert('README.md', 'output.pdf', { toc: true, autoBreak: true });
 */

const fs       = require('fs');
const path     = require('path');
const puppeteer = require('puppeteer');
const { marked } = require('marked');
const hljs     = require('highlight.js');
const { analyze } = require('./analyzer');
const { convertGridTables } = require('./gridTableParser');
const { renderToSvg, createMermaidPage, extractMermaidBlocks } = require('./mermaidRenderer');
const markedFootnote = require('marked-footnote');
const markedKatex = require('marked-katex-extension');
const { parseFrontmatter, substituteVariables } = require('./frontmatter');

// ── Slugify helper ────────────────────────────────────────────
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')   // strip non-word chars
    .replace(/\s+/g, '-')       // spaces → dashes
    .replace(/-+/g, '-')        // collapse multiple dashes
    .trim();
}

// ── Configure marked ─────────────────────────────────────────
function buildRenderer() {
  const renderer = new marked.Renderer();

  // Add id="" to every heading for TOC anchor links
  renderer.heading = function ({ text, depth, raw }) {
    const id = slugify(raw);
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };

  // Replace <!-- pagebreak --> comments with a CSS page-break div
  renderer.html = function ({ text }) {
    return text.replace(
      /<!--\s*pagebreak\s*-->/gi,
      '<div class="page-break"></div>'
    );
  };

  // Syntax-highlight fenced code blocks directly in the renderer so the HTML
  // is never re-escaped by marked. walkTokens + token.escaped is unreliable in
  // marked v13 and causes literal <span> tags to appear in the output.
  renderer.code = function ({ text, lang }) {
    const language = (lang || '').split(/\s/)[0].toLowerCase();
    if (language === 'mermaid') {
      return `<pre><code class="language-mermaid">${text}</code></pre>\n`;
    }
    let highlighted;
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(text, { language }).value;
    } else if (!language) {
      highlighted = hljs.highlightAuto(text).value;
    } else {
      highlighted = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    const langClass = language ? ` class="hljs language-${language}"` : ' class="hljs"';
    return `<pre><code${langClass}>${highlighted}</code></pre>\n`;
  };

  return renderer;
}

function configureMarked() {
  marked.setOptions({
    renderer: buildRenderer(),
    gfm: true,        // GitHub-Flavoured Markdown (tables, strikethrough, etc.)
    breaks: false,    // keep semantic line-break behaviour
  });

  // Footnotes: [^1] → rendered as numbered footnotes at end of document
  marked.use(markedFootnote());

  // KaTeX: $inline$ and $$display$$ math equations
  marked.use(markedKatex({ throwOnError: false }));
}

configureMarked();

// ── TOC extraction ───────────────────────────────────────────
/**
 * Walk the HTML produced by marked and collect heading metadata.
 * Returns [{ level, id, title }]
 */
function extractHeadings(html) {
  const headings = [];
  // Match: <h1 id="slug">text content (no nested tags)</h1>
  const re = /<h([1-4])[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    headings.push({
      level: parseInt(m[1], 10),
      id:    m[2],
      title: m[3].replace(/<[^>]+>/g, ''), // strip inner tags, keep text
    });
  }
  return headings;
}

function buildTOC(headings) {
  if (headings.length === 0) return '';

  const items = headings
    .map(h => {
      const indent = h.level <= 2 ? '' : `style="padding-left:${(h.level - 2) * 1.2}em"`;
      const cls = `toc-h${h.level}`;
      return `<li class="${cls}" ${indent}><a href="#${h.id}">${h.title}</a></li>`;
    })
    .join('\n');

  return `
<nav class="toc">
  <h2>Table of Contents</h2>
  <ol>
    ${items}
  </ol>
</nav>
`;
}

// ── HTML template ────────────────────────────────────────────
function buildCoverPage({ title, author, date }) {
  const dateStr = date || new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  let html = `<div class="doc-cover">
  <h1>${escapeHtml(title)}</h1>\n`;
  if (author) {
    html += `  <p class="subtitle">${escapeHtml(author)}</p>\n`;
  }
  html += `  <p class="meta">${escapeHtml(dateStr)}</p>\n</div>\n`;
  return html;
}

function hasMermaidBlocks(html) {
  return html.includes('class="mermaid-diagram"');
}

function buildHtml({ body, toc, coverPage, autoBreak, title, highlightCss, printCss, katexCss, watermark = '', htmlMode = false }) {
  const bodyClass = autoBreak ? 'auto-break-h1' : '';

  const watermarkCss = watermark ? `
  .watermark-overlay {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 96px;
    font-weight: 900;
    color: rgba(0, 0, 0, 0.08);
    z-index: 9999;
    pointer-events: none;
    white-space: nowrap;
    user-select: none;
    letter-spacing: 0.05em;
  }
  @media print {
    .watermark-overlay {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 96px;
      font-weight: 900;
      color: rgba(0, 0, 0, 0.08);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      z-index: 9999;
      pointer-events: none;
      white-space: nowrap;
      user-select: none;
    }
  }` : '';

  const watermarkHtml = watermark
    ? `<div class="watermark-overlay">${escapeHtml(watermark)}</div>`
    : '';

  // Screen-only enhancements — override print styles for browser viewing
  const screenCss = `
@media screen {
  /* Centered readable column with comfortable padding */
  body {
    background: #f0f2f5;
    padding: 40px 20px;
    font-size: 15px;
    line-height: 1.7;
  }
  main {
    max-width: 860px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 8px;
    padding: 48px 56px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.10), 0 4px 20px rgba(0,0,0,0.07);
  }
  /* Allow horizontal scroll on code blocks instead of wrapping */
  pre {
    white-space: pre;
    overflow-x: auto;
    word-break: normal;
    border-radius: 8px;
    border: none;
    background: #f6f8fa;
    padding: 16px 20px;
    font-size: 13px;
  }
  /* Inline code pill */
  code {
    background: #eff1f3;
    border-radius: 4px;
    padding: 0.15em 0.45em;
    font-size: 0.87em;
  }
  /* Scrollable table wrapper */
  table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  /* Better link colour */
  a { color: #0969da; }
  a:hover { text-decoration: underline; }
  /* Mermaid diagrams centred with a subtle card */
  .mermaid-diagram {
    text-align: center;
    background: #f9fafb;
    border: 1px solid #e1e4e8;
    border-radius: 8px;
    padding: 24px 16px;
    margin: 1.5em 0;
    overflow-x: auto;
  }
  .mermaid-diagram svg {
    max-width: 100%;
    height: auto;
  }
  /* TOC card */
  nav.toc {
    background: #f8f9fb;
    border-radius: 8px;
    border: 1px solid #d0d7de;
    padding: 20px 28px;
  }
  /* Cover page */
  .doc-cover {
    padding: 80px 0 60px;
  }
  /* Responsive: narrow screens */
  @media (max-width: 600px) {
    main { padding: 28px 20px; }
    body { padding: 0; }
    main { border-radius: 0; }
  }
}`;

  // For HTML browser mode: style mermaid.js divs nicely
  const mermaidCss = htmlMode ? `
/* mermaid.js renders into .mermaid divs */
.mermaid {
  text-align: center;
  background: #f9fafb;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  padding: 24px 16px;
  margin: 1.5em 0;
  overflow-x: auto;
}
.mermaid svg { max-width: 100%; height: auto; }
` : '';

  // Scripts for HTML browser mode (mermaid.js + KaTeX auto-render from CDN)
  const headScripts = htmlMode ? `
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css" crossorigin="anonymous">
` : '';

  const bodyScripts = htmlMode ? `
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'loose' });
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js" crossorigin="anonymous"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js"
    crossorigin="anonymous"
    onload="renderMathInElement(document.body, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] })">
  </script>
` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
${highlightCss}
  </style>
  <style>
${printCss}
${watermarkCss}
${screenCss}
${mermaidCss}
  </style>
${htmlMode ? headScripts : (katexCss ? `  <link rel="stylesheet" href="${katexCss}">` : '')}
</head>
<body class="${bodyClass}">
  ${watermarkHtml}
  ${coverPage}
  ${toc}
  <main>
    ${body}
  </main>
${bodyScripts}
</body>
</html>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Load bundled assets ──────────────────────────────────────
function loadAssets() {
  // highlight.js GitHub-light theme (bundled with the package)
  const hljsThemePath = path.join(
    __dirname, '..', 'node_modules', 'highlight.js', 'styles', 'github.css'
  );
  const highlightCss = fs.readFileSync(hljsThemePath, 'utf-8');

  const printCss = fs.readFileSync(
    path.join(__dirname, 'styles.css'),
    'utf-8'
  );

  // KaTeX CSS for math rendering
  let katexCss = '';
  const katexCssPath = path.join(
    __dirname, '..', 'node_modules', 'katex', 'dist', 'katex.min.css'
  );
  if (fs.existsSync(katexCssPath)) {
    katexCss = fs.readFileSync(katexCssPath, 'utf-8');
  }

  return { highlightCss, printCss, katexCss };
}

// ── Convert mermaid code blocks to renderable divs ───────────
/**
 * After marked produces HTML, mermaid code blocks appear as:
 *   <pre><code class="language-mermaid">...diagram code...</code></pre>
 * This function renders them to SVGs using Puppeteer and inlines them:
 *   <div class="mermaid-diagram">...SVG...</div>
 */
async function convertMermaidBlocks(html) {
  // Match both plain and hljs-prefixed class variants:
  //   class="language-mermaid"  (normal path)
  //   class="hljs language-mermaid"  (if hljs ran anyway)
  const re = /<pre><code[^>]*class="[^"]*language-mermaid[^"]*"[^>]*>([\s\S]*?)<\/code><\/pre>/gi;
  const matches = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]
      // Pass 1: strip literal HTML tags injected by hljs (token.escaped=true path)
      .replace(/<[^>]+>/g, '')
      // Unescape HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Pass 2: strip tags that became visible only after unescaping
      .replace(/<[^>]+>/g, '')
      .trim();
    matches.push({ fullMatch: m[0], code: raw });
  }

  if (matches.length === 0) return html;

  // Launch a browser and create a SINGLE page with mermaid pre-loaded.
  // Note: matches already have HTML stripped — see extraction loop above.
  // Reusing one page avoids repeated CDN fetches that can fail intermittently.
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let result = html;
  try {
    const mermaidPage = await createMermaidPage(browser);

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      console.log(`  🎨 Rendering mermaid diagram ${i + 1}/${matches.length}…`);
      let svg = await renderToSvg(match.code, mermaidPage);
      // Retry once on failure
      if (!svg) {
        console.log(`  🔄 Retrying diagram ${i + 1}…`);
        svg = await renderToSvg(match.code, mermaidPage);
      }
      if (svg) {
        result = result.replace(
          match.fullMatch,
          `<div class="mermaid-diagram">${svg}</div>`
        );
      } else {
        console.log(`  ⚠ Mermaid diagram ${i + 1} failed to render:`, match.code.slice(0, 60));
        // Rendering failed — show as styled code block with a warning
        result = result.replace(
          match.fullMatch,
          `<div class="mermaid-diagram mermaid-error"><pre><code>${match.code}</code></pre><p style="color:#cb2431;font-size:12px;">⚠ Mermaid diagram failed to render</p></div>`
        );
      }
    }
  } finally {
    await browser.close();
  }

  return result;
}

// ── Inline local images as base64 ────────────────────────────
/**
 * Replace src="relative/path" with base64 data URIs so Puppeteer
 * (which runs in a sandboxed context) can render local images.
 * Only images with paths that resolve *inside* baseDir are inlined;
 * absolute paths and traversals (../../) are silently skipped.
 */
function inlineImages(html, baseDir) {
  const safeBase = path.resolve(baseDir) + path.sep;

  return html.replace(/src="([^"]+)"/g, (match, src) => {
    // Skip already-inlined, http, https, data URIs
    if (/^(https?:\/\/|data:)/.test(src)) return match;

    // Reject absolute paths — they may point anywhere on the filesystem
    if (path.isAbsolute(src)) return match;

    const imgPath = path.resolve(baseDir, src);

    // Reject traversals that escape the document directory
    if (!imgPath.startsWith(safeBase)) return match;

    if (!fs.existsSync(imgPath)) return match;

    try {
      const data = fs.readFileSync(imgPath);
      const ext  = path.extname(imgPath).slice(1).toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
      return `src="data:${mime};base64,${data.toString('base64')}"`;
    } catch {
      return match; // leave as-is if unreadable
    }
  });
}

// ── Main convert function ────────────────────────────────────
/**
 * @param {string}  inputPath   - Path to .md file
 * @param {string}  outputPath  - Desired .pdf output path
 * @param {object}  [opts]
 * @param {boolean} [opts.toc=false]       - Prepend Table of Contents
 * @param {boolean} [opts.autoBreak=false] - Page break before each h1
 * @param {string}  [opts.title]           - PDF title (defaults to filename)
 */
async function convert(inputPath, outputPath, opts = {}) {
  const absInput  = path.resolve(inputPath);
  const absOutput = path.resolve(outputPath);
  const baseDir   = path.dirname(absInput);

  if (!fs.existsSync(absInput)) {
    throw new Error(`Input file not found: ${absInput}`);
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });

  const rawMarkdown = fs.readFileSync(absInput, 'utf-8');

  // Parse YAML frontmatter — data fills in any opts not explicitly provided
  const { data: fm, content: markdownBody } = parseFrontmatter(rawMarkdown);

  const {
    toc       = fm.toc       === true || false,
    autoBreak = fm.autoBreak === true || false,
    title     = fm.title,
    author    = fm.author    || '',
    pageSize  = fm.pageSize  || 'A4',
    landscape = fm.landscape === true || false,
    theme     = fm.theme     || '',
    watermark = fm.watermark || '',
  } = opts;

  const docTitle = title || path.basename(absInput, path.extname(absInput));

  // Variable substitution — replace {{key}} with frontmatter values
  const bodyWithVars = substituteVariables(markdownBody, fm);

  const { highlightCss, printCss: basePrintCss, katexCss } = loadAssets();

  // Custom theme: layer on top of base styles (not replace) so mermaid/code
  // infrastructure CSS from styles.css is always present.
  let printCss = basePrintCss;
  if (theme) {
    const themePath = path.resolve(theme);
    if (fs.existsSync(themePath) && path.extname(themePath).toLowerCase() === '.css') {
      const themeCss = fs.readFileSync(themePath, 'utf-8');
      printCss = basePrintCss + '\n/* ── Custom theme ── */\n' + themeCss;
    }
  }

  // Smart analysis pass — normalize headings, detect issues, convert grid tables
  const { markdown, report } = await analyze(bodyWithVars, {
    autoBreak,
    fixHeadings: true,
  });

  if (report.headingFixes.length) {
    console.log(`  ⚠ Fixed ${report.headingFixes.length} heading hierarchy skip(s)`);
  }
  if (report.asciiArtBlocks.length) {
    console.log(`  ℹ Detected ${report.asciiArtBlocks.length} ASCII art block(s)`);
  }

  // Parse Markdown → HTML (grid tables already converted by analyze())
  let body = marked.parse(markdown);

  // Pre-render mermaid code blocks to inline SVGs
  body = await convertMermaidBlocks(body);

  // Inline local images
  body = inlineImages(body, baseDir);

  // Build optional TOC
  const tocHtml = toc ? buildTOC(extractHeadings(body)) : '';

  // Build cover page
  const coverPage = buildCoverPage({ title: docTitle, author });

  // Assemble full HTML document (KaTeX CSS inlined into printCss)
  const html = buildHtml({ body, toc: tocHtml, coverPage, autoBreak, title: docTitle, highlightCss, printCss: printCss + '\n' + (katexCss || ''), katexCss: '', watermark });

  // Launch Puppeteer and render PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-crash-reporter',
      '--disable-breakpad',
    ],
  });

  try {
    const page = await browser.newPage();

    // setContent waits for DOM ready — networkidle0 can timeout if CDN resources are slow
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Give external resources (KaTeX fonts, highlight.js) a moment to load
    await new Promise(r => setTimeout(r, 1500));

    await page.pdf({
      path:            absOutput,
      format:          pageSize || 'A4',
      landscape:       Boolean(landscape),
      printBackground: true,
      margin: {
        top:    '20mm',
        bottom: '22mm',
        left:   '18mm',
        right:  '18mm',
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="
          width:100%;
          font-size:9px;
          color:#6a737d;
          padding: 0 18mm;
          display:flex;
          justify-content:space-between;
          box-sizing:border-box;
        ">
          <span>${escapeHtml(docTitle)}</span>
          <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
    });
  } finally {
    await browser.close();
  }

  return absOutput;
}

// ── Prepare mermaid blocks for browser rendering (HTML export) ──
/**
 * For HTML export we DON'T use Puppeteer — instead we:
 *   1. Swap <pre><code class="language-mermaid">...</code></pre>
 *      for <div class="mermaid">...</div>  (mermaid.js auto-renders these)
 *   2. Unescape HTML entities so the raw diagram source is intact
 * The caller must inject mermaid.js into the page (see buildHtml htmlMode flag).
 */
function prepareMermaidForBrowser(html) {
  const re = /<pre><code[^>]*class="[^"]*language-mermaid[^"]*"[^>]*>([\s\S]*?)<\/code><\/pre>/gi;
  return html.replace(re, (_match, raw) => {
    const code = raw
      .replace(/<[^>]+>/g, '')      // strip any stray hljs spans
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    return `<div class="mermaid">${escapeHtml(code)}</div>`;
  });
}


/**
 * Convert Markdown to a standalone self-contained HTML file.
 * Mermaid diagrams are rendered to inline SVGs; images are base64-inlined.
 *
 * @param {string}  inputPath  - Path to .md file
 * @param {string}  outputPath - Desired .html output path
 * @param {object}  [opts]
 * @param {boolean} [opts.toc=false]
 * @param {boolean} [opts.autoBreak=false]
 * @param {string}  [opts.title]
 * @param {string}  [opts.watermark] - Diagonal watermark text (e.g. 'DRAFT')
 * @param {string}  [opts.theme]     - Path to a custom CSS file
 * @returns {Promise<string>} the output path
 */
async function convertToHtml(inputPath, outputPath, opts = {}) {
  const absInput  = path.resolve(inputPath);
  const absOutput = path.resolve(outputPath);
  const baseDir   = path.dirname(absInput);

  if (!fs.existsSync(absInput)) {
    throw new Error(`Input file not found: ${absInput}`);
  }

  fs.mkdirSync(path.dirname(absOutput), { recursive: true });

  const rawMarkdown = fs.readFileSync(absInput, 'utf-8');

  // Parse YAML frontmatter
  const { data: fm, content: markdownBody } = parseFrontmatter(rawMarkdown);

  const {
    toc       = fm.toc       === true || false,
    autoBreak = fm.autoBreak === true || false,
    title     = fm.title,
    author    = fm.author    || '',
    watermark = fm.watermark || '',
    theme     = fm.theme     || '',
  } = opts;

  const docTitle    = title || path.basename(absInput, path.extname(absInput));
  const bodyWithVars = substituteVariables(markdownBody, fm);

  const { highlightCss, printCss: basePrintCss, katexCss } = loadAssets();

  let printCss = basePrintCss;
  if (theme) {
    const themePath = path.resolve(theme);
    if (fs.existsSync(themePath) && path.extname(themePath).toLowerCase() === '.css') {
      const themeCss = fs.readFileSync(themePath, 'utf-8');
      printCss = basePrintCss + '\n/* ── Custom theme ── */\n' + themeCss;
    }
  }

  const { markdown } = await analyze(bodyWithVars, { autoBreak, fixHeadings: true });

  let body = marked.parse(markdown);
  // Pre-render mermaid diagrams to inline SVGs — self-contained, works offline
  body = await convertMermaidBlocks(body);
  body = inlineImages(body, baseDir);

  const tocHtml   = toc ? buildTOC(extractHeadings(body)) : '';
  const coverPage = buildCoverPage({ title: docTitle, author });

  const html = buildHtml({
    body,
    toc: tocHtml,
    coverPage,
    autoBreak,
    title: docTitle,
    highlightCss,
    // Inline KaTeX CSS for self-contained HTML (same approach as PDF)
    printCss: printCss + '\n' + (katexCss || ''),
    katexCss: '',
    watermark,
    htmlMode: false,  // mermaid pre-rendered server-side; no CDN scripts needed
  });

  fs.writeFileSync(absOutput, html, 'utf-8');
  return absOutput;
}

module.exports = { convert, convertToHtml };
