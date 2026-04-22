# InkDown — Architecture & Technical Deep-Dive

> A comprehensive guide to how InkDown works under the hood, the problems it solves, and the engineering decisions behind it.

---

## Table of Contents

- [What InkDown Is](#what-inkdown-is)
- [The Problem](#the-problem)
- [How It Works](#how-it-works)
  - [System Architecture](#system-architecture)
  - [The Smart Analyzer](#the-smart-analyzer)
  - [PDF Pipeline](#pdf-pipeline)
  - [DOCX Pipeline](#docx-pipeline)
- [Technical Stack](#technical-stack)
- [Module Reference](#module-reference)
- [Data Flow](#data-flow)
- [Problems Solved](#problems-solved)
- [API Reference](#api-reference)
- [CLI Reference](#cli-reference)
- [Design Decisions](#design-decisions)
- [Frontend Architecture](#frontend-architecture)
- [Security & Privacy](#security--privacy)
- [System Requirements](#system-requirements)

---

## What InkDown Is

InkDown is a **self-hosted Markdown-to-document converter** that transforms raw `.md` files into production-quality **PDF** and **DOCX** documents. It provides three interfaces:

1. **Web Application** — browser-based editor with live preview, drag-and-drop, and URL import
2. **CLI Tool** — terminal-based conversion for scripting and CI/CD pipelines
3. **REST API** — single `POST` endpoint for programmatic integration

Everything runs **100% locally**. No cloud services, no telemetry, no data leaves the machine.

---

## The Problem

Markdown is the de facto standard for developer documentation, but converting it to professional documents has persistent issues:

### Common Markdown-to-PDF/DOCX Failures

| Issue | What Happens | InkDown's Fix |
|-------|-------------|---------------|
| **Code overflow** | Long lines in code blocks bleed past page margins | CSS `pre-wrap` + `overflow-wrap: break-word` in PDF; Pandoc verbatim handling in DOCX |
| **Table overflow** | Wide tables extend beyond the page | `table-layout: auto` + `word-break: break-word` with max-width constraints |
| **Heading hierarchy gaps** | H1 → H3 with no H2 breaks TOC and DOCX heading styles | Smart Analyzer detects and auto-fixes gaps at the AST level |
| **ASCII art corruption** | Box-drawing characters get syntax-highlighted or mangled | Box-char regex detection flags blocks as literal/verbatim before any rendering |
| **No page breaks** | Content runs together in one endless flow | Manual `<!-- pagebreak -->` + auto-break before H1 headings |
| **Deeply nested lists** | Word can't handle list depth > 4; renderers crash | Smart Analyzer flattens lists exceeding max depth |
| **Inconsistent DOCX structure** | DIY OOXML builders produce paragraphs that look like headings but aren't real heading styles | Pandoc generates native Word heading styles, real TOC fields, proper list numbering |

---

## How It Works

### System Architecture

```
                    ┌──────────────────────────┐
                    │     Input Sources         │
                    │  ┌────────┐ ┌─────────┐  │
                    │  │ Editor │ │ File     │  │
                    │  │ (text) │ │ Upload   │  │
                    │  └───┬────┘ └────┬─────┘  │
                    │      │           │        │
                    │  ┌───┴───────────┴─────┐  │
                    │  │   URL Fetch          │  │
                    │  └──────────┬───────────┘  │
                    └─────────────┼──────────────┘
                                  │
                          Raw Markdown
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │    Smart Analyzer        │
                    │    (remark AST)          │
                    │                          │
                    │  • Parse to AST          │
                    │  • Fix heading hierarchy │
                    │  • Detect ASCII art      │
                    │  • Auto page breaks      │
                    │  • Detect wide tables    │
                    │  • Normalize deep lists  │
                    │  • Detect long code lines│
                    │                          │
                    │  Output: Clean Markdown  │
                    │        + Analysis Report │
                    └─────────────┬────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
          ┌─────────────────┐        ┌──────────────────┐
          │   PDF Pipeline  │        │  DOCX Pipeline   │
          │                 │        │                   │
          │  marked (HTML)  │        │  Pandoc           │
          │  highlight.js   │        │  (system binary)  │
          │  styles.css     │        │                   │
          │  Puppeteer      │        │  reference.docx   │
          │  (Chromium)     │        │  (optional style) │
          │                 │        │                   │
          │  Output: .pdf   │        │  Output: .docx    │
          └─────────────────┘        └──────────────────┘
```

The architecture is a **two-stage pipeline**: a shared, format-agnostic analysis layer followed by format-specific renderers. This ensures both outputs benefit from the same structural intelligence.

---

### The Smart Analyzer

**File:** `src/analyzer.js`

The Analyzer is the intelligence layer of InkDown. It parses raw Markdown into an Abstract Syntax Tree (AST) using the [unified](https://unifiedjs.com/) / [remark](https://github.com/remarkjs/remark) ecosystem, then runs a chain of analysis plugins before serializing back to clean Markdown.

#### AST Pipeline

```
Raw Markdown
    │
    ▼ remark-parse
  ┌───────────────┐
  │   MDAST Tree  │  (Markdown Abstract Syntax Tree)
  └──────┬────────┘
         │
    ┌────┴──── Plugin Chain ─────────┐
    │                                │
    │  1. remarkFixHeadings          │  Fix H1→H3 skips
    │  2. remarkDetectAsciiArt       │  Flag box-drawing code blocks
    │  3. remarkAutoPageBreaks       │  Insert breaks before H1
    │  4. remarkDetectWideTables     │  Warn on 7+ column tables
    │  5. remarkNormalizeLists       │  Flatten depth > 4
    │  6. remarkDetectLongCodeLines  │  Flag lines > 120 chars
    │                                │
    └────────────┬───────────────────┘
                 │
                 ▼ remark-stringify
           Clean Markdown
               +
         Analysis Report
```

#### Plugin Details

**1. Heading Hierarchy Fixer** (`remarkFixHeadings`)
- Walks all heading nodes in document order
- If a heading jumps more than one level deeper (e.g. H1 → H3), it adjusts the depth to `previousDepth + 1`
- Reports all fixes in `file.data.headingFixes`
- Prevents broken TOC hierarchy and invalid DOCX heading styles

**2. ASCII Art Detection** (`remarkDetectAsciiArt`)
- Tests every `code` node's content against a regex of Unicode box-drawing characters:
  ```
  ┌┐└┘├┤┬┴┼│─═║╔╗╚╝╠╣╦╩╬▶▼►▲◄▷▽◁△→←↑↓╰╮╭╯┃━
  ```
- Matched blocks get `node.data.isAsciiArt = true` and their `lang` is stripped
- This prevents syntax highlighters from mangling box-drawing art in documentation

**3. Auto Page Breaks** (`remarkAutoPageBreaks`)
- When `autoBreak: true`, inserts `<!-- pagebreak -->` HTML nodes before every H1 heading (except the first)
- Operates at AST level, so the break is placed in the correct tree position
- PDF pipeline converts these to CSS `page-break-before: always`
- DOCX pipeline converts these to Pandoc `\newpage` commands

**4. Wide Table Detection** (`remarkDetectWideTables`)
- Inspects the first row of every `table` node and counts columns
- Tables with ≥ 7 columns are flagged (configurable threshold)
- Reported in the analysis output so users can review potentially problematic tables

**5. Nested List Normalization** (`remarkNormalizeLists`)
- Recursively walks `list` and `listItem` nodes tracking depth
- Lists nested beyond `maxDepth` (default: 4) are flattened into indented paragraphs
- Prevents Word/DOCX rendering issues with deeply nested lists

**6. Long Code Line Detection** (`remarkDetectLongCodeLines`)
- Splits every `code` node's content by newlines and checks for lines exceeding 120 characters
- Reports language, line number, max length, and overflow count
- Informational — helps users identify content that may cause layout issues

#### Analyzer Output

The `analyze()` function returns:

```javascript
{
  markdown: "...",   // Cleaned, normalized Markdown string
  report: {
    headingFixes:      [{ from: 3, to: 2, text: "...", line: 15 }],
    asciiArtBlocks:    [{ line: 42, preview: "┌──────┐..." }],
    autoBreaksInserted: 2,
    wideTables:        [{ columns: 8, line: 60 }],
    longCodeLines:     [{ lang: "bash", line: 30, maxLength: 145, overflowCount: 1 }],
  }
}
```

---

### PDF Pipeline

**File:** `src/converter.js`

The PDF pipeline converts Markdown to HTML, then renders it to PDF using a headless Chromium instance.

```
Clean Markdown (from Analyzer)
    │
    ▼  marked.parse()
  HTML string
    │
    ▼  highlight.js (walkTokens)
  HTML with <span class="hljs-*"> syntax tokens
    │
    ▼  inlineImages()
  HTML with base64-encoded local images
    │
    ▼  buildHtml()
  Complete HTML document (styles.css + highlight.css)
    │
    ▼  Puppeteer
  ┌────────────────────────────┐
  │  Headless Chromium         │
  │  page.setContent(html)     │
  │  page.pdf({                │
  │    format: 'A4',           │
  │    printBackground: true,  │
  │    margin: 20mm/18mm,      │
  │    displayHeaderFooter     │
  │  })                        │
  └────────────┬───────────────┘
               │
               ▼
          .pdf file
```

#### Key Mechanisms

**Markdown → HTML** (`marked` with custom renderer)
- GitHub Flavored Markdown (GFM) spec: tables, strikethrough, task lists
- Custom heading renderer adds `id` attributes for TOC anchor links
- Custom HTML renderer converts `<!-- pagebreak -->` to `<div class="page-break">`

**Syntax Highlighting** (`highlight.js` via `walkTokens`)
- Runs during marked's token walk phase
- Language-specified blocks: `hljs.highlight(code, { language })`
- Unspecified blocks: `hljs.highlightAuto(code)` for best-guess detection
- Result is pre-escaped HTML injected into the token

**Image Inlining** (`inlineImages`)
- Regex scans for `src="..."` in the HTML
- Local file paths are resolved relative to the input Markdown's directory
- Files are read, base64-encoded, and replaced with `data:` URIs
- HTTP/HTTPS URLs are left untouched for Chromium to fetch

**TOC Generation**
- `extractHeadings()`: regex extracts H1–H4 tags with their `id` and text content
- `buildTOC()`: generates a `<nav class="toc"><ol>` with indented, linked entries
- TOC is prepended to the HTML body before rendering

**Print Stylesheet** (`src/styles.css`)
- `@page { size: A4 }` with explicit margins
- `page-break-inside: avoid` on `pre`, `table`, `blockquote`
- `page-break-after: avoid` on all headings
- `overflow-wrap: break-word` and `word-break: break-all` on code and table cells
- `.auto-break-h1 h1 { page-break-before: always }` for auto-break mode

**Puppeteer Rendering**
- Launches headless Chromium with `--no-sandbox`
- `setContent()` with `waitUntil: 'networkidle0'` ensures all fonts and remote images load
- `page.pdf()` generates the final A4 document with custom footer template

---

### DOCX Pipeline

**File:** `src/docxConverter.js`

The DOCX pipeline uses Pandoc, the universal document converter, to produce native Word documents from analyzed Markdown.

```
Clean Markdown (from Analyzer)
    │
    ▼  convertPageBreaks()
  Markdown with \newpage commands
    │
    ▼  Write to temp .md file
    │
    ▼  Pandoc
  ┌────────────────────────────────────────┐
  │  pandoc input.md -f markdown+smart     │
  │    +pipe_tables+strikeout+task_lists   │
  │    +fenced_code_blocks                 │
  │    +autolink_bare_uris                 │
  │    -t docx -o output.docx             │
  │    --toc --toc-depth=4                 │
  │    --highlight-style=tango             │
  │    --reference-doc=reference.docx      │
  └───────────────────┬────────────────────┘
                      │
                      ▼
                 .docx file
```

#### Why Pandoc over a Node.js OOXML builder?

The previous approach used `node-html-parser` + the `docx` npm package to manually walk HTML DOM nodes and build OOXML elements. This was a **590-line fragile translation layer** that failed on:
- Nested blockquotes (couldn't reconstruct paragraph children from rendered OOXML)
- Complex table cell formatting (inline runs lost context)
- List numbering at depth > 3
- Code blocks with mixed formatting (syntax tokens stripped)

Pandoc eliminates all of this because:
- **Native heading styles**: Produces real `Heading 1`, `Heading 2` etc. — not bold paragraphs pretending to be headings
- **Real TOC**: Generates a Word TOC field that can be updated in Word itself
- **Proper lists**: Native Word numbered/bulleted list styles with correct indentation
- **Code highlighting**: Built-in syntax highlighting with configurable themes
- **Template support**: A `reference.docx` file can define custom fonts, colors, margins — applied consistently to every export
- **Robustness**: Pandoc has 15+ years of edge-case handling across hundreds of document formats

#### Pandoc Detection

The converter searches for Pandoc in order:
1. `PATH` (standard `pandoc` command)
2. `/opt/homebrew/bin/pandoc` (macOS ARM Homebrew)
3. `/usr/local/bin/pandoc` (macOS Intel / Linux)
4. `/usr/bin/pandoc` (system package)

If not found, a descriptive error with installation instructions is thrown.

#### Page Break Handling

The analyzer inserts `<!-- pagebreak -->` comments. Before passing to Pandoc, these are converted to `\newpage` — a LaTeX command that Pandoc interprets as a page break in DOCX output.

---

## Technical Stack

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^5.2.1 | HTTP server (web UI + API) |
| `puppeteer` | ^24.40.0 | Headless Chromium for PDF rendering |
| `marked` | ^13.0.0 | Markdown → HTML parser (GFM spec) |
| `highlight.js` | ^11.10.0 | Syntax highlighting engine (190+ languages) |
| `unified` | ^11.0.5 | AST processing framework |
| `remark-parse` | ^11.0.0 | Markdown → MDAST parser |
| `remark-gfm` | ^4.0.1 | GitHub Flavored Markdown AST extensions |
| `remark-stringify` | ^11.0.0 | MDAST → Markdown serializer |
| `multer` | ^2.1.1 | Multipart form-data parsing (file uploads) |
| `node-fetch` | ^3.3.2 | HTTP client for URL-based Markdown fetching |

### System Dependencies

| Binary | Purpose | Install |
|--------|---------|---------|
| `pandoc` | Markdown → DOCX conversion | `brew install pandoc` / `apt install pandoc` |
| Chromium | Downloaded automatically by Puppeteer | Bundled with `puppeteer` |

### Frontend (CDN, no build step)

| Library | Purpose |
|---------|---------|
| `marked` | Client-side Markdown parsing for live preview |
| `highlight.js` | Client-side syntax highlighting in preview |
| `GSAP` + `ScrollTrigger` | Scroll-driven animations and UI transitions |
| `Inter` (Google Fonts) | UI typography |

---

## Module Reference

### `src/analyzer.js`
- **`analyze(markdown, opts)`** — Main entry point. Parses Markdown, runs all plugins, returns `{ markdown, report }`.
- **`isAsciiArt(value)`** — Tests a string for box-drawing characters.

### `src/converter.js`
- **`convert(inputPath, outputPath, opts)`** — Reads a `.md` file, runs the Smart Analyzer, renders HTML via marked, generates PDF via Puppeteer.

### `src/docxConverter.js`
- **`convertToDocx(markdown, opts)`** — Takes raw Markdown string, runs the Smart Analyzer, writes to temp file, invokes Pandoc, returns `{ buffer, report }`.

### `src/cli.js`
- CLI entry point. Parses `--toc`, `--auto-break`, `--format`, `--title` flags. Routes to PDF or DOCX converter based on format.

### `server.js`
- Express server. Serves the web UI from `public/`, handles `POST /api/convert` with format routing.

### `src/styles.css`
- Print stylesheet injected into the HTML document before Puppeteer renders it to PDF. Controls A4 layout, typography, code blocks, tables, page breaks.

---

## Data Flow

### Web UI → PDF

```
Browser FormData { text, format: "pdf", toc, autoBreak }
    │
    ▼ POST /api/convert (Express + multer)
    │
    ▼ Write text to temp .md file
    │
    ▼ convert(tempInput, tempOutput, opts)
    │   ├── analyze(markdown) → clean markdown + report
    │   ├── marked.parse() → HTML
    │   ├── inlineImages() → HTML with base64 images
    │   ├── buildHtml() → full HTML document
    │   └── puppeteer.pdf() → .pdf file
    │
    ▼ Stream .pdf file → Response
    │
    ▼ Browser triggers download
```

### Web UI → DOCX

```
Browser FormData { text, format: "docx", toc, autoBreak }
    │
    ▼ POST /api/convert (Express + multer)
    │
    ▼ Read markdown from temp file
    │
    ▼ convertToDocx(markdown, opts)
    │   ├── analyze(markdown) → clean markdown + report
    │   ├── convertPageBreaks() → \newpage commands
    │   ├── Write to temp .md file
    │   └── pandoc input.md -t docx -o output.docx
    │
    ▼ Read .docx buffer → Response
    │
    ▼ Browser triggers download
```

### CLI → Either Format

```
node src/cli.js --format docx --toc input.md output.docx
    │
    ▼ parseArgs() → { files, opts }
    │
    ├── opts.format === 'docx'?
    │   ├── YES → fs.readFile() → convertToDocx() → fs.writeFile()
    │   └── NO  → convert(inputPath, outputPath, opts)
    │
    ▼ Print summary (time, size, report warnings)
```

---

## Problems Solved

### 1. Code Block Overflow
**Problem:** Code lines longer than the page width extend past margins, getting clipped in PDF or creating horizontal scroll in DOCX.

**Solution (PDF):** CSS `word-wrap: break-word`, `overflow-wrap: break-word`, `white-space: pre-wrap` on `pre` and `code` elements. The stylesheet enforces `max-width: 100%` on all block elements.

**Solution (DOCX):** Pandoc's verbatim environment handles code blocks as monospace paragraphs that Word wraps naturally.

### 2. Table Overflow
**Problem:** Tables with many columns or long cell content overflow page margins.

**Solution (PDF):** `table-layout: auto` with `width: 100%` forces tables to fit. `word-break: break-word` on `td`/`th` enables cell wrapping. `font-size: 12px` on table text.

**Solution (DOCX):** Pandoc generates native Word tables with auto-fit column widths. The Smart Analyzer warns when tables have 7+ columns.

### 3. Heading Hierarchy Gaps
**Problem:** A document with H1 → H3 (skipping H2) produces broken TOC structure and invalid DOCX heading styles.

**Solution:** The Smart Analyzer detects gaps and auto-corrects them at the AST level before either renderer sees the content.

### 4. ASCII Art Destruction
**Problem:** Box-drawing characters (`┌─┐│└─┘`) get syntax-highlighted as code, breaking their visual alignment.

**Solution:** The Analyzer's ASCII art detector checks for box-drawing Unicode characters and strips the `lang` attribute so no syntax highlighting is applied. The blocks render as literal monospace text.

### 5. No Page Break Control
**Problem:** Long documents render as one continuous flow with no logical page boundaries.

**Solution:** Two mechanisms:
- **Manual:** `<!-- pagebreak -->` HTML comments in Markdown
- **Automatic:** `--auto-break` flag inserts breaks before every H1

PDF: CSS `page-break-before: always`
DOCX: Pandoc `\newpage` command

### 6. Image Handling
**Problem:** Local image references (`![](./img.png)`) fail in headless Chrome because the browser has no access to the local filesystem path.

**Solution:** `inlineImages()` pre-processes the HTML, finds all `src="..."` attributes with relative paths, reads the files, and replaces them with base64 `data:` URIs.

### 7. DOCX Quality
**Problem:** Previous approach (HTML → DOM → OOXML via `docx` npm package) was a 590-line fragile translation layer that produced paragraphs styled to look like headings rather than real Word heading styles.

**Solution:** Replaced with Pandoc, which produces native Word structure: real heading styles, proper list numbering, TOC fields, and optional custom styling via `reference.docx`.

---

## API Reference

### `POST /api/convert`

**Content-Type:** `multipart/form-data`

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | One of three | `.md` file upload |
| `text` | String | One of three | Raw Markdown string |
| `url` | String | One of three | Public URL to a Markdown file |
| `format` | String | No | `pdf` (default) or `docx` |
| `toc` | String | No | `true` or `false` (default: `false`) |
| `autoBreak` | String | No | `true` or `false` (default: `false`) |
| `title` | String | No | Document title (defaults to filename) |

#### Response

| Format | Content-Type | Body |
|--------|-------------|------|
| PDF | `application/pdf` | Binary PDF stream |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Binary DOCX buffer |

#### Error Response

```json
{ "error": "Descriptive error message" }
```

Status codes: `400` (bad input), `500` (conversion failure)

---

## CLI Reference

```
InkDown — Markdown → PDF / DOCX Converter
============================================

Usage:
  node src/cli.js [options] <input.md> [output.pdf|output.docx]

Arguments:
  input.md          Path to the Markdown file (required)
  output            Where to save (optional — defaults to same name + .pdf)

Options:
  --toc             Prepend auto-generated Table of Contents
  --auto-break      Insert page break before every H1
  --format <fmt>    Output format: pdf (default) or docx
  --title <text>    Override document title in footer
  --help, -h        Show help

Format Auto-Detection:
  If output path ends with .docx, format is auto-detected.

Examples:
  node src/cli.js README.md
  node src/cli.js --format docx --toc guide.md output/guide.docx
  node src/cli.js --auto-break --title "API v2" api.md docs/api.pdf
```

---

## Design Decisions

### Why Two Renderers Instead of One?

PDF and DOCX are fundamentally different formats:
- **PDF** is a fixed-layout format — content is positioned at exact coordinates on a page
- **DOCX** is a flow-layout format — Word reflows text based on page size, margins, and viewer settings

Using a single renderer (e.g. Puppeteer for both) would mean either:
- Converting PDF to DOCX (lossy, produces images not text)
- Using a DOM-to-OOXML translator (fragile, 590 lines of edge cases)

The two-renderer approach lets each format use its **native best tool**: Chromium for pixel-perfect PDF, Pandoc for native Word structure.

### Why a Shared Analyzer?

Without the Analyzer, each renderer would need its own heading fixer, ASCII art detector, page break handler, etc. The Analyzer centralizes this intelligence so:
- Bug fixes propagate to both outputs
- New analysis plugins benefit PDF and DOCX simultaneously
- The renderers stay focused on rendering, not content analysis

### Why Pandoc over `docx` npm package?

| Aspect | `docx` npm package | Pandoc |
|--------|-------------------|--------|
| Heading styles | Simulated (bold paragraphs) | Native Word heading styles |
| TOC | Static HTML-like list | Real Word TOC field (auto-updatable) |
| Code blocks | Manual monospace paragraphs | Proper `CodeBlock` style with highlighting |
| Lists | Custom numbering config | Native Word list styles |
| Maintenance | 590 lines of DOM-to-OOXML walk | 1 function call |
| Edge cases | Breaks on nested blockquotes, complex tables | 15+ years of battle-tested handling |

### Why remark/unified over regex?

The previous heading fixer used regex on raw Markdown. This fails when:
- Headings contain inline code (`## Using \`async/await\``)
- Headings are inside code blocks (false positives)
- Content has HTML comments that look like headings

The AST approach operates on parsed, typed nodes — a `heading` node is unambiguously a heading, regardless of surrounding context.

### Why Express 5?

Express 5 provides native `async/await` error handling — uncaught promise rejections in route handlers are automatically forwarded to the error handler instead of crashing the process. This is critical for a conversion server where Puppeteer or Pandoc can fail unpredictably.

---

## Frontend Architecture

The web UI is a **zero-build-step** single-page application:

```
public/
├── index.html     Shell with semantic HTML sections
├── app.css        Complete design system (CSS custom properties)
└── app.js         All application logic (vanilla JS, no framework)
```

### Design System

- **Dark/Light theme** via CSS custom properties on `:root[data-theme]`
- **Raycast-inspired** visual design: near-black backgrounds, layered shadows, Inter typography
- Theme preference persisted in `localStorage` and applied before first paint (no flash)

### State Management

A single `state` object manages all UI state:
```javascript
{
  mode: 'editor' | 'upload' | 'url',
  format: 'pdf' | 'docx',
  markdownText: '',
  uploadedFile: null,
  urlValue: '',
  options: { toc, autoBreak, title },
  loading: false,
}
```

### Live Preview

- Editor input debounced at 300ms
- `marked.parse()` runs client-side to generate preview HTML
- Preview rendered in a sandboxed `<iframe>` via `srcdoc`
- `highlight.js` loads from CDN for client-side syntax highlighting

### Animations

GSAP + ScrollTrigger handle all animations:
- Hero section: staggered reveal on load
- Feature rows: slide-in on scroll
- Mobile nav: slide panel with staggered link animation

### Format Toggle

A segmented button control in the options bar switches between PDF and DOCX:
- Updates `state.format`
- Changes the convert button label ("Generate PDF" / "Generate DOCX")
- Updates info text with format-specific render time estimate

---

## Security & Privacy

- **100% local execution** — no external API calls, no telemetry, no analytics
- **Temp file cleanup** — all intermediate files (input .md, output .pdf/.docx) are cleaned up after response
- **No persistent storage** — server stores nothing; only `localStorage` in the browser saves editor content and theme preference
- **Input validation** — multer limits file size; URL fetch has a 15-second timeout
- **Sandboxed preview** — live preview uses `<iframe srcdoc>`, isolating preview content from the main page
- **No `--no-sandbox`** — Puppeteer runs with `--no-sandbox` flag for compatibility in containerized environments; in production, run behind a reverse proxy with proper OS-level sandboxing

---

## System Requirements

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| Node.js | ≥ 18.0.0 | Required for `crypto.randomUUID()` and ESM interop |
| Pandoc | Any recent version | Required for DOCX export (`brew install pandoc`) |
| Disk space | ~300 MB | Chromium binary (~170 MB) + Pandoc (~120 MB) + node_modules |
| Memory | ~512 MB | Chromium uses ~200 MB per PDF render |
| OS | macOS, Linux, Windows | All platforms supported |

---

<p align="center">
  <sub>For questions, issues, or contributions — open an issue or PR on GitHub.</sub>
</p>
