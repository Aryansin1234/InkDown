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
const { replaceMermaidWithImages, extractMermaidBlocks } = require('./mermaidRenderer');

// ── Helpers ───────────────────────────────────────────────────
function tmpFile(ext) {
  return path.join(os.tmpdir(), `inkdown-${crypto.randomUUID()}${ext}`);
}

/**
 * Post-process a Pandoc-generated DOCX to fix Word compatibility.
 * Pandoc 3.9 omits pgSz/pgMar in sectPr and compatibilityMode in
 * settings.xml, which causes Word for Mac to refuse to open the file.
 *
 * Uses Python's zipfile module (instead of adm-zip) because Word is
 * very sensitive to ZIP structure and Python produces byte-identical
 * compliant output.
 */
function patchDocxForWordCompat(docxPath) {
  const { execFileSync } = require('child_process');
  const pyScript = `
import zipfile, shutil, sys, os, re, tempfile

src = sys.argv[1]
tmp_fd, tmp_path = tempfile.mkstemp(suffix='.docx')
os.close(tmp_fd)

with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(tmp_path, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.namelist():
        data = zin.read(item)

        if item == 'word/document.xml':
            text = data.decode('utf-8')
            if 'w:pgSz' not in text:
                text = text.replace(
                    '</w:sectPr>',
                    '<w:pgSz w:w="12240" w:h="15840"/>'
                    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>'
                    '<w:cols w:space="720"/>'
                    '<w:docGrid w:linePitch="360"/>'
                    '</w:sectPr>'
                )
            data = text.encode('utf-8')

        elif item == 'word/settings.xml':
            text = data.decode('utf-8')
            if 'compatibilityMode' not in text:
                compat = (
                    '<w:compat>'
                    '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>'
                    '<w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
                    '<w:compatSetting w:name="enableOpenTypeFeatures" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
                    '</w:compat>'
                )
                text = text.replace('</w:settings>', compat + '</w:settings>')
            text = re.sub(r'<w:doNotTrackMoves\\s*/>', '', text)
            data = text.encode('utf-8')

        zout.writestr(item, data)

shutil.move(tmp_path, src)
print('OK')
`;

  try {
    execFileSync('python3', ['-c', pyScript, docxPath], {
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    // If Python isn't available, skip patching (file may still work)
    console.warn('  ⚠ Could not patch DOCX for Word compatibility:', err.message);
  }
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
  return md
    .replace(/<!--\s*pagebreak\s*-->/gi, '\\newpage')
    .replace(/<div\s+style\s*=\s*"[^"]*page-break[^"]*"\s*[^>]*>\s*<\/div>/gi, '\\newpage');
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
  const {
    title = 'Document',
    toc = false,
    autoBreak = false,
    author = '',
    date = '',
    numberSections = false,
  } = opts;

  // 1. Run smart analyzer (skip grid table → HTML conversion; Pandoc handles them natively)
  const { markdown: cleanMd, report } = await analyze(markdown, {
    autoBreak,
    fixHeadings: true,
    skipGridTableConversion: true,
  });

  // 2. Pre-render Mermaid diagrams to PNG images for DOCX embedding
  //    - High-DPI (2x) for sharp output
  //    - Source code preserved as HTML comment for editability
  const mermaidTmpDir = path.join(os.tmpdir(), `inkdown-mermaid-${crypto.randomUUID()}`);
  let mermaidCleanupDir = null;

  let processedMd = cleanMd;
  const mermaidBlocks = extractMermaidBlocks(cleanMd);
  if (mermaidBlocks.length > 0) {
    const { markdown: mermaidProcessed, diagramCount } = await replaceMermaidWithImages(
      cleanMd, mermaidTmpDir, { includeSource: true }
    );
    processedMd = mermaidProcessed;
    mermaidCleanupDir = mermaidTmpDir;
    if (diagramCount > 0) {
      console.log(`  ℹ Rendered ${diagramCount} Mermaid diagram(s) for DOCX`);
    }
  }

  // 3. Convert pagebreak comments to Pandoc \newpage
  let finalMd = convertPageBreaks(processedMd);

  // 4. Build cover page — YAML frontmatter tells Pandoc to generate
  //    Title / Author / Date blocks using reference.docx styles.
  //    A \newpage ensures content starts on a fresh page.
  const coverDate = date || new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const yamlLines = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
  ];
  if (author) yamlLines.push(`author: "${author.replace(/"/g, '\\"')}"`);
  yamlLines.push(`date: "${coverDate}"`);
  yamlLines.push('---');
  yamlLines.push('');
  yamlLines.push('\\newpage');
  yamlLines.push('');
  finalMd = yamlLines.join('\n') + finalMd;

  // 5. Write to temp .md file
  const inputPath  = tmpFile('.md');
  const outputPath = tmpFile('.docx');

  try {
    fs.writeFileSync(inputPath, finalMd, 'utf-8');

    // 6. Build Pandoc args
    const pandoc = getPandoc();
    const args = [
      inputPath,
      '-f', 'markdown+smart+pipe_tables+grid_tables+multiline_tables+simple_tables+strikeout+task_lists+fenced_code_blocks+backtick_code_blocks+autolink_bare_uris+footnotes+tex_math_dollars+definition_lists+implicit_figures',
      '-t', 'docx',
      '-o', outputPath,
      '--wrap=none',
    ];

    // Resource path — needed so Pandoc can find mermaid PNG images in the temp dir
    if (mermaidCleanupDir) {
      args.push(`--resource-path=${mermaidCleanupDir}`);
    }

    // Table of Contents — use Pandoc's built-in --toc which generates
    // a pre-populated, clickable TOC with hyperlinks to each heading.
    if (toc) {
      args.push('--toc', `--toc-depth=${4}`);
      // Enable native Word TOC field via Lua filter
      args.push('--metadata=native-toc:true', '--metadata=toc-depth:4');
    }

    // Lua filter for DOCX enhancements — DISABLED: raw OOXML SDT blocks
    // may produce invalid output with Pandoc 3.9
    // const luaFilter = path.join(__dirname, 'docx-enhancements.lua');
    // if (fs.existsSync(luaFilter)) {
    //   args.push(`--lua-filter=${luaFilter}`);
    // }

    // Lua filter for DOCX table styling — DISABLED: now a no-op
    // const tableStyleFilter = path.join(__dirname, 'docx-table-style.lua');
    // if (fs.existsSync(tableStyleFilter)) {
    //   args.push(`--lua-filter=${tableStyleFilter}`);
    // }

    // Reference template (custom styles, header/footer, margins)
    if (fs.existsSync(REFERENCE_DOCX)) {
      args.push(`--reference-doc=${REFERENCE_DOCX}`);
    }

    // Numbered sections (1., 1.1, 1.1.1, etc.)
    if (numberSections) {
      args.push('--number-sections');
    }

    // Syntax highlighting style
    args.push('--highlight-style=tango');

    // 7. Execute Pandoc
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

    // 8. Post-process for Word compatibility (Pandoc 3.9 fix)
    patchDocxForWordCompat(outputPath);

    // 9. Read result
    const buffer = fs.readFileSync(outputPath);

    return { buffer, report };

  } finally {
    cleanup(inputPath, outputPath);
    // Clean up mermaid temp images
    if (mermaidCleanupDir && fs.existsSync(mermaidCleanupDir)) {
      try {
        fs.rmSync(mermaidCleanupDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }
}

module.exports = { convertToDocx };
