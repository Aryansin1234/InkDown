'use strict';

/**
 * mcpServer.js — InkDown MCP (Model Context Protocol) Server
 *
 * Exposes InkDown's conversion and analysis capabilities as MCP tools,
 * making them natively available to Claude, Cursor, Windsurf, and any
 * MCP-compatible AI tool with zero configuration.
 *
 * Tools:
 *   inkdown_convert        — Convert markdown to PDF, DOCX, or HTML
 *   inkdown_analyze        — Analyze markdown structure and quality
 *   inkdown_clean          — Clean and normalize markdown
 *   inkdown_batch_convert  — Convert multiple documents in one call
 *
 * Transport:
 *   stdio   — for Claude Desktop, Cursor, Windsurf, etc.
 *   http    — for remote/multi-client deployments (port 3001)
 *
 * Usage:
 *   node src/mcpServer.js               # stdio mode (default)
 *   node src/mcpServer.js --http        # HTTP SSE mode on port 3001
 *   node src/mcpServer.js --port 3002   # HTTP SSE on custom port
 */

const { McpServer }           = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z                        = require('zod');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const crypto = require('crypto');

// ── Engine imports ──────────────────────────────────────────────
const { convert: _pdfConvert, convertToHtml: _htmlConvert } = require('./converter');
const { convertToDocx } = require('./docxConverter');
const { analyze }       = require('./analyzer');
const { extractMermaidBlocks } = require('./mermaidRenderer');

// ── Helpers ─────────────────────────────────────────────────────

function estimateTokens(text) {
  // Rough estimate: ~4 chars per token (GPT-style tokenization)
  return Math.ceil(text.length / 4);
}

function countWords(text) {
  return (text.match(/\b\w+\b/g) || []).length;
}

function getReadingTimeMinutes(wordCount) {
  // Average reading speed ~200 wpm
  return Math.max(1, Math.ceil(wordCount / 200));
}

function extractHeadings(markdown) {
  const headings = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      const text = m[2].trim();
      headings.push({
        level: m[1].length,
        text,
        slug: text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
      });
    }
  }
  return headings;
}

function extractCodeBlocks(markdown) {
  const blocks = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const lang = m[1] || 'plain';
    if (lang !== 'mermaid') {
      blocks.push({ language: lang, line_count: m[2].split('\n').length });
    }
  }
  return blocks;
}

function countImages(markdown) {
  return (markdown.match(/!\[.*?\]\(.*?\)/g) || []).length;
}

function countTables(markdown) {
  return (markdown.match(/^\|.+\|$/gm) || []).filter((_, i, arr) => {
    if (i === 0) return true;
    return arr[i - 1] && !/^\|[-:| ]+\|$/.test(arr[i - 1]);
  }).length;
}

function countMathBlocks(markdown) {
  const inline  = (markdown.match(/\$[^$\n]+\$/g) || []).length;
  const display = (markdown.match(/\$\$[\s\S]+?\$\$/g) || []).length;
  return { inline, display, total: inline + display };
}

// Wrap the file-path-based converters so they accept markdown strings directly.
// Each function writes a temp .md, converts, reads back the result, then cleans up.

async function convertMarkdownToPdf(markdown, opts = {}) {
  const inputPath  = path.join(os.tmpdir(), `inkdown-mcp-${crypto.randomUUID()}.md`);
  const outputPath = path.join(os.tmpdir(), `inkdown-mcp-${crypto.randomUUID()}.pdf`);
  fs.writeFileSync(inputPath, markdown, 'utf-8');
  try {
    await _pdfConvert(inputPath, outputPath, opts);
    return fs.readFileSync(outputPath);
  } finally {
    for (const f of [inputPath, outputPath]) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

async function convertMarkdownToHtml(markdown, opts = {}) {
  const inputPath  = path.join(os.tmpdir(), `inkdown-mcp-${crypto.randomUUID()}.md`);
  const outputPath = path.join(os.tmpdir(), `inkdown-mcp-${crypto.randomUUID()}.html`);
  fs.writeFileSync(inputPath, markdown, 'utf-8');
  try {
    await _htmlConvert(inputPath, outputPath, opts);
    return fs.readFileSync(outputPath);
  } finally {
    for (const f of [inputPath, outputPath]) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

// ── Tool result helpers ──────────────────────────────────────────

function fileResult(buffer, filename, mimeType, extra = {}) {
  const base64 = buffer.toString('base64');
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        filename,
        mime_type: mimeType,
        size_bytes: buffer.length,
        data: base64,
        ...extra,
      }),
    }],
  };
}

function textResult(obj) {
  return {
    content: [{
      type: 'text',
      text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2),
    }],
  };
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

// ── Server setup ─────────────────────────────────────────────────

const server = new McpServer({
  name: 'inkdown',
  version: '1.0.0',
});

// ────────────────────────────────────────────────────────────────
// Tool: inkdown_convert
// ────────────────────────────────────────────────────────────────
server.tool(
  'inkdown_convert',
  'Convert Markdown to a production-quality PDF, DOCX, or HTML document. ' +
  'Returns the file as base64-encoded data. ' +
  'Use this whenever you need to produce a formatted document from markdown content.',
  {
    markdown:        z.string().describe('Markdown content to convert'),
    format:          z.enum(['pdf', 'docx', 'html']).default('pdf').describe('Output format'),
    title:           z.string().optional().describe('Document title (shown in header/cover page)'),
    author:          z.string().optional().describe('Author name'),
    toc:             z.boolean().optional().default(false).describe('Include a Table of Contents'),
    auto_break:      z.boolean().optional().default(false).describe('Insert page breaks before each H1 heading'),
    number_sections: z.boolean().optional().default(false).describe('Number headings (1., 1.1, 1.1.1)'),
  },
  async (args) => {
    const {
      markdown,
      format        = 'pdf',
      title         = 'Document',
      author        = '',
      toc           = false,
      auto_break    = false,
      number_sections = false,
    } = args;

    if (!markdown || typeof markdown !== 'string') {
      return errorResult('markdown is required and must be a string');
    }

    const fmt = format.toLowerCase();
    if (!['pdf', 'docx', 'html'].includes(fmt)) {
      return errorResult('format must be "pdf", "docx", or "html"');
    }

    try {
      const opts = { title, author, toc, autoBreak: auto_break, numberSections: number_sections };

      if (fmt === 'pdf') {
        const buffer = await convertMarkdownToPdf(markdown, opts);
        const filename = `${title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-') || 'document'}.pdf`;
        return fileResult(buffer, filename, 'application/pdf', { format: 'pdf' });
      }

      if (fmt === 'docx') {
        const { buffer } = await convertToDocx(markdown, opts);
        const filename = `${title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-') || 'document'}.docx`;
        return fileResult(buffer, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', { format: 'docx' });
      }

      if (fmt === 'html') {
        const buffer = await convertMarkdownToHtml(markdown, opts);
        const filename = `${title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-') || 'document'}.html`;
        return fileResult(buffer, filename, 'text/html', { format: 'html' });
      }
    } catch (err) {
      return errorResult(`Conversion failed: ${err.message}`);
    }
  }
);

// ────────────────────────────────────────────────────────────────
// Tool: inkdown_analyze
// ────────────────────────────────────────────────────────────────
server.tool(
  'inkdown_analyze',
  'Analyze a Markdown document and return structured metadata: headings, word count, ' +
  'reading time, diagram types, code blocks, issues, and suggestions. ' +
  'Use this before converting to understand document structure, or to validate ' +
  'AI-generated markdown before presenting it to a user.',
  {
    markdown: z.string().describe('Markdown content to analyze'),
  },
  async ({ markdown }) => {
    if (!markdown || typeof markdown !== 'string') {
      return errorResult('markdown is required and must be a string');
    }

    try {
      const { report } = await analyze(markdown, { fixHeadings: false });

      const wordCount   = countWords(markdown);
      const headings    = extractHeadings(markdown);
      const codeBlocks  = extractCodeBlocks(markdown);
      const diagrams    = extractMermaidBlocks(markdown).map((b, i) => {
        const firstLine = b.code.trim().split('\n')[0].toLowerCase();
        let type = 'unknown';
        if (firstLine.startsWith('graph') || firstLine.startsWith('flowchart')) type = 'flowchart';
        else if (firstLine.startsWith('sequencediagram'))  type = 'sequence';
        else if (firstLine.startsWith('classdiagram'))     type = 'class';
        else if (firstLine.startsWith('statediagram'))     type = 'state';
        else if (firstLine.startsWith('erdiagram'))        type = 'er';
        else if (firstLine.startsWith('gantt'))            type = 'gantt';
        else if (firstLine.startsWith('pie'))              type = 'pie';
        else if (firstLine.startsWith('gitgraph'))         type = 'gitGraph';
        else if (firstLine.startsWith('mindmap'))          type = 'mindmap';
        else if (firstLine.startsWith('timeline'))         type = 'timeline';
        return { index: i + 1, type };
      });

      const mathInfo    = countMathBlocks(markdown);
      const tableCount  = countTables(markdown);
      const imageCount  = countImages(markdown);

      // Build issues list from analyzer report
      const issues = [
        ...(report.headingFixes || []).map(f => ({
          type:    'heading_hierarchy',
          message: `Heading hierarchy gap fixed: ${f.description || JSON.stringify(f)}`,
        })),
        ...(report.longCodeLines || []).map(l => ({
          type:    'long_code_line',
          message: `Code line exceeds 120 chars (line ~${l.line || '?'})`,
        })),
        ...(report.wideTables || []).map(t => ({
          type:    'wide_table',
          message: `Table with ${t.columns || '?'} columns may overflow on narrow pages`,
        })),
      ];

      const suggestions = [];
      if (!headings.some(h => h.level === 1)) {
        suggestions.push({ type: 'structure', message: 'No H1 heading found — consider adding a document title' });
      }
      if (wordCount > 5000 && !markdown.includes('<!-- pagebreak -->')) {
        suggestions.push({ type: 'pagination', message: 'Long document — consider adding <!-- pagebreak --> between major sections' });
      }
      if (diagrams.length > 5) {
        suggestions.push({ type: 'performance', message: `${diagrams.length} diagrams found — conversion may take a moment` });
      }
      if (!markdown.trim().match(/^---\s*\n/)) {
        suggestions.push({ type: 'metadata', message: 'No YAML frontmatter — consider adding title/author metadata' });
      }

      return textResult({
        word_count:            wordCount,
        character_count:       markdown.length,
        reading_time_minutes:  getReadingTimeMinutes(wordCount),
        tokens_approx:         estimateTokens(markdown),
        headings,
        code_blocks:           codeBlocks,
        diagrams,
        tables:                tableCount,
        images:                imageCount,
        math:                  mathInfo,
        issues,
        suggestions,
        analyzer_report:       report,
      });
    } catch (err) {
      return errorResult(`Analysis failed: ${err.message}`);
    }
  }
);

// ────────────────────────────────────────────────────────────────
// Tool: inkdown_clean
// ────────────────────────────────────────────────────────────────
server.tool(
  'inkdown_clean',
  'Clean and normalize AI-generated Markdown. Fixes heading hierarchy gaps, ' +
  'normalizes list indentation, and prepares the document for reliable rendering. ' +
  'Returns the cleaned markdown string and a list of changes made. ' +
  'Run this on LLM output before storing to a knowledge base or converting to a document.',
  {
    markdown:     z.string().describe('Markdown content to clean'),
    fix_headings: z.boolean().optional().default(true).describe('Auto-fix heading hierarchy gaps'),
    auto_break:   z.boolean().optional().default(false).describe('Insert page breaks before H1 headings'),
  },
  async ({ markdown, fix_headings = true, auto_break = false }) => {
    if (!markdown || typeof markdown !== 'string') {
      return errorResult('markdown is required and must be a string');
    }

    try {
      const { markdown: cleaned, report } = await analyze(markdown, {
        fixHeadings: fix_headings,
        autoBreak:   auto_break,
      });

      const changes = [
        ...(report.headingFixes || []).map(f => ({
          type:    'heading_fix',
          message: f.description || JSON.stringify(f),
        })),
        ...(report.autoBreaksInserted > 0 ? [{
          type:    'page_breaks',
          message: `Inserted ${report.autoBreaksInserted} page break(s) before H1 headings`,
        }] : []),
        ...(report.asciiArtBlocks?.length > 0 ? [{
          type:    'ascii_art',
          message: `Detected ${report.asciiArtBlocks.length} ASCII art block(s) — preserved without syntax highlighting`,
        }] : []),
      ];

      return textResult({
        markdown: cleaned,
        changes,
        changed: cleaned !== markdown,
      });
    } catch (err) {
      return errorResult(`Clean failed: ${err.message}`);
    }
  }
);

// ────────────────────────────────────────────────────────────────
// Tool: inkdown_batch_convert
// ────────────────────────────────────────────────────────────────
server.tool(
  'inkdown_batch_convert',
  'Convert multiple Markdown documents to PDF or DOCX in a single call. ' +
  'Returns an array of base64-encoded files. ' +
  'Use this when an agent has produced several related documents (e.g., a multi-chapter report, ' +
  'a set of meeting notes) and needs to export them all at once.',
  {
    files: z.array(z.object({
      name:     z.string().describe('Output filename (without extension)'),
      markdown: z.string().describe('Markdown content'),
    })).describe('Documents to convert'),
    format: z.enum(['pdf', 'docx']).default('pdf').describe('Output format'),
    toc:    z.boolean().optional().default(false).describe('Include Table of Contents in each document'),
  },
  async ({ files, format = 'pdf', toc = false }) => {
    if (!Array.isArray(files) || files.length === 0) {
      return errorResult('files must be a non-empty array of { name, markdown } objects');
    }
    if (files.length > 20) {
      return errorResult('Maximum 20 files per batch call');
    }

    const fmt = format.toLowerCase();
    if (!['pdf', 'docx'].includes(fmt)) {
      return errorResult('format must be "pdf" or "docx"');
    }

    const results = [];
    const errors  = [];

    for (const file of files) {
      if (!file.name || !file.markdown) {
        errors.push({ name: file.name || '(unknown)', error: 'name and markdown are required' });
        continue;
      }
      try {
        const opts = { title: file.name, toc };
        let buffer, mimeType, filename;

        if (fmt === 'pdf') {
          buffer = await convertMarkdownToPdf(file.markdown, opts);
          mimeType = 'application/pdf';
          filename = `${file.name}.pdf`;
        } else {
          ({ buffer } = await convertToDocx(file.markdown, opts));
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          filename = `${file.name}.docx`;
        }

        results.push({
          name:       file.name,
          filename,
          mime_type:  mimeType,
          size_bytes: buffer.length,
          data:       buffer.toString('base64'),
        });
      } catch (err) {
        errors.push({ name: file.name, error: err.message });
      }
    }

    return textResult({
      converted: results.length,
      failed:    errors.length,
      results,
      errors,
    });
  }
);

// ── Transport selection & startup ────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const useHttp = args.includes('--http');
  const portIdx = args.indexOf('--port');
  const port    = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3001;

  if (useHttp) {
    // HTTP SSE transport — for remote/multi-client deployments
    const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const express = require('express');
    const app     = express();
    app.use(express.json());

    app.all('/mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
      res.on('close', () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', server: 'inkdown-mcp', version: '1.0.0', transport: 'http' });
    });

    app.listen(port, () => {
      console.error(`InkDown MCP server (HTTP) listening on port ${port}`);
      console.error(`Endpoint: http://localhost:${port}/mcp`);
    });
  } else {
    // stdio transport — default for Claude Desktop, Cursor, Windsurf, etc.
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // stdio mode: keep process alive, errors to stderr
    process.stderr.write('InkDown MCP server running (stdio)\n');
  }
}

main().catch(err => {
  process.stderr.write(`InkDown MCP server error: ${err.message}\n`);
  process.exit(1);
});
