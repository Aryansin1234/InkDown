<p align="center">
  <img src="public/favicon.svg" width="80" alt="InkDown logo" />
</p>

<h1 align="center">InkDown</h1>

<p align="center">
  <strong>Markdown in. Beautiful documents out.</strong><br>
  <sub>PDF &bull; DOCX &bull; Syntax Highlighting &bull; Smart Tables &bull; Page Control</sub>
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/-Get%20Started-ff4757?style=for-the-badge" alt="Get Started" /></a>&nbsp;
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node ≥ 18" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
</p>

---

## ✨ What is InkDown?

InkDown turns raw Markdown into **pixel-perfect PDFs** and **native Word documents** — with zero config. Write once, export beautifully: boardroom-ready reports, technical docs, or project handoffs.

> *Think of it as a print button for your `.md` files.*

```
  ┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
  │  Markdown    │ ───▶ │   InkDown    │ ───▶ │   Pixel-perfect  │
  │  (.md file)  │      │  ⚡ Engine    │      │   PDF  or  DOCX  │
  └─────────────┘      └──────────────┘      └──────────────────┘
```

---

## 🎯 Features at a Glance

| | Feature | Details |
|---|---------|---------|
| 🎨 | **Syntax Highlighting** | 190+ languages, GitHub-light theme via highlight.js |
| 📐 | **Overflow-proof Code** | Long lines wrap cleanly — nothing bleeds off the page |
| 📊 | **Smart Tables** | Auto-scale to page width, word-wrap cells, alternating row colors |
| 🖼️ | **Image Handling** | Local images base64-inlined, remote images auto-constrained |
| 📄 | **Page Break Control** | Manual `<!-- pagebreak -->` comments or auto-break before H1 |
| 📑 | **Table of Contents** | One-click TOC with clickable anchor links |
| 🔢 | **Page Numbers** | Footer on every page: *Title — Page X / Y* |
| 🌗 | **Dark & Light Theme** | Toggle in the web UI, preference persists across sessions |
| ⚡ | **PDF Output** | Headless Chrome rendering via Puppeteer, A4 format |
| 📝 | **DOCX Output** | Native Word documents via Pandoc — real heading styles, native TOC |
| 🧠 | **Smart Analyzer** | AST-based pre-processing — fixes heading hierarchy, detects ASCII art, normalizes structure |

---

## 🚀 Quick Start

> **Prerequisite:** [Node.js](https://nodejs.org/) 18+

```bash
# Clone & install
git clone <repo-url> && cd Smart_MarkDown_Parser
npm install

# Install Pandoc (required for DOCX export)
# macOS:
brew install pandoc
# Linux:
# sudo apt install pandoc
# Windows:
# choco install pandoc

# Launch
node server.js
```

Then open **[http://localhost:3000](http://localhost:3000)** — that's it.

---

## 🖥️ Web App

### Three ways to feed it Markdown

| Mode | How |
|------|-----|
| **✏️ Editor** | Type or paste Markdown — live preview as you type |
| **📁 Upload** | Drag & drop a `.md` file, or click to browse |
| **🔗 URL** | Paste any public `.md` link (GitHub raw URLs work great) |

### Options panel

| Option | What it does |
|--------|-------------|
| 📑 Table of Contents | Auto-generated TOC linked to your headings |
| 📄 Auto Page Breaks | Insert a break before every H1 |
| ✏️ Document Title | Override the footer title |

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘ Enter` / `Ctrl Enter` | Generate document |
| `Tab` in editor | Insert 2-space indent |

---

## 💻 CLI

Convert files straight from the terminal — no server required.

```bash
node src/cli.js [options] <input.md> [output.pdf|output.docx]
```

### Flags

| Flag | Description |
|------|-------------|
| `--toc` | Prepend a Table of Contents |
| `--auto-break` | Page break before every H1 |
| `--format <fmt>` | Output format: `pdf` (default) or `docx` |
| `--title <text>` | Custom footer title |
| `-h`, `--help` | Show help |

### Examples

```bash
# Simple PDF conversion
node src/cli.js README.md

# PDF with all options
node src/cli.js --toc --auto-break docs/guide.md output/guide.pdf

# DOCX export
node src/cli.js --format docx README.md output/README.docx

# DOCX with TOC and auto page breaks
node src/cli.js --format docx --toc --auto-break docs/guide.md output/guide.docx

# Custom title
node src/cli.js --title "API Reference v2" api.md docs/api-ref.pdf

# Auto-detect format from output extension
node src/cli.js README.md output/README.docx
```

---

## 📝 Supported Markdown

InkDown supports the full **GitHub Flavored Markdown** spec, plus extras:

<details>
<summary><strong>Click to expand syntax reference</strong></summary>

````markdown
# Heading 1
## Heading 2
### Heading 3

**Bold**, *italic*, ~~strikethrough~~, `inline code`

[Links](https://example.com) and ![Images](./image.png)

> Blockquotes with styled left-border

- Unordered lists
  - Nested items
1. Ordered lists

```javascript
// Fenced code blocks with syntax highlighting
const greet = name => `Hello, ${name}!`;
```

| Column A | Column B | Column C |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |

<!-- pagebreak -->

---
````

</details>

---

## 🔌 API

Single endpoint. Send Markdown, get a PDF or DOCX.

### `POST /api/convert`

**Content-Type:** `multipart/form-data`

#### Input (pick one)

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | A `.md` file upload |
| `text` | String | Raw Markdown string |
| `url` | String | Public URL to a `.md` file |

#### Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `format` | `pdf` \| `docx` | `pdf` | Output format |
| `toc` | `true` \| `false` | `false` | Include Table of Contents |
| `autoBreak` | `true` \| `false` | `false` | Page break before each H1 |
| `title` | String | filename | Footer title |

#### curl Examples

```bash
# File → PDF with TOC
curl -X POST http://localhost:3000/api/convert \
  -F "file=@README.md" -F "toc=true" \
  -o output.pdf

# Text → DOCX
curl -X POST http://localhost:3000/api/convert \
  -F "text=# Hello World" -F "format=docx" -F "title=My Doc" \
  -o output.docx

# File → DOCX with TOC and auto breaks
curl -X POST http://localhost:3000/api/convert \
  -F "file=@README.md" -F "format=docx" -F "toc=true" -F "autoBreak=true" \
  -o output.docx

# Text → PDF
curl -X POST http://localhost:3000/api/convert \
  -F "text=# Hello World" -F "title=My Doc" \
  -o output.pdf

# URL → PDF
curl -X POST http://localhost:3000/api/convert \
  -F "url=https://raw.githubusercontent.com/user/repo/main/README.md" \
  -o output.pdf
```

---

## 🏗️ Project Structure

```
├── server.js              Express server & /api/convert endpoint
├── src/
│   ├── analyzer.js        Smart Markdown Analyzer (remark AST plugins)
│   ├── converter.js       PDF engine — Puppeteer + marked + highlight.js
│   ├── docxConverter.js   DOCX engine — Pandoc + Smart Analyzer
│   ├── cli.js             CLI entry point (PDF + DOCX)
│   └── styles.css         Print stylesheet for PDF rendering
├── public/
│   ├── index.html         Web app shell (PDF/DOCX format toggle)
│   ├── app.css            UI design system (dark/light themes)
│   └── app.js             Frontend logic & GSAP animations
├── samples/
│   └── test.md            Sample covering all features
├── output/                Default CLI output directory
├── reference.docx         Optional Pandoc reference template for DOCX styling
└── ARCHITECTURE.md        Technical deep-dive & system design
```

---

## 📦 Tech Stack

| Package | Role |
|---------|------|
| **Puppeteer** | Headless Chrome → PDF rendering |
| **Pandoc** | Markdown → native Word DOCX (system binary) |
| **marked** | Markdown → HTML (GFM spec) |
| **highlight.js** | Syntax highlighting (190+ languages) |
| **unified / remark** | Markdown AST parsing & smart analysis plugins |
| **Express** | HTTP server |
| **multer** | Multipart file upload handling |
| **GSAP** | Frontend animations (CDN) |

---

## 🛠️ Scripts

```bash
npm test            # Convert samples/test.md → output/test.pdf
npm run test:docx   # Convert samples/test.md → output/test.docx
npm run convert     # Alias for node src/cli.js
npm run dev         # Start development server
```

---

## 🔒 Privacy

InkDown runs **100% locally**. Your documents never leave your machine — no cloud, no telemetry, no tracking.

---

<p align="center">
  <sub>Made with ☕ and too many late nights.</sub><br>
  <sub>If InkDown saved you time, consider giving it a ⭐</sub>
</p>
