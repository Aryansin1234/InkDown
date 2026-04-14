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

InkDown turns raw Markdown into **pixel-perfect PDF and Word documents** — with zero config. Write once, export everywhere: boardroom-ready reports, technical docs, or project handoffs.

> *Think of it as a print button for your `.md` files.*

```
  ┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
  │  Markdown   │ ───▶ │   InkDown    │ ───▶ │  PDF  or  DOCX   │
  │  (.md file) │      │  ⚡ Engine    │      │  ready to share  │
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
| ⚡ | **Dual Output** | PDF (Puppeteer/Chrome) + Word DOCX (programmatic OOXML) |

---

## 🚀 Quick Start

> **Prerequisite:** [Node.js](https://nodejs.org/) 18+

```bash
# Clone & install
git clone <repo-url> && cd Smart_MarkDown_Parser
npm install

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
| 📥 Format | Choose **PDF** or **DOCX** before exporting |

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘ Enter` / `Ctrl Enter` | Generate document |
| `Tab` in editor | Insert 2-space indent |

---

## 💻 CLI

Convert files straight from the terminal — no server required.

```bash
node src/cli.js [options] <input.md> [output.pdf]
```

### Flags

| Flag | Description |
|------|-------------|
| `--toc` | Prepend a Table of Contents |
| `--auto-break` | Page break before every H1 |
| `--title <text>` | Custom footer title |
| `-h`, `--help` | Show help |

### Examples

```bash
# Simple conversion
node src/cli.js README.md

# Full-featured export
node src/cli.js --toc --auto-break docs/guide.md output/guide.pdf

# Custom title
node src/cli.js --title "API Reference v2" api.md docs/api-ref.pdf
```

> **Note:** CLI outputs PDF only. Use the web app for DOCX.

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

Single endpoint. Send Markdown, get documents.

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
  -F "file=@README.md" -F "format=pdf" -F "toc=true" \
  -o output.pdf

# Text → DOCX
curl -X POST http://localhost:3000/api/convert \
  -F "text=# Hello World" -F "format=docx" -F "title=My Doc" \
  -o output.docx

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
│   ├── converter.js       PDF engine — Puppeteer + marked + highlight.js
│   ├── docxConverter.js   DOCX engine — node-html-parser + docx (OOXML)
│   ├── cli.js             CLI entry point
│   └── styles.css         Print stylesheet for PDF rendering
├── public/
│   ├── index.html         Web app shell
│   ├── app.css            UI design system (dark/light themes)
│   └── app.js             Frontend logic & GSAP animations
├── samples/
│   └── test.md            Sample covering all features
└── output/                Default CLI output directory
```

---

## 📦 Tech Stack

| Package | Role |
|---------|------|
| **Puppeteer** | Headless Chrome → PDF rendering |
| **marked** | Markdown → HTML (GFM) |
| **highlight.js** | Syntax highlighting (190+ languages) |
| **docx** | Programmatic OOXML document generation |
| **node-html-parser** | DOM parsing for HTML → DOCX pipeline |
| **Express** | HTTP server |
| **multer** | Multipart file upload handling |
| **GSAP** | Frontend animations (CDN) |

---

## 🛠️ Scripts

```bash
npm test          # Convert samples/test.md → output/test.pdf
npm run convert   # Alias for node src/cli.js
```

---

## 🔒 Privacy

InkDown runs **100% locally**. Your documents never leave your machine — no cloud, no telemetry, no tracking.

---

<p align="center">
  <sub>Made with ☕ and too many late nights.</sub><br>
  <sub>If InkDown saved you time, consider giving it a ⭐</sub>
</p>
