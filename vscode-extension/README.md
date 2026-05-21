# InkDown — Markdown to PDF & DOCX

Convert any Markdown file to a **production-quality PDF or DOCX** directly from VS Code — with full support for Mermaid diagrams, KaTeX math, syntax-highlighted code blocks, tables of contents, and a live preview panel.

## Features

- **One-click export** — Convert the open `.md` file to PDF or DOCX from the editor title bar or right-click menu
- **Live preview** — Instant rendered preview beside your editor as you type
- **Mermaid diagrams** — Flowcharts, sequence diagrams, Gantt charts, and more
- **KaTeX math** — Inline `$...$` and display `$$...$$` equations rendered correctly
- **Syntax highlighting** — Fenced code blocks highlighted for 180+ languages
- **Table of Contents** — Auto-generated ToC with one option toggle
- **Auto page breaks** — Optionally insert page breaks before every H1
- **DOCX styling** — Custom `.lua` filters for polished Word output

## Quick Start

1. Open any `.md` file
2. Click the **InkDown preview** icon (👁) in the editor title bar to open the live preview
3. Click the **PDF** icon (📄) to export, or use the command palette:
   - `InkDown: Convert to PDF`
   - `InkDown: Convert to DOCX`
   - `InkDown: Convert with Options…`

## Requirements

- **InkDown server** running locally (included in the [InkDown](https://github.com/inkdown/inkdown) project)
- Start it with `InkDown: Start Server` from the command palette, or run `node server.js` in the InkDown directory

## Commands

| Command | Description |
|---|---|
| `InkDown: Open Preview` | Live rendered preview beside the editor |
| `InkDown: Convert to PDF` | Export current file as PDF |
| `InkDown: Convert to DOCX` | Export current file as DOCX |
| `InkDown: Convert with Options…` | Choose format, ToC, page breaks |
| `InkDown: Start Server` | Start the InkDown conversion server |
| `InkDown: Stop Server` | Stop the server |

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `inkdown.inkdownPath` | *(auto-detect)* | Path to InkDown installation directory |
| `inkdown.serverUrl` | `http://localhost:3000` | InkDown server URL |
| `inkdown.outputDirectory` | *(same as source)* | Where to save exported files |
| `inkdown.defaultFormat` | `pdf` | Default export format |
| `inkdown.openAfterConvert` | `true` | Open the file after export |
| `inkdown.defaultToc` | `false` | Include Table of Contents by default |
| `inkdown.defaultAutoBreak` | `false` | Auto page breaks before H1 by default |

## License

MIT
