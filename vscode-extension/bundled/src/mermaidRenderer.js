'use strict';

/**
 * mermaidRenderer.js — Render Mermaid diagram code blocks to SVG/PNG
 *
 * Uses Puppeteer to load mermaid.js and render diagrams.
 * Used by the DOCX pipeline to pre-render diagrams as images.
 */

const puppeteer = require('puppeteer');
const crypto    = require('crypto');
const fs        = require('fs');
const path      = require('path');

// ── Local mermaid.js source (no CDN dependency) ───────────────
const MERMAID_JS_PATH = path.join(__dirname, '..', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

// ── Cache rendered diagrams per session ───────────────────────
const _cache = new Map();

// ── Lazy-loaded mermaid.js source ─────────────────────────────
let _mermaidSource = null;

/**
 * Load mermaid.js source from local node_modules (no network needed).
 */
function getMermaidSource() {
  if (_mermaidSource) return _mermaidSource;
  _mermaidSource = fs.readFileSync(MERMAID_JS_PATH, 'utf-8');
  return _mermaidSource;
}

/**
 * Extract all mermaid code blocks from markdown.
 * Returns array of { code, index, fullMatch }
 */
function extractMermaidBlocks(markdown) {
  const blocks = [];
  const re = /```mermaid\s*\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    blocks.push({
      code:      m[1].trim(),
      fullMatch: m[0],
      index:     m.index,
    });
  }
  return blocks;
}

/**
 * Create a Puppeteer page with mermaid.js pre-loaded and initialized.
 * Reuse this page for multiple renders to avoid repeated CDN fetches.
 *
 * @param {object} browser - Puppeteer browser instance
 * @returns {Promise<object>} Puppeteer page with mermaid ready
 */
async function createMermaidPage(browser) {
  const page = await browser.newPage();

  // Use locally bundled mermaid.js source — no network needed
  const mermaidSrc = getMermaidSource();

  await page.setContent(`<!DOCTYPE html>
<html><head>
<style>body { margin: 0; padding: 0; background: white; }</style>
</head>
<body>
<div id="container"></div>
</body></html>`, { waitUntil: 'domcontentloaded' });

  // Inject mermaid.js from cached source (instant, no network)
  await page.addScriptTag({ content: mermaidSrc });

  await page.evaluate(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      flowchart: { useMaxWidth: true, htmlLabels: true },
      sequence: { useMaxWidth: true },
      gitGraph: { useMaxWidth: true },
    });
  });

  // Verify mermaid actually loaded
  const mermaidLoaded = await page.evaluate(() =>
    typeof mermaid !== 'undefined' && typeof mermaid.render === 'function'
  );
  if (!mermaidLoaded) {
    throw new Error('Mermaid library failed to load from local node_modules');
  }

  return page;
}

/**
 * Render a single mermaid diagram to SVG string using Puppeteer.
 *
 * @param {string} code - Mermaid diagram source code
 * @param {object} [browserOrPage] - Reuse an existing Puppeteer browser or page instance
 * @returns {Promise<string>} SVG markup
 */
async function renderToSvg(code, browserOrPage) {
  const hash = crypto.createHash('md5').update(code).digest('hex');
  if (_cache.has(hash)) return _cache.get(hash);

  // Determine if we received a page (with mermaid pre-loaded) or a browser
  const isPage = browserOrPage && typeof browserOrPage.evaluate === 'function';
  let page, ownBrowser = false, browser;

  if (isPage) {
    // Reuse the provided page (mermaid already loaded — fastest path)
    page = browserOrPage;
  } else {
    browser = browserOrPage;
    if (!browser) {
      ownBrowser = true;
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }
    page = await createMermaidPage(browser);
  }

  try {
    const diagramId = 'mmd-' + hash.slice(0, 8);
    const svg = await page.evaluate(async (diagramCode, id) => {
      // Clean up any leftover elements from previous renders
      const old = document.getElementById(id);
      if (old) old.remove();
      const oldD = document.getElementById('d' + id);
      if (oldD) oldD.remove();

      try {
        const { svg } = await mermaid.render(id, diagramCode);
        return svg;
      } catch (e) {
        // Retry once with a different ID (mermaid leaves broken DOM elements)
        try {
          const errEl = document.getElementById('d' + id);
          if (errEl) errEl.remove();
          const { svg } = await mermaid.render(id + '-r', diagramCode);
          return svg;
        } catch (e2) {
          return '__ERROR__:' + (e2.message || e.message || String(e2));
        }
      }
    }, code, diagramId);

    if (svg && typeof svg === 'string' && svg.startsWith('__ERROR__:')) {
      console.error('  ⚠ Mermaid render error:', svg.slice(9));
      return null;
    }
    if (svg) _cache.set(hash, svg);
    return svg;
  } finally {
    // Only close the page if we created it (not if it was passed in for reuse)
    if (!isPage && page) await page.close();
    if (ownBrowser && browser) await browser.close();
  }
}

/**
 * Render a mermaid diagram to a PNG buffer using Puppeteer.
 * Used for DOCX embedding where SVG support is limited.
 *
 * @param {string} code - Mermaid diagram source code
 * @param {object} [opts]
 * @param {number} [opts.scale=2] - Device scale factor for high-DPI output
 * @param {object} [opts.browser] - Reuse existing Puppeteer browser
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function renderToPng(code, opts = {}) {
  const { scale = 2, browser: existingBrowser } = opts;

  // Detect diagram type to choose appropriate viewport width
  const trimmedCode = code.trim().toLowerCase();
  const isGantt    = trimmedCode.startsWith('gantt');
  const isSequence = trimmedCode.startsWith('sequencediagram');
  const isGitGraph = trimmedCode.startsWith('gitgraph');
  const isER       = trimmedCode.startsWith('erdiagram');

  // Gantt/sequence/git charts need wider viewports to avoid label overlap;
  // standard flowcharts and others fit in normal DOCX page width (~680px)
  const maxWidth = isGantt ? 1100 : (isSequence || isGitGraph) ? 960 : (opts.maxWidth || 680);

  const ownBrowser = !existingBrowser;
  const browser = existingBrowser || await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: maxWidth, height: 800, deviceScaleFactor: scale });

    const mermaidSrc = getMermaidSource();

    await page.setContent(`<!DOCTYPE html>
<html><head>
<style>
  body { margin: 0; padding: 10px; background: white; }
  #container {
    width: 100%;
    max-width: ${maxWidth - 20}px;
    overflow: visible;
  }
  #container svg {
    max-width: 100% !important;
    height: auto !important;
  }
</style>
</head>
<body>
<div id="container"></div>
</body></html>`, { waitUntil: 'domcontentloaded' });

    await page.addScriptTag({ content: mermaidSrc });

    // Configure mermaid — Gantt charts use useMaxWidth:false so they render
    // at natural width (the wider viewport gives them room), preventing
    // date-label overlap.  Other diagrams constrain to container.
    await page.evaluate((containerWidth, isGanttChart) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        flowchart:  { useMaxWidth: true, htmlLabels: true },
        sequence:   { useMaxWidth: true },
        gitGraph:   { useMaxWidth: true },
        er:         { useMaxWidth: true, layoutDirection: 'TB',
                      fontSize: 10, entityPadding: 10,
                      minEntityWidth: 80, minEntityHeight: 40 },
        gantt:      { useMaxWidth: !isGanttChart,
                      fontSize: 12, barHeight: 28, barGap: 8,
                      sectionFontSize: 13, numberSectionStyles: 4,
                      leftPadding: 100, topPadding: 50,
                      tickInterval: 'month',
                      axisFormat: '%b %Y' },
      });
    }, maxWidth - 20, isGantt);

    const rendered = await page.evaluate(async (diagramCode, gantt) => {
      try {
        const { svg } = await mermaid.render('mermaid-diagram', diagramCode);
        document.getElementById('container').innerHTML = svg;

        const svgEl = document.querySelector('#container svg');
        if (svgEl) {
          if (gantt) {
            // Let Gantt charts use their natural width — we have a wide viewport
            svgEl.style.width = 'auto';
            svgEl.style.maxWidth = 'none';
            svgEl.style.height = 'auto';
          } else {
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
            svgEl.style.width = '100%';
          }

          // For ER diagrams, scale down further to prevent overflow
          const isER = diagramCode.trim().toLowerCase().startsWith('erdiagram');
          if (isER) {
            svgEl.style.transform = 'scale(0.75)';
            svgEl.style.transformOrigin = 'top left';
          }
        }
        return true;
      } catch (e) {
        return false;
      }
    }, code, isGantt);

    if (!rendered) {
      await page.close();
      return null;
    }

    // Wait briefly for any reflow
    await new Promise(r => setTimeout(r, 100));

    // Clip to the diagram bounding box
    const clip = await page.evaluate(() => {
      const el = document.querySelector('#container svg');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: Math.max(0, rect.x - 5),
        y: Math.max(0, rect.y - 5),
        width: Math.min(rect.width + 10, window.innerWidth),
        height: rect.height + 10,
      };
    });

    const pngBuffer = await page.screenshot({
      type: 'png',
      clip: clip || undefined,
      omitBackground: false,
    });

    await page.close();
    return pngBuffer;
  } finally {
    if (ownBrowser) await browser.close();
  }
}

/**
 * Replace all mermaid code blocks in markdown with rendered PNG images.
 * Writes PNG files to the given directory and returns modified markdown.
 *
 * @param {string} markdown - Raw markdown content
 * @param {string} outputDir - Directory to write PNG files
 * @param {object} [opts]
 * @param {boolean} [opts.includeSource=true] - Include source code as caption for editability
 * @returns {Promise<{ markdown: string, diagramCount: number }>}
 */
async function replaceMermaidWithImages(markdown, outputDir, opts = {}) {
  const { includeSource = true } = opts;
  const blocks = extractMermaidBlocks(markdown);
  if (blocks.length === 0) return { markdown, diagramCount: 0 };

  const fs   = require('fs');
  const path = require('path');
  fs.mkdirSync(outputDir, { recursive: true });

  // Launch one browser for all diagrams
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let result = markdown;

  try {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const pngPath = path.join(outputDir, `mermaid-diagram-${i + 1}.png`);

      const png = await renderToPng(block.code, { browser });

      if (png) {
        fs.writeFileSync(pngPath, png);

        // Build replacement: image + optional editable source
        let replacement = `![Mermaid Diagram ${i + 1}](${pngPath})`;

        if (includeSource) {
          // Add source code in a collapsed/caption block so users can edit & regenerate
          replacement += `\n\n<!-- mermaid-source\n${block.code}\nmermaid-source -->`;
        }

        result = result.replace(block.fullMatch, replacement);
      }
      // If rendering fails, leave the code block as-is
    }
  } finally {
    await browser.close();
  }

  return { markdown: result, diagramCount: blocks.length };
}

module.exports = {
  extractMermaidBlocks,
  createMermaidPage,
  renderToSvg,
  renderToPng,
  replaceMermaidWithImages,
};
