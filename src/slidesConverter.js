'use strict';

/**
 * slidesConverter.js — Markdown → Reveal.js HTML presentation
 *
 * Slide rules:
 *   - Horizontal slides: separated by `---` (hr) on its own line
 *   - Vertical slides:   separated by `----` (double hr)
 *   - If no explicit separators exist, every H1/H2 starts a new horizontal slide
 *
 * Supported frontmatter:
 *   theme:       string  — reveal.js theme (black|white|league|beige|sky|night|serif|simple|solarized|moon|dracula) default: black
 *   transition:  string  — slide|fade|convex|concave|zoom|none — default: slide
 *   highlight:   string  — highlight.js theme name — default: monokai
 *   title:       string  — presentation title
 *   author:      string  — shown in title slide
 *   controls:    boolean — show navigation arrows (default: true)
 *   progress:    boolean — show progress bar (default: true)
 */

const { marked } = require('marked');
const hljs       = require('highlight.js');
const { parseFrontmatter, substituteVariables } = require('./frontmatter');
const { analyze } = require('./analyzer');
const fs   = require('fs');
const path = require('path');

const REVEAL_CDN = 'https://cdn.jsdelivr.net/npm/reveal.js@5.1.0';

const VALID_THEMES = new Set([
  'black', 'white', 'league', 'beige', 'sky', 'night',
  'serif', 'simple', 'solarized', 'moon', 'dracula',
]);

const VALID_TRANSITIONS = new Set([
  'none', 'fade', 'slide', 'convex', 'concave', 'zoom',
]);

// ── Configure marked (lightweight — no cover page, no TOC) ────
function buildSlideRenderer() {
  const renderer = new marked.Renderer();
  // Keep heading ids for fragment targeting
  renderer.heading = function ({ text, depth, raw }) {
    const slug = raw.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
  };
  return renderer;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function configureMarkedForSlides() {
  const localMarked = marked;
  localMarked.setOptions({ renderer: buildSlideRenderer(), gfm: true, breaks: false });
  localMarked.use({
    walkTokens(token) {
      if (token.type === 'code') {
        const lang = token.lang ? token.lang.split(/\s/)[0] : '';
        if (lang && hljs.getLanguage(lang)) {
          token.text = hljs.highlight(token.text, { language: lang }).value;
          token.escaped = true;
        } else if (token.text) {
          token.text = hljs.highlightAuto(token.text).value;
          token.escaped = true;
        }
      }
    },
  });
}

configureMarkedForSlides();

/**
 * Split markdown content into slides.
 * `---` = horizontal slide break
 * `----` = vertical slide break (nested within the previous horizontal group)
 */
function splitIntoSlides(markdown) {
  // Normalise line endings
  const text = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Check if the document uses explicit separators
  const hasExplicit = /^-{3,}\s*$/m.test(text);

  let rawSlides; // array of { content: string, vertical?: boolean }

  if (hasExplicit) {
    // Split on `----` (vertical) first, then `---` (horizontal)
    // We preserve which separators were `----` so we can build nested sections
    const lines = text.split('\n');
    const groups = []; // [{type:'h'|'v', lines:[]}]
    let current = { type: 'h', lines: [] };

    for (const line of lines) {
      if (/^----\s*$/.test(line)) {
        groups.push(current);
        current = { type: 'v', lines: [] };
      } else if (/^---\s*$/.test(line)) {
        groups.push(current);
        current = { type: 'h', lines: [] };
      } else {
        current.lines.push(line);
      }
    }
    groups.push(current);
    rawSlides = groups;
  } else {
    // Auto-split: each H1 or H2 starts a new slide
    const lines = text.split('\n');
    const groups = [];
    let current = { type: 'h', lines: [] };

    for (const line of lines) {
      if (/^#{1,2}\s+/.test(line) && current.lines.some(l => l.trim() !== '')) {
        groups.push(current);
        current = { type: 'h', lines: [] };
      }
      current.lines.push(line);
    }
    groups.push(current);
    rawSlides = groups;
  }

  // Filter out empty slides
  return rawSlides
    .map(g => ({ type: g.type, content: g.lines.join('\n').trim() }))
    .filter(g => g.content);
}

/**
 * Build the nested <section> structure for Reveal.js.
 * Vertical slides are grouped inside their parent horizontal section.
 */
function buildSections(slides) {
  const sections = [];
  let currentHorizontal = null;

  for (const slide of slides) {
    const html = marked.parse(slide.content);
    if (slide.type === 'h') {
      currentHorizontal = { html, verticals: [] };
      sections.push(currentHorizontal);
    } else {
      // vertical — nested under the last horizontal
      if (!currentHorizontal) {
        currentHorizontal = { html: '', verticals: [] };
        sections.push(currentHorizontal);
      }
      currentHorizontal.verticals.push(html);
    }
  }

  return sections
    .map(sec => {
      if (sec.verticals.length === 0) {
        return `<section>\n${sec.html}\n</section>`;
      }
      // Wrap horizontal + its verticals in an outer <section>
      const inner = [`<section>\n${sec.html}\n</section>`, ...sec.verticals.map(v => `<section>\n${v}\n</section>`)];
      return `<section>\n${inner.join('\n')}\n</section>`;
    })
    .join('\n');
}

/**
 * Convert Markdown to a self-contained Reveal.js HTML presentation.
 *
 * @param {string} inputPath  - Path to .md file
 * @param {string} outputPath - Desired .html output path
 * @param {object} [opts]
 * @param {string} [opts.theme='black']     - Reveal.js theme name
 * @param {string} [opts.transition='slide'] - Slide transition
 * @param {string} [opts.title]             - Presentation title
 * @returns {Promise<string>} output path
 */
async function convertToSlides(inputPath, outputPath, opts = {}) {
  const absInput  = path.resolve(inputPath);
  const absOutput = path.resolve(outputPath);

  if (!fs.existsSync(absInput)) {
    throw new Error(`Input file not found: ${absInput}`);
  }
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });

  const rawMarkdown = fs.readFileSync(absInput, 'utf-8');
  const { data: fm, content: markdownBody } = parseFrontmatter(rawMarkdown);

  const theme      = VALID_THEMES.has(opts.theme ?? fm.theme)      ? (opts.theme ?? fm.theme) : 'black';
  const transition = VALID_TRANSITIONS.has(opts.transition ?? fm.transition) ? (opts.transition ?? fm.transition) : 'slide';
  const title      = opts.title ?? fm.title ?? path.basename(absInput, path.extname(absInput));
  const author     = opts.author ?? fm.author ?? '';
  const controls   = opts.controls  ?? fm.controls  ?? true;
  const progress   = opts.progress  ?? fm.progress  ?? true;

  const body = substituteVariables(markdownBody, fm);

  // Run through the smart analyzer to normalize headings
  const { markdown } = await analyze(body, { autoBreak: false, fixHeadings: false });

  const slides = splitIntoSlides(markdown);
  const sectionsHtml = buildSections(slides);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${REVEAL_CDN}/dist/reset.css">
  <link rel="stylesheet" href="${REVEAL_CDN}/dist/reveal.css">
  <link rel="stylesheet" href="${REVEAL_CDN}/dist/theme/${theme}.css">
  <link rel="stylesheet" href="${REVEAL_CDN}/plugin/highlight/monokai.css">
  <style>
    .reveal section img { max-height: 60vh; max-width: 90%; object-fit: contain; }
    .reveal pre { font-size: 0.55em; }
    .reveal .slides { text-align: left; }
    .reveal h1, .reveal h2 { text-align: center; }
    /* Author subtitle on title slide */
    .reveal .author { font-size: 0.7em; color: #aaa; text-align: center; margin-top: 0.5em; }
  </style>
</head>
<body>
<div class="reveal">
  <div class="slides">
${sectionsHtml}
  </div>
</div>
<script src="${REVEAL_CDN}/dist/reveal.js"></script>
<script src="${REVEAL_CDN}/plugin/notes/notes.js"></script>
<script src="${REVEAL_CDN}/plugin/highlight/highlight.js"></script>
<script src="${REVEAL_CDN}/plugin/math/math.js"></script>
<script>
  Reveal.initialize({
    hash: true,
    controls: ${Boolean(controls)},
    progress: ${Boolean(progress)},
    transition: '${transition}',
    plugins: [ RevealHighlight, RevealNotes, RevealMath.KaTeX ],
  });
</script>
</body>
</html>`;

  fs.writeFileSync(absOutput, html, 'utf-8');
  return absOutput;
}

module.exports = { convertToSlides };
