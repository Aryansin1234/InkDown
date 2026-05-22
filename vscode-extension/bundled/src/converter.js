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

  return renderer;
}

function configureMarked() {
  marked.setOptions({
    renderer: buildRenderer(),
    gfm: true,        // GitHub-Flavoured Markdown (tables, strikethrough, etc.)
    breaks: false,    // keep semantic line-break behaviour
  });

  // Syntax-highlight fenced code blocks via highlight.js
  // Mermaid blocks are left untouched — converted to diagrams via post-processing
  marked.use({
    extensions: [],
    walkTokens(token) {
      if (token.type === 'code') {
        const lang = token.lang ? token.lang.split(/\s/)[0] : '';
        // Skip mermaid — will be post-processed into diagram divs
        if (lang.toLowerCase() === 'mermaid') return;
        if (lang && hljs.getLanguage(lang)) {
          token.text = hljs.highlight(token.text, { language: lang }).value;
          token.escaped = true;
        } else {
          token.text = hljs.highlightAuto(token.text).value;
          token.escaped = true;
        }
      }
    },
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

function buildHtml({ body, toc, coverPage, autoBreak, title, highlightCss, printCss, katexCss }) {
  const bodyClass = autoBreak ? 'auto-break-h1' : '';

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
  </style>
${katexCss ? `  <link rel="stylesheet" href="${katexCss}">` : ''}
</head>
<body class="${bodyClass}">
  ${coverPage}
  ${toc}
  <main>
    ${body}
  </main>
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
  const re = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/gi;
  const matches = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    matches.push({ fullMatch: m[0], code: raw });
  }

  if (matches.length === 0) return html;

  // Launch a browser and create a SINGLE page with mermaid pre-loaded.
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
  const { toc = false, autoBreak = false, title, author = '' } = opts;

  const absInput  = path.resolve(inputPath);
  const absOutput = path.resolve(outputPath);
  const baseDir   = path.dirname(absInput);
  const docTitle  = title || path.basename(absInput, path.extname(absInput));

  if (!fs.existsSync(absInput)) {
    throw new Error(`Input file not found: ${absInput}`);
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });

  const rawMarkdown = fs.readFileSync(absInput, 'utf-8');
  const { highlightCss, printCss, katexCss } = loadAssets();

  // Smart analysis pass — normalize headings, detect issues, convert grid tables
  const { markdown, report } = await analyze(rawMarkdown, {
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
  const html = buildHtml({ body, toc: tocHtml, coverPage, autoBreak, title: docTitle, highlightCss, printCss: printCss + '\n' + (katexCss || ''), katexCss: '' });

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
      format:          'A4',
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

module.exports = { convert };
