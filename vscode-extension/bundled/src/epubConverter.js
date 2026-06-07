'use strict';

/**
 * epubConverter.js — Markdown → EPUB via Pandoc
 *
 * Pipeline:
 *   1. Parse YAML frontmatter (title, author, date)
 *   2. Variable substitution ({{key}} placeholders)
 *   3. Smart Analyzer normalises headings / page breaks
 *   4. Pandoc converts to EPUB3
 */

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { analyze }  = require('./analyzer');
const { parseFrontmatter, substituteVariables } = require('./frontmatter');

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

// ── Locate Pandoc ─────────────────────────────────────────────
const PANDOC_CANDIDATES = [
  'pandoc',
  '/opt/homebrew/bin/pandoc',
  '/usr/local/bin/pandoc',
  '/usr/bin/pandoc',
];

let _pandocPath = null;

function getPandoc() {
  if (_pandocPath) return _pandocPath;
  for (const p of PANDOC_CANDIDATES) {
    try {
      require('child_process').execFileSync(p, ['--version'], { stdio: 'pipe' });
      _pandocPath = p;
      return _pandocPath;
    } catch { /* try next */ }
  }
  throw new Error(
    'Pandoc is not installed. Install it:\n' +
    '  macOS:  brew install pandoc\n' +
    '  Linux:  sudo apt install pandoc\n' +
    '  Windows: choco install pandoc\n' +
    '  Or download from https://pandoc.org/installing.html'
  );
}

/**
 * Convert Markdown to EPUB3 buffer via Pandoc.
 *
 * @param {string}  rawMarkdown - Raw markdown content (may include frontmatter)
 * @param {object}  [opts]
 * @param {string}  [opts.title='Document']
 * @param {string}  [opts.author='']
 * @param {string}  [opts.date='']
 * @param {boolean} [opts.toc=false]
 * @param {string}  [opts.coverImage=''] - Path to a cover image (jpg/png)
 * @returns {Promise<{ buffer: Buffer, report: object }>}
 */
async function convertToEpub(rawMarkdown, opts = {}) {
  // Parse and strip YAML frontmatter
  const { data: fm, content: markdownBody } = parseFrontmatter(rawMarkdown);

  const {
    title       = fm.title       || 'Document',
    author      = fm.author      || '',
    date        = fm.date        ? String(fm.date) : '',
    toc         = fm.toc         === true || false,
    coverImage  = fm.coverImage  || '',
  } = opts;

  // Variable substitution
  const markdown = substituteVariables(markdownBody, fm);

  // Smart analysis
  const { markdown: cleanMd, report } = await analyze(markdown, {
    autoBreak: false,
    fixHeadings: true,
    skipGridTableConversion: true,
  });

  // Build YAML frontmatter block for Pandoc
  const coverDate = date || new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const yamlLines = ['---', `title: "${title.replace(/"/g, '\\"')}"`];
  if (author) { yamlLines.push(`author: "${author.replace(/"/g, '\\"')}"`); }
  yamlLines.push(`date: "${coverDate}"`, '---', '');
  const finalMd = yamlLines.join('\n') + cleanMd;

  const inputPath  = tmpFile('.md');
  const outputPath = tmpFile('.epub');

  try {
    fs.writeFileSync(inputPath, finalMd, 'utf-8');

    const pandoc = getPandoc();
    const args = [
      inputPath,
      '-f', 'markdown+smart+pipe_tables+grid_tables+multiline_tables+strikeout+task_lists+fenced_code_blocks+footnotes+tex_math_dollars',
      '-t', 'epub3',
      '-o', outputPath,
      '--wrap=none',
      '--highlight-style=tango',
      `--css=${path.join(__dirname, 'epub.css')}`,
    ];

    if (toc) {
      args.push('--toc', '--toc-depth=3');
    }

    if (coverImage && fs.existsSync(coverImage)) {
      args.push(`--epub-cover-image=${coverImage}`);
    }

    await new Promise((resolve, reject) => {
      execFile(pandoc, args, { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`Pandoc EPUB conversion failed: ${stderr || err.message}`));
        } else {
          resolve();
        }
      });
    });

    const buffer = fs.readFileSync(outputPath);
    return { buffer, report };

  } finally {
    cleanup(inputPath, outputPath);
  }
}

module.exports = { convertToEpub };
