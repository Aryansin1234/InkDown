'use strict';

/**
 * docxConverter.js — Markdown → Word .docx via Pandoc
 *
 * Pipeline:
 *   1. Smart Analyzer normalizes the Markdown (headings, ASCII art, page breaks)
 *   2. Clean Markdown is written to a temp file
 *   3. Pandoc converts it to .docx with a reference template (if available)
 *
 * This replaces the previous HTML→DOM→OOXML manual walk with a single
 * Pandoc call, producing native Word styles, real TOC, and proper structure.
 */

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { analyze }  = require('./analyzer');

// ── Helpers ───────────────────────────────────────────────────
function tmpFile(ext) {
  return path.join(os.tmpdir(), `inkdown-${crypto.randomUUID()}${ext}`);
}

function cleanup(...files) {
  for (const f of files) {
    if (f && fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

/**
 * Convert `<!-- pagebreak -->` HTML comments to Pandoc's `\newpage` command
 * so Pandoc inserts actual page breaks in the DOCX output.
 */
function convertPageBreaks(md) {
  return md.replace(/<!--\s*pagebreak\s*-->/gi, '\\newpage');
}

/**
 * Find pandoc binary — check PATH first, then common install locations.
 */
function findPandoc() {
  const candidates = [
    'pandoc',
    '/opt/homebrew/bin/pandoc',
    '/usr/local/bin/pandoc',
    '/usr/bin/pandoc',
  ];
  for (const p of candidates) {
    try {
      require('child_process').execFileSync(p, ['--version'], { stdio: 'pipe' });
      return p;
    } catch { /* try next */ }
  }
  return null;
}

let _pandocPath = null;

function getPandoc() {
  if (_pandocPath) return _pandocPath;
  _pandocPath = findPandoc();
  if (!_pandocPath) {
    throw new Error(
      'Pandoc is not installed. Install it:\n' +
      '  macOS:  brew install pandoc\n' +
      '  Linux:  sudo apt install pandoc\n' +
      '  Windows: choco install pandoc\n' +
      '  Or download from https://pandoc.org/installing.html'
    );
  }
  return _pandocPath;
}

// ── Reference template path ──────────────────────────────────
const REFERENCE_DOCX = path.join(__dirname, '..', 'reference.docx');

// ══════════════════════════════════════════════════════════════
//   Main export
// ══════════════════════════════════════════════════════════════

/**
 * Convert Markdown to DOCX buffer via Pandoc.
 *
 * @param {string}  markdown - Raw markdown content
 * @param {object}  [opts]
 * @param {string}  [opts.title='Document'] - Document title
 * @param {boolean} [opts.toc=false] - Include table of contents
 * @param {boolean} [opts.autoBreak=false] - Auto page breaks before H1
 * @returns {Promise<{ buffer: Buffer, report: object }>}
 */
async function convertToDocx(markdown, opts = {}) {
  const { title = 'Document', toc = false, autoBreak = false } = opts;

  // 1. Run smart analyzer
  const { markdown: cleanMd, report } = await analyze(markdown, {
    autoBreak,
    fixHeadings: true,
  });

  // 2. Convert pagebreak comments to Pandoc \newpage
  const finalMd = convertPageBreaks(cleanMd);

  // 3. Write to temp .md file
  const inputPath  = tmpFile('.md');
  const outputPath = tmpFile('.docx');

  try {
    fs.writeFileSync(inputPath, finalMd, 'utf-8');

    // 4. Build Pandoc args
    const pandoc = getPandoc();
    const args = [
      inputPath,
      '-f', 'markdown+smart+pipe_tables+grid_tables+multiline_tables+simple_tables+strikeout+task_lists+fenced_code_blocks+backtick_code_blocks+autolink_bare_uris',
      '-t', 'docx',
      '-o', outputPath,
      '--wrap=none',
      `--metadata=title:${title}`,
    ];

    // TOC
    if (toc) {
      args.push('--toc', '--toc-depth=4');
    }

    // Reference template (custom styles)
    if (fs.existsSync(REFERENCE_DOCX)) {
      args.push(`--reference-doc=${REFERENCE_DOCX}`);
    }

    // Syntax highlighting style
    args.push('--highlight-style=tango');

    // 5. Execute Pandoc
    await new Promise((resolve, reject) => {
      execFile(pandoc, args, { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const msg = stderr || err.message;
          reject(new Error(`Pandoc conversion failed: ${msg}`));
        } else {
          resolve();
        }
      });
    });

    // 6. Read result
    const buffer = fs.readFileSync(outputPath);

    return { buffer, report };

  } finally {
    cleanup(inputPath, outputPath);
  }
}

module.exports = { convertToDocx };
