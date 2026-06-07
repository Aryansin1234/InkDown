# InkDown — Markdown to PDF, DOCX & HTML

Convert any Markdown file to a **production-quality PDF, DOCX, or HTML** directly from VS Code — with full support for Mermaid diagrams, KaTeX math, syntax-highlighted code blocks, tables of contents, custom CSS themes, and a live preview panel.

## Features

- **One-click export** — PDF, DOCX, or HTML from the editor title bar or right-click menu
- **Convert with Options wizard** — guided multi-step flow: format → metadata → CSS theme / page size / reference doc → TOC & breaks → writes YAML frontmatter back to the file
- **Live preview** — Instant rendered preview beside your editor as you type
- **Mermaid diagrams** — Flowcharts, sequence diagrams, ER diagrams, Gantt, pie, mindmap and more
- **KaTeX math** — Inline `$...$` and display `$$...$$` equations rendered correctly in all formats
- **Syntax highlighting** — Fenced code blocks highlighted for 180+ languages
- **Table of Contents** — Auto-generated TOC with a single toggle
- **Auto page breaks** — Optionally insert page breaks before every H1
- **Custom CSS themes** — Upload any `.css` file to style PDF and HTML output
- **DOCX reference templates** — Apply custom Word styles via a `.docx` reference document
- **Batch export** — Convert every `.md` file in a folder in one step
- **Auto-export on save** — Re-convert to the chosen format every time you save
- **YAML frontmatter** — Set title, author, date, watermark, TOC, page size in the file itself

## Quick Start

1. Open any `.md` file
2. Press `⌘⇧⌥V` (Mac) / `Ctrl+Shift+Alt+V` (Windows/Linux) to open the **live preview**
3. Press `⌘⇧⌥P` / `Ctrl+Shift+Alt+P` to **export as PDF**, or open the Command Palette and choose `InkDown: Convert with Options…` for the full wizard

## Requirements

- **InkDown server** bundled inside this extension — start it once with `InkDown: Start Server` from the Command Palette, or it starts automatically on first conversion
- **Pandoc** — required for DOCX output only (`brew install pandoc` / `winget install JohnMacFarlane.Pandoc`)

## Commands

| Command | Shortcut (Mac) | Shortcut (Win/Linux) | Description |
|---|---|---|---|
| `InkDown: Open Preview` | `⌘⇧⌥V` | `Ctrl+Shift+Alt+V` | Live rendered preview beside the editor |
| `InkDown: Convert to PDF` | `⌘⇧⌥P` | `Ctrl+Shift+Alt+P` | Export current file as PDF |
| `InkDown: Convert to DOCX` | `⌘⇧⌥D` | `Ctrl+Shift+Alt+D` | Export current file as Word document |
| `InkDown: Export as HTML` | `⌘⇧⌥H` | `Ctrl+Shift+Alt+H` | Export as self-contained HTML |
| `InkDown: Convert with Options…` | — | — | Full wizard (format, metadata, CSS, template, TOC…) |
| `InkDown: Export all Markdown files in folder` | — | — | Batch export every `.md` in a folder |
| `InkDown: Toggle Auto-Export on Save` | — | — | Re-export on every save |
| `InkDown: Start Server` | — | — | Start the InkDown conversion server |
| `InkDown: Stop Server` | — | — | Stop the server |

## Convert with Options Wizard

Run `InkDown: Convert with Options…` for a guided, step-by-step conversion:

| Step | What you configure |
|---|---|
| **Step 1 — Format** | PDF · DOCX · HTML |
| **Step 2 — Metadata** | Title, Author, Date, Watermark text |
| **Step 3a — Format options** | PDF: page size (A4/Letter/A3/A5/Legal) · DOCX: reference template · HTML: CSS theme |
| **Step 3b — CSS theme** | Browse for a `.css` file to override default styles |
| **Step 4 — Options** | Table of Contents, Auto page breaks, **Write to YAML frontmatter** |

### Write to YAML frontmatter

When **"Write options to YAML frontmatter"** is checked in Step 4, the wizard writes your title/author/date/watermark directly into a `---` YAML block at the top of the `.md` file. On the next conversion these values are pre-filled automatically from the file.

```yaml
---
title: "Project Proposal"
author: "Jane Smith"
date: "June 2026"
watermark: "DRAFT"
---
```

## Custom CSS Themes

Override the default document styles for PDF and HTML output.

**In the wizard**: Step 3b → *Browse for CSS…* → select your `.css` file.

**In `.inkdown.json`**:
```json
{ "theme": "./styles/my-theme.css" }
```

Sample themes are included in the InkDown project at `samples/themes/` — `corporate.css` (blue heading styles) and `minimal.css` (serif academic look).

## DOCX Reference Templates

Control Word fonts, heading colours, margins, and headers/footers with a reference `.docx`.

**In the wizard**: Step 3 → *Browse for .docx…* → select your template.

Generate a starting template:
```bash
node samples/make-reference-docx.js
# Creates: samples/reference.docx — open in Word and edit styles
```

**In `.inkdown.json`**:
```json
{ "referenceDoc": "./templates/my-style.docx" }
```

## Batch Export

Right-click any **folder** in the VS Code Explorer → **InkDown: Export all Markdown files in folder**.

All `.md` files in the folder (recursive) are converted to the format set in `inkdown.defaultFormat`. Output goes to `inkdown.outputDirectory` or next to each source file.

## Auto-Export on Save

1. `InkDown: Toggle Auto-Export on Save` — turns on watching
2. Set `inkdown.autoExportFormat` (`pdf` / `docx` / `html`)
3. Every save of a `.md` file triggers a silent conversion

## YAML Frontmatter Options

Add a `---` block at the top of any `.md` file:

```yaml
---
title: "My Document"
author: "Your Name"
date: "June 2026"
toc: true
autoBreak: true
pageSize: A4
watermark: CONFIDENTIAL
---
```

| Key | Values | Effect |
|---|---|---|
| `title` | string | Document title on cover and PDF metadata |
| `author` | string | Author on cover page |
| `date` | string | Date on cover page |
| `toc` | `true` / `false` | Prepend Table of Contents |
| `autoBreak` | `true` / `false` | Page break before every H1 |
| `pageSize` | `A4` `Letter` `A3` `A5` `Legal` | PDF page size |
| `watermark` | string | Diagonal watermark text (e.g. `DRAFT`) |

## Workspace Config (`.inkdown.json`)

Place a `.inkdown.json` in your project root to share defaults:

```json
{
  "format": "pdf",
  "toc": true,
  "autoBreak": false,
  "pageSize": "A4",
  "outputDirectory": "./dist",
  "referenceDoc": "./templates/style.docx",
  "theme": "./themes/corporate.css"
}
```

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `inkdown.serverUrl` | `http://localhost:3000` | InkDown server URL |
| `inkdown.inkdownPath` | *(auto-detect)* | Path to InkDown directory |
| `inkdown.outputDirectory` | *(same as source)* | Where to save exported files |
| `inkdown.defaultFormat` | `pdf` | Default export format (`pdf` / `docx` / `html`) |
| `inkdown.openAfterConvert` | `true` | Open the file after export |
| `inkdown.autoExport` | `false` | Enable auto-export on save |
| `inkdown.autoExportFormat` | `pdf` | Format for auto-export on save |
| `inkdown.defaultToc` | `false` | Include Table of Contents by default |
| `inkdown.defaultAutoBreak` | `false` | Auto page breaks before H1 by default |
| `inkdown.apiKey` | *(blank)* | API key if server authentication is enabled |

## License

MIT

