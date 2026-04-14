'use strict';

/**
 * docxConverter.js — Markdown → Word .docx
 *
 * Pipeline (mirrors the PDF converter exactly):
 *   1. Markdown → HTML   via  marked + highlight.js  (same as converter.js)
 *   2. HTML    → DOM     via  node-html-parser
 *   3. DOM     → OOXML   via  docx package
 *
 * This ensures the DOCX has the same content, structure, and styling as the PDF.
 */

const { parse: parseHTML, NodeType } = require('node-html-parser');
const { marked }  = require('marked');
const hljs        = require('highlight.js');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, TableLayoutType,
  AlignmentType, BorderStyle, PageBreak, ExternalHyperlink,
  convertInchesToTwip, LevelFormat,
  ShadingType, Footer, PageNumber, TabStopPosition, TabStopType,
  ImageRun,
} = require('docx');

// ── Helpers ───────────────────────────────────────────────────
const HP  = (pt) => pt * 2;                           // points → half-points
const CM  = (cm) => convertInchesToTwip(cm / 2.54);   // cm → twips
const TWIP = (mm) => Math.round(mm * 56.7);           // mm → twips

// ── Colours (match styles.css) ────────────────────────────────
const C = {
  body:      '24292e',
  heading:   '111111',
  headingSm: '24292e',
  muted:     '6a737d',
  link:      '0366d6',
  codeFg:    '24292e',
  codeBg:    'f6f8fa',
  border:    'e1e4e8',
  quoteBorder: 'dfe2e5',
  tableBg:   'f6f8fa',
  altRow:    'f9fafb',
};

const BORDER_STYLE = { style: BorderStyle.SINGLE, size: 4, color: C.border };
const NO_BORDER    = { style: BorderStyle.NONE, size: 0 };

// ── Slugify (same as converter.js) ────────────────────────────
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// ── Configure marked (identical to converter.js) ─────────────
function buildRenderer() {
  const renderer = new marked.Renderer();
  renderer.heading = function ({ text, depth, raw }) {
    const id = slugify(raw);
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };
  renderer.html = function ({ text }) {
    return text.replace(
      /<!--\s*pagebreak\s*-->/gi,
      '<div class="page-break"></div>'
    );
  };
  return renderer;
}

function configureMarked() {
  marked.setOptions({ renderer: buildRenderer(), gfm: true, breaks: false });
  marked.use({
    walkTokens(token) {
      if (token.type === 'code') {
        const lang = token.lang ? token.lang.split(/\s/)[0] : '';
        // Detect ASCII art / box-drawing — skip highlighting
        const hasBox = /[┌┐└┘├┤┬┴┼│─═║╔╗╚╝╠╣╦╩╬▶▼►▲◄▷▽◁△→←↑↓╰╮╭╯┃]/.test(token.text);
        if (hasBox) {
          token.escaped = true;
          token.text = token.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          token._isAsciiArt = true;
        } else if (lang && hljs.getLanguage(lang)) {
          token.text = hljs.highlight(token.text, { language: lang }).value;
          token.escaped = true;
        } else {
          token.text = hljs.highlightAuto(token.text).value;
          token.escaped = true;
        }
      }
    },
  });
}
configureMarked();

// ── HTML entity decode ────────────────────────────────────────
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, '\u00A0')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ══════════════════════════════════════════════════════════════
//   DOM → docx  (inline elements → TextRun[])
// ══════════════════════════════════════════════════════════════

function collectInlineRuns(node, inherited = {}) {
  const runs = [];
  if (!node) return runs;

  if (node.nodeType === NodeType.TEXT_NODE) {
    const raw = decodeEntities(node.rawText);
    if (!raw) return runs;
    const props = {
      text: raw,
      font: inherited.font,
      size: inherited.size,
      bold: inherited.bold,
      italics: inherited.italics,
      strike: inherited.strike,
      color: inherited.color || C.body,
    };
    if (inherited.code) {
      props.font = 'Consolas';
      props.size = HP(9.5);
      props.color = C.codeFg;
      props.shading = { type: ShadingType.SOLID, fill: C.codeBg };
    }
    runs.push(new TextRun(props));
    return runs;
  }

  if (node.nodeType !== NodeType.ELEMENT_NODE) return runs;

  const tag = (node.tagName || '').toUpperCase();
  const kids = node.childNodes || [];

  switch (tag) {
    case 'STRONG': case 'B':
      for (const k of kids) runs.push(...collectInlineRuns(k, { ...inherited, bold: true }));
      break;
    case 'EM': case 'I':
      for (const k of kids) runs.push(...collectInlineRuns(k, { ...inherited, italics: true }));
      break;
    case 'DEL': case 'S':
      for (const k of kids) runs.push(...collectInlineRuns(k, { ...inherited, strike: true }));
      break;
    case 'CODE':
      for (const k of kids) runs.push(...collectInlineRuns(k, { ...inherited, code: true }));
      break;
    case 'A': {
      const href = node.getAttribute('href') || '';
      const innerRuns = [];
      for (const k of kids) innerRuns.push(...collectInlineRuns(k, { ...inherited, color: C.link }));
      // Wrap in hyperlink if valid href
      if (href && /^https?:\/\//.test(href)) {
        runs.push(new ExternalHyperlink({ link: href, children: innerRuns }));
      } else {
        runs.push(...innerRuns);
      }
      break;
    }
    case 'BR':
      runs.push(new TextRun({ text: '', break: 1 }));
      break;
    case 'SPAN':
      // hljs wraps tokens in <span class="hljs-...">; pass through
      for (const k of kids) runs.push(...collectInlineRuns(k, inherited));
      break;
    case 'IMG': {
      const alt = node.getAttribute('alt') || 'image';
      runs.push(new TextRun({ text: `[${alt}]`, color: C.muted, italics: true }));
      break;
    }
    default:
      for (const k of kids) runs.push(...collectInlineRuns(k, inherited));
  }
  return runs;
}

// ══════════════════════════════════════════════════════════════
//   DOM → docx  (block elements → Paragraph / Table / etc.)
// ══════════════════════════════════════════════════════════════

function processBlock(node, ctx = {}) {
  const elements = [];
  if (!node) return elements;

  if (node.nodeType === NodeType.TEXT_NODE) {
    const txt = node.rawText.trim();
    if (txt) {
      elements.push(new Paragraph({
        spacing: { after: 120, line: 276 },
        children: [new TextRun({ text: decodeEntities(txt), color: C.body })],
      }));
    }
    return elements;
  }

  if (node.nodeType !== NodeType.ELEMENT_NODE) return elements;

  const tag = (node.tagName || '').toUpperCase();
  const kids = node.childNodes || [];

  // ── Headings ───────────────────────────────────────────────
  if (/^H([1-6])$/.test(tag)) {
    const depth = parseInt(tag[1], 10);
    const cfg = {
      1: { heading: HeadingLevel.HEADING_1, size: HP(22), color: C.heading,   spacing: { before: 360, after: 140 }, bold: true },
      2: { heading: HeadingLevel.HEADING_2, size: HP(17), color: C.heading,   spacing: { before: 300, after: 120 }, bold: true },
      3: { heading: HeadingLevel.HEADING_3, size: HP(14), color: C.headingSm, spacing: { before: 260, after: 100 }, bold: true },
      4: { heading: HeadingLevel.HEADING_4, size: HP(12), color: C.headingSm, spacing: { before: 220, after: 80 },  bold: true },
      5: { heading: HeadingLevel.HEADING_5, size: HP(11), color: C.headingSm, spacing: { before: 180, after: 60 },  bold: true },
      6: { heading: HeadingLevel.HEADING_6, size: HP(10), color: C.muted,     spacing: { before: 180, after: 60 },  bold: true },
    }[depth];

    const runs = collectInlineRuns(node, { size: cfg.size, color: cfg.color, bold: cfg.bold });
    elements.push(new Paragraph({
      heading: cfg.heading,
      spacing: cfg.spacing,
      children: runs.length ? runs : [new TextRun({ text: node.textContent || '', size: cfg.size, color: cfg.color, bold: true })],
      // H1 & H2 get a bottom border (like the PDF CSS)
      border: depth <= 2 ? {
        bottom: { style: BorderStyle.SINGLE, size: depth === 1 ? 8 : 4, color: C.border, space: 4 },
      } : undefined,
    }));
    return elements;
  }

  // ── Paragraph ──────────────────────────────────────────────
  if (tag === 'P') {
    const runs = collectInlineRuns(node, ctx.inheritedStyle || {});
    if (runs.length) {
      elements.push(new Paragraph({
        spacing: { after: 140, line: 276 },
        indent: ctx.indent ? { left: ctx.indent } : undefined,
        children: runs,
      }));
    }
    return elements;
  }

  // ── Code block: <pre><code>…</code></pre> ──────────────────
  if (tag === 'PRE') {
    const codeNode = node.querySelector('code');
    const rawText = codeNode
      ? decodeEntities(codeNode.textContent || '')
      : decodeEntities(node.textContent || '');
    const lines = rawText.replace(/\r\n/g, '\n').split('\n');
    // Trim trailing empty line
    if (lines.length && lines[lines.length - 1] === '') lines.pop();

    const codeBorder = {
      top:    BORDER_STYLE,
      bottom: BORDER_STYLE,
      left:   BORDER_STYLE,
      right:  BORDER_STYLE,
    };

    for (let i = 0; i < lines.length; i++) {
      const isFirst = i === 0;
      const isLast  = i === lines.length - 1;
      elements.push(new Paragraph({
        spacing: { before: isFirst ? 120 : 0, after: isLast ? 120 : 0, line: 228 },
        indent: { left: CM(0.3), right: CM(0.3) },
        shading: { type: ShadingType.SOLID, fill: C.codeBg },
        border: codeBorder,
        children: [new TextRun({
          text: lines[i] || ' ',
          font: 'Consolas',
          size: HP(9),
          color: C.codeFg,
        })],
      }));
    }
    return elements;
  }

  // ── Blockquote ─────────────────────────────────────────────
  if (tag === 'BLOCKQUOTE') {
    for (const kid of kids) {
      const inner = processBlock(kid, { ...ctx, inheritedStyle: { color: C.muted } });
      for (const el of inner) {
        if (el instanceof Paragraph) {
          // Re-create with left border + indent
          const props = {
            spacing: { after: 100, line: 276 },
            indent: { left: CM(0.8) },
            border: {
              left: { style: BorderStyle.SINGLE, size: 16, color: C.quoteBorder, space: 8 },
            },
            children: el.root && el.root[0] && el.root[0].root
              ? el.root[0].root
              : [new TextRun({ text: node.textContent || '', color: C.muted })],
          };
          elements.push(new Paragraph(props));
        } else {
          elements.push(el);
        }
      }
    }
    return elements;
  }

  // ── Lists ──────────────────────────────────────────────────
  if (tag === 'UL' || tag === 'OL') {
    const ordered = tag === 'OL';
    const depth = ctx.listDepth || 0;
    const listItems = kids.filter(k => (k.tagName || '').toUpperCase() === 'LI');

    for (const li of listItems) {
      // Gather direct text (not sub-lists)
      const inlineRuns = [];
      const subLists = [];
      for (const child of (li.childNodes || [])) {
        const ct = (child.tagName || '').toUpperCase();
        if (ct === 'UL' || ct === 'OL') {
          subLists.push(child);
        } else if (ct === 'P') {
          // Unwrap <p> inside <li>
          inlineRuns.push(...collectInlineRuns(child));
        } else {
          inlineRuns.push(...collectInlineRuns(child));
        }
      }

      elements.push(new Paragraph({
        numbering: { reference: ordered ? 'ordered-list' : 'bullet-list', level: depth },
        spacing: { after: 60, line: 264 },
        children: inlineRuns.length ? inlineRuns : [new TextRun({ text: decodeEntities(li.textContent || '') })],
      }));

      // Recurse nested lists
      for (const sub of subLists) {
        elements.push(...processBlock(sub, { ...ctx, listDepth: depth + 1 }));
      }
    }
    return elements;
  }

  // ── Table ──────────────────────────────────────────────────
  if (tag === 'TABLE') {
    const thead = node.querySelector('thead');
    const tbody = node.querySelector('tbody');
    const rows = [];

    const tBorder = {
      top: BORDER_STYLE, bottom: BORDER_STYLE,
      left: BORDER_STYLE, right: BORDER_STYLE,
      insideH: BORDER_STYLE, insideV: BORDER_STYLE,
    };

    // Header row
    if (thead) {
      const headerTr = thead.querySelectorAll('tr');
      for (const tr of headerTr) {
        const cells = tr.querySelectorAll('th,td');
        rows.push(new TableRow({
          tableHeader: true,
          children: cells.map(td => new TableCell({
            shading: { type: ShadingType.SOLID, fill: C.tableBg },
            borders: tBorder,
            children: [new Paragraph({
              spacing: { before: 60, after: 60 },
              children: collectInlineRuns(td, { bold: true, size: HP(10), color: C.body }),
            })],
          })),
        }));
      }
    }

    // Body rows
    if (tbody) {
      const bodyTrs = tbody.querySelectorAll('tr');
      bodyTrs.forEach((tr, ri) => {
        const cells = tr.querySelectorAll('td,th');
        rows.push(new TableRow({
          children: cells.map(td => new TableCell({
            shading: ri % 2 === 1
              ? { type: ShadingType.SOLID, fill: C.altRow }
              : undefined,
            borders: tBorder,
            children: [new Paragraph({
              spacing: { before: 50, after: 50 },
              children: collectInlineRuns(td, { size: HP(10) }),
            })],
          })),
        }));
      });
    }

    if (rows.length) {
      elements.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.AUTOFIT,
        rows,
      }));
      elements.push(new Paragraph({ spacing: { after: 140 }, children: [] }));
    }
    return elements;
  }

  // ── Horizontal rule ────────────────────────────────────────
  if (tag === 'HR') {
    elements.push(new Paragraph({
      spacing: { before: 240, after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.border } },
      children: [],
    }));
    return elements;
  }

  // ── Page break ─────────────────────────────────────────────
  if (tag === 'DIV') {
    const cls = node.getAttribute('class') || '';
    if (cls.includes('page-break')) {
      elements.push(new Paragraph({ children: [new PageBreak()] }));
      return elements;
    }
    // Generic div: recurse
    for (const k of kids) elements.push(...processBlock(k, ctx));
    return elements;
  }

  // ── Fallback: recurse into any other block element ─────────
  if (['MAIN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY'].includes(tag)) {
    for (const k of kids) elements.push(...processBlock(k, ctx));
    return elements;
  }

  // Unknown block element — try to extract text
  const fallbackRuns = collectInlineRuns(node);
  if (fallbackRuns.length) {
    elements.push(new Paragraph({
      spacing: { after: 120, line: 276 },
      children: fallbackRuns,
    }));
  }
  return elements;
}

// ── Numbering config ─────────────────────────────────────────
function buildNumberingConfig() {
  return {
    config: [
      {
        reference: 'bullet-list',
        levels: [0, 1, 2, 3, 4].map(level => ({
          level,
          format: LevelFormat.BULLET,
          text:   ['\u2022', '\u25E6', '\u25AA', '\u2022', '\u25E6'][level],
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: CM(0.7) * (level + 1), hanging: CM(0.4) } } },
        })),
      },
      {
        reference: 'ordered-list',
        levels: [0, 1, 2, 3, 4].map(level => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: CM(0.7) * (level + 1), hanging: CM(0.4) } } },
        })),
      },
    ],
  };
}

// ── TOC builder ──────────────────────────────────────────────
function buildTocParagraphs(html) {
  const headings = [];
  const re = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    headings.push({
      level: parseInt(m[1], 10),
      title: m[2].replace(/<[^>]+>/g, ''),
    });
  }
  if (!headings.length) return [];

  const paras = [];
  paras.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 0, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border, space: 6 } },
    children: [new TextRun({ text: 'Table of Contents', bold: true, size: HP(15), color: C.heading })],
  }));

  for (const h of headings) {
    const indent = h.level <= 2 ? 0 : CM(0.6) * (h.level - 2);
    paras.push(new Paragraph({
      spacing: { after: 40 },
      indent: { left: indent },
      children: [new TextRun({
        text: h.title,
        color: C.link,
        size: h.level <= 2 ? HP(11) : HP(10),
        bold: h.level <= 2,
      })],
    }));
  }
  paras.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  return paras;
}

// ══════════════════════════════════════════════════════════════
//   Main export
// ══════════════════════════════════════════════════════════════
async function convertToDocx(markdown, opts = {}) {
  const { title = 'Document', toc = false, autoBreak = false } = opts;

  // Inject page breaks before H1s (same logic as PDF)
  if (autoBreak) {
    let first = true;
    markdown = markdown.replace(/^(#{1}\s)/gm, (m) => {
      if (first) { first = false; return m; }
      return `<!-- pagebreak -->\n${m}`;
    });
  }

  // 1. Markdown → HTML (exact same pipeline as PDF converter)
  const html = marked.parse(markdown);

  // 2. Parse HTML DOM
  const dom = parseHTML(html, { comment: false, blockTextElements: { pre: true, code: true } });

  // 3. Walk DOM → docx elements
  const bodyElements = [];

  // Optional TOC
  if (toc) bodyElements.push(...buildTocParagraphs(html));

  for (const node of dom.childNodes) {
    bodyElements.push(...processBlock(node));
  }

  // 4. Build document
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({ text: `${title}  `, size: HP(9), color: C.muted, font: 'Calibri' }),
          new TextRun({ size: HP(9), color: C.muted, font: 'Calibri', children: [PageNumber.CURRENT] }),
          new TextRun({ text: ' / ', size: HP(9), color: C.muted, font: 'Calibri' }),
          new TextRun({ size: HP(9), color: C.muted, font: 'Calibri', children: [PageNumber.TOTAL_PAGES] }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: 'InkDown',
    title,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: HP(11), color: C.body },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    numbering: buildNumberingConfig(),
    sections: [{
      properties: {
        page: {
          margin: { top: CM(2), bottom: CM(2.2), left: CM(1.8), right: CM(1.8) },
        },
      },
      footers: { default: footer },
      children: bodyElements,
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { convertToDocx };
