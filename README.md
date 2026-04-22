<p align="center">
  <img src="public/favicon.svg" width="80" alt="InkDown logo" />
</p>

<h1 align="center">InkDown</h1>

<p align="center">
  <strong>Markdown in. Beautiful documents out.</strong><br>
  <sub>PDF &bull; DOCX &bull; REST API &bull; Syntax Highlighting &bull; Smart Tables &bull; Page Control</sub>
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/-Get%20Started-ff4757?style=for-the-badge" alt="Get Started" /></a>&nbsp;
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node ≥ 18" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
</p>

---

## ✨ What is InkDown?

InkDown turns raw Markdown into **pixel-perfect PDFs** and **native Word documents** — with zero config. Use the web UI, the CLI, or call the **REST API** from any app in any language.

> *Think of it as a print button for your `.md` files — or a document microservice for your platform.*

```
  ┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
  │  Markdown   │ ───▶ │   InkDown    │ ───▶ │  PDF  or  DOCX   │
  │  Web · CLI  │      │  REST API    │      │  pixel-perfect   │
  │  REST API   │      │  ⚡ Engine   │      │  ready to share  │
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
| 🧠 | **Smart Analyzer** | AST-based pre-processing — fixes heading hierarchy, detects ASCII art |
| 🔌 | **REST API** | Call from any language — JSON body, file upload, or URL fetch |

---

## 🚀 Quick Start

> **Prerequisites:** [Node.js](https://nodejs.org/) 18+ and [Pandoc](https://pandoc.org/installing.html) (for DOCX export)

```bash
# Clone & install
git clone <repo-url> && cd inkdown
npm install

# Install Pandoc (required for DOCX export)
brew install pandoc          # macOS
sudo apt install pandoc      # Linux/Debian
choco install pandoc         # Windows

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
node src/cli.js README.md                                          # Simple PDF
node src/cli.js --toc --auto-break docs/guide.md output/guide.pdf # Full options
node src/cli.js --format docx --toc README.md output/README.docx  # DOCX with TOC
node src/cli.js --title "API Reference v2" api.md docs/api-ref.pdf # Custom title
```

---

## 🔌 REST API

InkDown exposes a versioned REST API so you can integrate document conversion into any platform or pipeline.

### Base URL

```
http://localhost:3000/api/v1
```

### Authentication

Authentication is **optional by default**. Set the `INKDOWN_API_KEYS` environment variable to require an API key:

```bash
INKDOWN_API_KEYS=your_secret_key node server.js
```

Pass the key in any request using **either** header:

```
X-API-Key: your_secret_key
Authorization: Bearer your_secret_key
```

> The legacy `/api/convert` endpoint (used by the web UI) is always open regardless of this setting.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/health` | No | Server status and version |
| `GET` | `/api/v1/info` | No | API metadata and endpoint list |
| `POST` | `/api/v1/convert` | If configured | Convert Markdown → PDF or DOCX |

### POST /api/v1/convert

**Input — pick one:**

| Field | Type | Description |
|-------|------|-------------|
| `markdown` | String | Raw Markdown content |
| `url` | String | Public `https://` URL to a `.md` file |
| `file` | File | Multipart `.md` file upload |

**Options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `format` | `pdf` \| `docx` | `pdf` | Output format |
| `title` | String | filename | Document title in PDF footer |
| `toc` | Boolean | `false` | Generate Table of Contents |
| `autoBreak` | Boolean | `false` | Page break before every H1 |

**Response:** Binary file with `Content-Disposition: attachment; filename="..."`. On error: `{ "error": "...", "code": "..." }`.

### Code Examples

**cURL**
```bash
curl -X POST http://localhost:3000/api/v1/convert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secret_key" \
  -d '{"markdown": "# Hello\n\nWorld!", "format": "pdf", "toc": true}' \
  --output document.pdf
```

**JavaScript**
```javascript
const res = await fetch('http://localhost:3000/api/v1/convert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': 'your_secret_key' },
  body: JSON.stringify({ markdown: '# Hello\n\nWorld!', format: 'pdf' }),
});
const blob = await res.blob();
// save or use blob…
```

**Python**
```python
import requests
r = requests.post(
    'http://localhost:3000/api/v1/convert',
    headers={'X-API-Key': 'your_secret_key'},
    json={'markdown': '# Hello\n\nWorld!', 'format': 'pdf'},
)
open('document.pdf', 'wb').write(r.content)
```

> Full examples for Node.js and PHP, plus a complete parameter reference, are in [API.md](API.md).

---

## ⚙️ Configuration

Copy `.env.example` to `.env` and adjust as needed. All variables are optional.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the server listens on |
| `INKDOWN_API_KEYS` | *(none)* | Comma-separated API keys. If unset, `/api/v1/convert` is open to all callers. |
| `INKDOWN_CORS_ORIGINS` | `*` | Comma-separated allowed CORS origins. Restrict in production (e.g. `https://myapp.com`). |

```bash
cp .env.example .env
# edit .env, then:
node server.js
```

Generate a strong API key:
```bash
openssl rand -hex 32
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

## 🏗️ Project Structure

```
├── server.js              Express server — web UI + REST API v1
├── src/
│   ├── analyzer.js        Smart Markdown Analyzer (remark AST plugins)
│   ├── converter.js       PDF engine — Puppeteer + marked + highlight.js
│   ├── docxConverter.js   DOCX engine — Pandoc + Smart Analyzer
│   ├── cli.js             CLI entry point (PDF + DOCX)
│   └── styles.css         Print stylesheet for PDF rendering
├── public/
│   ├── index.html         Web app (converter UI + API docs)
│   ├── app.css            UI design system (dark/light themes)
│   └── app.js             Frontend logic & GSAP animations
├── samples/
│   └── test.md            Sample covering all features
├── output/                Default CLI output directory
├── reference.docx         Optional Pandoc reference template
├── API.md                 Full REST API reference
├── .env.example           Environment variable template
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
| **cors** | CORS headers with configurable origin allowlist |
| **multer** | Multipart file upload handling |
| **GSAP** | Frontend animations (CDN) |

---

## 🛠️ Scripts

```bash
npm start           # Start the server (port 3000)
npm run dev         # Alias for npm start
npm test            # Convert samples/test.md → output/test.pdf
npm run test:docx   # Convert samples/test.md → output/test.docx
npm run convert     # Alias for node src/cli.js
```

---

## 🔒 Security & Privacy

**Privacy:** InkDown runs **100% locally**. Your documents never leave your machine — no cloud, no telemetry, no tracking.

**API security:**
- The `/api/v1/convert` endpoint supports optional API key authentication via `INKDOWN_API_KEYS`.
- URL fetching (`url` parameter) only allows public `http`/`https` addresses. Private IP ranges, loopback addresses, and link-local addresses (including cloud metadata endpoints) are rejected.
- Image inlining is restricted to files inside the document's own directory — absolute paths and directory traversals are blocked.
- Set `INKDOWN_CORS_ORIGINS` to restrict which origins can call the API from a browser.

---

<p align="center">
  <sub>Made with ☕ and too many late nights.</sub><br>
  <sub>If InkDown saved you time, consider giving it a ⭐</sub>
</p>
