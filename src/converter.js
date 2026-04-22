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
  marked.use({
    extensions: [],
    walkTokens(token) {
      if (token.type === 'code') {
        const lang = token.lang ? token.lang.split(/\s/)[0] : '';
        if (lang && hljs.getLanguage(lang)) {
          token.text = hljs.highlight(token.text, { language: lang }).value;
          token.escaped = true;        // tell marked the HTML is already safe
        } else {
          token.text = hljs.highlightAuto(token.text).value;
          token.escaped = true;
        }
      }
    },
  });
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
function buildHtml({ body, toc, autoBreak, title, highlightCss, printCss }) {
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
</head>
<body class="${bodyClass}">
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

  return { highlightCss, printCss };
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
  const { toc = false, autoBreak = false, title } = opts;

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
  const { highlightCss, printCss } = loadAssets();

  // Smart analysis pass — normalize headings, detect issues
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

  // Parse Markdown → HTML
  let body = marked.parse(markdown);

  // Inline local images
  body = inlineImages(body, baseDir);

  // Build optional TOC
  const tocHtml = toc ? buildTOC(extractHeadings(body)) : '';

  // Assemble full HTML document
  const html = buildHtml({ body, toc: tocHtml, autoBreak, title: docTitle, highlightCss, printCss });

  // Launch Puppeteer and render PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // setContent waits for DOM; waitUntil ensures fonts / images are loaded
    await page.setContent(html, { waitUntil: 'networkidle0' });

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
