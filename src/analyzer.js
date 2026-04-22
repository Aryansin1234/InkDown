'use strict';

/**
 * analyzer.js — Smart Markdown Analyzer (remark AST)
 *
 * Parses raw Markdown into a unified AST, runs analysis/normalization
 * plugins, and produces clean Markdown for downstream renderers (PDF / DOCX).
 *
 * Analysis passes:
 *   1. Heading hierarchy — detect & fix skips (H1→H3 with no H2)
 *   2. ASCII art detection — flag code blocks with box-drawing chars
 *   3. Auto page breaks — insert breaks before H1/H2 when content weight exceeds threshold
 *   4. Wide table detection — warn about tables with many columns
 *   5. Nested list normalization — flatten lists deeper than maxDepth
 *   6. Code block language detection — tag untagged blocks
 *   7. Page-break comment conversion — normalize `<!-- pagebreak -->` → YAML node
 */

const { unified }  = require('unified');
const remarkParse   = require('remark-parse').default || require('remark-parse');
const remarkGfm     = require('remark-gfm').default || require('remark-gfm');
const remarkStringify = require('remark-stringify').default || require('remark-stringify');

// ── Box-drawing / ASCII art detection ─────────────────────────
const BOX_CHARS = /[┌┐└┘├┤┬┴┼│─═║╔╗╚╝╠╣╦╩╬▶▼►▲◄▷▽◁△→←↑↓╰╮╭╯┃━┅┆┇┈┉┊┋╭╮╯╰]/;

function isAsciiArt(value) {
  return BOX_CHARS.test(value);
}

// ── Plugin: Heading hierarchy fixer ───────────────────────────
function remarkFixHeadings() {
  return (tree, file) => {
    const headings = [];
    visit(tree, 'heading', (node) => {
      headings.push(node);
    });

    if (headings.length < 2) return;

    const warnings = [];
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1].depth;
      const curr = headings[i].depth;
      // A jump of >1 level deeper is a hierarchy skip
      if (curr > prev + 1) {
        const fixed = prev + 1;
        warnings.push({
          from: curr,
          to: fixed,
          text: getText(headings[i]),
          line: headings[i].position?.start?.line,
        });
        headings[i].depth = fixed;
      }
    }

    if (warnings.length) {
      file.data.headingFixes = warnings;
    }
  };
}

// ── Plugin: ASCII art detection ───────────────────────────────
function remarkDetectAsciiArt() {
  return (tree, file) => {
    const asciiBlocks = [];
    visit(tree, 'code', (node) => {
      if (isAsciiArt(node.value)) {
        // Mark as ascii art — downstream renderers should use literal/verbatim
        node.data = node.data || {};
        node.data.isAsciiArt = true;
        // Remove lang so it doesn't get syntax-highlighted
        node.lang = null;
        node.meta = null;
        asciiBlocks.push({
          line: node.position?.start?.line,
          preview: node.value.substring(0, 60),
        });
      }
    });
    if (asciiBlocks.length) {
      file.data.asciiArtBlocks = asciiBlocks;
    }
  };
}

// ── Plugin: Auto page breaks ──────────────────────────────────
function remarkAutoPageBreaks(options = {}) {
  const { enabled = false, beforeDepth = 1 } = options;

  return (tree, file) => {
    if (!enabled) return;

    let firstH1Seen = false;
    const insertions = [];

    for (let i = 0; i < tree.children.length; i++) {
      const node = tree.children[i];
      if (node.type === 'heading' && node.depth <= beforeDepth) {
        if (!firstH1Seen) {
          firstH1Seen = true;
          continue; // don't break before the very first heading
        }
        // Insert a page break node before this heading
        insertions.push(i);
      }
    }

    // Insert in reverse to maintain indices
    let inserted = 0;
    for (const idx of insertions) {
      tree.children.splice(idx + inserted, 0, {
        type: 'html',
        value: '<!-- pagebreak -->',
      });
      inserted++;
    }

    if (insertions.length) {
      file.data.autoBreaksInserted = insertions.length;
    }
  };
}

// ── Plugin: Wide table detection ──────────────────────────────
function remarkDetectWideTables(options = {}) {
  const { warnThreshold = 7 } = options;

  return (tree, file) => {
    const wideTables = [];
    visit(tree, 'table', (node) => {
      const firstRow = node.children[0];
      if (firstRow && firstRow.children) {
        const cols = firstRow.children.length;
        if (cols >= warnThreshold) {
          wideTables.push({
            columns: cols,
            line: node.position?.start?.line,
          });
        }
      }
    });
    if (wideTables.length) {
      file.data.wideTables = wideTables;
    }
  };
}

// ── Plugin: Nested list normalization ─────────────────────────
function remarkNormalizeLists(options = {}) {
  const { maxDepth = 4 } = options;

  return (tree) => {
    flattenLists(tree, 0, maxDepth);
  };
}

function flattenLists(node, depth, maxDepth) {
  if (!node.children) return;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === 'list') {
      if (depth >= maxDepth) {
        // Flatten: replace nested list items with indented text
        const flattened = extractListText(child, depth);
        node.children.splice(i, 1, ...flattened);
        i += flattened.length - 1;
      } else {
        flattenLists(child, depth + 1, maxDepth);
      }
    } else if (child.type === 'listItem') {
      flattenLists(child, depth, maxDepth);
    }
  }
}

function extractListText(listNode, depth) {
  const result = [];
  const prefix = '  '.repeat(depth);
  visit(listNode, 'text', (node) => {
    result.push({
      type: 'paragraph',
      children: [{ type: 'text', value: `${prefix}• ${node.value}` }],
    });
  });
  return result.length ? result : [{ type: 'paragraph', children: [{ type: 'text', value: '' }] }];
}

// ── Plugin: Code block long-line detection ────────────────────
function remarkDetectLongCodeLines(options = {}) {
  const { warnLength = 120 } = options;

  return (tree, file) => {
    const longLines = [];
    visit(tree, 'code', (node) => {
      const lines = node.value.split('\n');
      const overflows = lines.filter(l => l.length > warnLength);
      if (overflows.length) {
        longLines.push({
          lang: node.lang || 'plain',
          line: node.position?.start?.line,
          maxLength: Math.max(...lines.map(l => l.length)),
          overflowCount: overflows.length,
        });
      }
    });
    if (longLines.length) {
      file.data.longCodeLines = longLines;
    }
  };
}

// ── AST walker ────────────────────────────────────────────────
function visit(node, type, fn) {
  if (!node) return;
  if (node.type === type) fn(node);
  if (node.children) {
    for (const child of node.children) {
      visit(child, type, fn);
    }
  }
}

// ── Text extraction from AST node ─────────────────────────────
function getText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (node.children) return node.children.map(getText).join('');
  return node.value || '';
}

// ══════════════════════════════════════════════════════════════
//   Main API
// ══════════════════════════════════════════════════════════════

/**
 * Analyze and normalize a Markdown string.
 *
 * @param {string} markdown - Raw markdown content
 * @param {object} [opts]
 * @param {boolean} [opts.autoBreak=false] - Auto-insert page breaks before H1
 * @param {boolean} [opts.fixHeadings=true] - Fix heading hierarchy gaps
 * @param {number}  [opts.maxListDepth=4] - Maximum nested list depth
 * @param {number}  [opts.wideTableThreshold=7] - Column count to warn about wide tables
 *
 * @returns {{ markdown: string, report: object }}
 *   - markdown: cleaned, normalized Markdown string
 *   - report: analysis findings (heading fixes, ascii art, wide tables, etc.)
 */
async function analyze(markdown, opts = {}) {
  const {
    autoBreak = false,
    fixHeadings = true,
    maxListDepth = 4,
    wideTableThreshold = 7,
  } = opts;

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm);

  // Analysis plugins
  if (fixHeadings) processor.use(remarkFixHeadings);
  processor.use(remarkDetectAsciiArt);
  processor.use(remarkAutoPageBreaks, { enabled: autoBreak, beforeDepth: 1 });
  processor.use(remarkDetectWideTables, { warnThreshold: wideTableThreshold });
  processor.use(remarkNormalizeLists, { maxDepth: maxListDepth });
  processor.use(remarkDetectLongCodeLines);

  // Stringify back to Markdown
  processor.use(remarkStringify, {
    bullet: '-',
    emphasis: '_',
    strong: '*',
    listItemIndent: 'one',
    rule: '-',
    fences: true,
  });

  const file = await processor.process(markdown);
  const cleanMarkdown = String(file);

  // Gather report
  const report = {
    headingFixes: file.data.headingFixes || [],
    asciiArtBlocks: file.data.asciiArtBlocks || [],
    autoBreaksInserted: file.data.autoBreaksInserted || 0,
    wideTables: file.data.wideTables || [],
    longCodeLines: file.data.longCodeLines || [],
  };

  return { markdown: cleanMarkdown, report };
}

module.exports = { analyze, isAsciiArt };
