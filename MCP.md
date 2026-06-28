# InkDown MCP Server

The InkDown MCP server exposes document conversion and analysis as native tools for Claude, Cursor, Windsurf, and any other MCP-compatible AI.

## Tools

| Tool | Description |
|------|-------------|
| `inkdown_convert` | Convert Markdown → PDF, DOCX, or HTML. Returns base64-encoded file. |
| `inkdown_analyze` | Analyze markdown structure: headings, word count, diagrams, issues, suggestions. |
| `inkdown_clean` | Fix heading hierarchy and normalize AI-generated markdown before converting or storing. |
| `inkdown_batch_convert` | Convert up to 20 documents in one call (PDF or DOCX). |

---

## Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "inkdown": {
      "command": "node",
      "args": ["/absolute/path/to/InkDown/src/mcpServer.js"],
      "env": {}
    }
  }
}
```

Replace `/absolute/path/to/InkDown` with the actual path on your machine. Restart Claude Desktop.

### Cursor

Add to `~/.cursor/mcp.json` (or Cursor's MCP settings UI):

```json
{
  "mcpServers": {
    "inkdown": {
      "command": "node",
      "args": ["/absolute/path/to/InkDown/src/mcpServer.js"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "inkdown": {
      "command": "node",
      "args": ["/absolute/path/to/InkDown/src/mcpServer.js"]
    }
  }
}
```

### HTTP mode (remote / multi-client)

Start the HTTP SSE server:

```bash
node src/mcpServer.js --http          # listens on port 3001
node src/mcpServer.js --http --port 3002  # custom port
npm run mcp:http                      # shortcut
```

Then connect any MCP client to `http://localhost:3001/mcp`.

---

## Usage Examples

Once connected, you can ask Claude (or any MCP-capable agent):

> "Convert this markdown to a PDF with a table of contents."

> "Analyze this document and tell me its structure."

> "Clean up the heading hierarchy in this markdown before I store it."

> "Export these three meeting notes as DOCX files."

The agent calls the appropriate tool automatically — no manual API knowledge required.

---

## Tool Reference

### `inkdown_convert`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `markdown` | string | required | Markdown content to convert |
| `format` | `"pdf"` \| `"docx"` \| `"html"` | `"pdf"` | Output format |
| `title` | string | `"Document"` | Document title |
| `author` | string | `""` | Author name |
| `toc` | boolean | `false` | Include Table of Contents |
| `auto_break` | boolean | `false` | Page breaks before H1 headings |
| `number_sections` | boolean | `false` | Number headings (1., 1.1, …) |

Returns JSON with `filename`, `mime_type`, `size_bytes`, `data` (base64).

### `inkdown_analyze`

| Parameter | Type | Description |
|-----------|------|-------------|
| `markdown` | string | Markdown content to analyze |

Returns JSON with `word_count`, `reading_time_minutes`, `tokens_approx`, `headings[]`, `code_blocks[]`, `diagrams[]`, `tables`, `images`, `math`, `issues[]`, `suggestions[]`.

### `inkdown_clean`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `markdown` | string | required | Markdown to clean |
| `fix_headings` | boolean | `true` | Fix heading hierarchy gaps |
| `auto_break` | boolean | `false` | Insert page breaks before H1 |

Returns JSON with `markdown` (cleaned string), `changes[]`, `changed` (boolean).

### `inkdown_batch_convert`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `files` | array | required | `[{ name, markdown }, ...]` — up to 20 items |
| `format` | `"pdf"` \| `"docx"` | `"pdf"` | Output format |
| `toc` | boolean | `false` | Include TOC in each document |

Returns JSON with `converted`, `failed`, `results[]` (each with `filename`, `data` base64), `errors[]`.

---

## Requirements

- Node.js ≥ 18
- Pandoc installed (for DOCX conversion) — `brew install pandoc`
- Chromium available (bundled with Puppeteer, auto-downloaded on first run)
