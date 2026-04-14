#!/usr/bin/env node
'use strict';

/**
 * cli.js — command-line interface for InkDown
 *
 * Usage:
 *   node src/cli.js [options] <input.md> [output.pdf]
 *
 * Options:
 *   --toc            Prepend an auto-generated Table of Contents
 *   --auto-break     Insert a page break before every <h1>
 *   --title <text>   Override the document title shown in the footer
 *   --help, -h       Show this help message
 */

const path    = require('path');
const { convert } = require('./converter');

// ── Argument parsing ──────────────────────────────────────────
function parseArgs(argv) {
  const args   = argv.slice(2);
  const opts   = { toc: false, autoBreak: false, title: undefined };
  const files  = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--toc':
        opts.toc = true;
        break;
      case '--auto-break':
        opts.autoBreak = true;
        break;
      case '--title':
        opts.title = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (a.startsWith('--')) {
          console.error(`Unknown option: ${a}`);
          printHelp();
          process.exit(1);
        }
        files.push(a);
    }
  }

  return { files, opts };
}

function printHelp() {
  console.log(`
InkDown — Markdown → PDF Converter
======================================
Usage:
  node src/cli.js [options] <input.md> [output.pdf]

Arguments:
  input.md      Path to the Markdown file to convert (required)
  output.pdf    Where to save the PDF (optional — defaults to same name as input)

Options:
  --toc           Prepend an auto-generated Table of Contents
  --auto-break    Insert a page break before every top-level heading (h1)
  --title <text>  Override the document title shown in the footer
  --help, -h      Show this help message

Examples:
  node src/cli.js README.md
  node src/cli.js --toc --auto-break docs/guide.md output/guide.pdf
  node src/cli.js --title "API Reference" api.md docs/api.pdf
`);
}

// ── Derive output path ────────────────────────────────────────
function deriveOutputPath(inputPath) {
  const dir  = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}.pdf`);
}

// ── Friendly byte formatter ───────────────────────────────────
function fmtBytes(n) {
  return n > 1024 * 1024
    ? `${(n / (1024 * 1024)).toFixed(1)} MB`
    : `${(n / 1024).toFixed(1)} KB`;
}

// ── Entry point ───────────────────────────────────────────────
async function main() {
  const { files, opts } = parseArgs(process.argv);

  if (files.length === 0) {
    console.error('Error: No input file specified.\n');
    printHelp();
    process.exit(1);
  }

  const inputPath  = files[0];
  const outputPath = files[1] || deriveOutputPath(inputPath);

  // Summary of what we're about to do
  console.log('\nInkDown');
  console.log('─────────────────────────────────────');
  console.log(`  Input  : ${inputPath}`);
  console.log(`  Output : ${outputPath}`);
  console.log(`  TOC    : ${opts.toc ? 'yes' : 'no'}`);
  console.log(`  Breaks : ${opts.autoBreak ? 'before every h1' : 'manual only'}`);
  if (opts.title) console.log(`  Title  : ${opts.title}`);
  console.log('─────────────────────────────────────');
  console.log('  Converting…');

  const t0 = Date.now();

  try {
    const out = await convert(inputPath, outputPath, opts);

    const { size } = require('fs').statSync(out);
    const elapsed  = ((Date.now() - t0) / 1000).toFixed(1);

    console.log(`  Done in ${elapsed}s  —  ${fmtBytes(size)}`);
    console.log(`  PDF saved → ${out}\n`);
  } catch (err) {
    console.error(`\nConversion failed: ${err.message}\n`);
    process.exit(1);
  }
}

main();
