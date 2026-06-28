# InkDown — AI-Era Roadmap

InkDown was built to solve a real problem in the AI stack: language models produce markdown, but humans consume polished documents. That gap is already valuable. This roadmap describes how to widen that gap into a moat — and become infrastructure for the AI agent ecosystem.

---

## The Core Thesis

Every AI agent, copilot, and pipeline eventually needs to produce a deliverable. Right now that deliverable is almost always either a raw markdown string or a hallucinated attempt at a binary format. InkDown should be the universal **document output layer** for the AI stack — a single call that takes whatever a model produced and emits a production-quality PDF, DOCX, or HTML artifact.

The token-preservation angle already solves one problem: agents don't burn tokens reformatting content. The next step is making InkDown the easiest, most reliable way for agents to emit real documents.

---

## Phase 1 — MCP Server (Highest Impact, Ship First)

**Why:** MCP (Model Context Protocol) is the standard integration surface for Claude, Cursor, Windsurf, and any MCP-compatible AI tool. Adding an MCP server turns InkDown into a native capability for every user of those tools. Zero friction — no API key, no HTTP knowledge, just a tool call.

### Tools to expose

```
inkdown_convert
  markdown: string          — the content to convert
  format: "pdf"|"docx"|"html"
  title?: string
  toc?: boolean
  author?: string
  auto_break?: boolean
  theme?: string
  → returns: base64-encoded file + filename + mime type

inkdown_analyze
  markdown: string
  → returns: { headings, word_count, diagram_count, tables,
               reading_time_minutes, issues[], suggestions[] }

inkdown_clean
  markdown: string
  → returns: cleaned markdown string (heading hierarchy fixed,
             tables normalized, consistent code fences)

inkdown_batch_convert
  files: Array<{ name: string, markdown: string }>
  format: "pdf"|"docx"|"html"
  → returns: Array<{ name, base64, size_bytes }>
```

### Implementation

- New file `src/mcpServer.js` — `@modelcontextprotocol/sdk` based server
- Runs on a second port (default 3001) alongside the HTTP server, or via stdio (for Claude Desktop)
- Shares the same conversion engine — no duplication
- Config: `MCP_ENABLED=true`, `MCP_PORT=3001`
- Add `"mcp": "node src/mcpServer.js"` to package.json scripts

### VSCode Extension

- Auto-start the MCP server when the extension activates
- Add `mcp` entry to the extension's `contributes` section so Claude in VSCode finds it automatically
- Zero configuration for the user

---

## Phase 2 — Agent-Friendly API Upgrades

The current REST API is synchronous and returns binary blobs. That works fine for the web UI but poorly for agents running in pipelines.

### 2a. Async Job API

Agents often fan out many conversions simultaneously. A synchronous API blocks the agent thread.

```
POST /api/v1/jobs
  body: same as /api/v1/convert
  → { job_id, status: "queued", eta_seconds }

GET  /api/v1/jobs/:id
  → { job_id, status: "done"|"processing"|"failed",
      result_url?, error? }

GET  /api/v1/jobs/:id/result
  → binary file (when status=done)
```

- Back the queue with `jobQueue.js` (already exists — extend it)
- Add optional `callback_url` to POST body for webhook delivery
- TTL-based result cleanup (default 1 hour)

### 2b. Structured Analysis Endpoint

Agents need to understand a document before deciding what to do with it.

```
POST /api/v1/analyze
  body: { markdown: string }
  → {
      headings: [{ level, text, slug }],
      word_count: number,
      character_count: number,
      reading_time_minutes: number,
      code_blocks: [{ language, line_count }],
      diagrams: [{ type, index }],
      tables: number,
      images: number,
      math_blocks: number,
      issues: [{ type, message, line? }],
      suggestions: [{ type, message }]
    }
```

- Thin wrapper over the existing `analyze()` function
- Exposes the existing analyzer report as a clean JSON API
- Useful for agents deciding: "Is this too long? Should I break it? Are there any rendering issues?"

### 2c. Markdown Cleaning Endpoint

AI-generated markdown is predictably messy. Make the cleaner available standalone.

```
POST /api/v1/clean
  body: { markdown: string, opts?: { fixHeadings, normalizeTables, fixCodeFences } }
  → { markdown: string, changes: [{ type, description }] }
```

- Runs the analyzer in clean-only mode
- Returns the cleaned string alongside a diff-friendly change log
- Agents can clean before storing to a knowledge base, or before further processing

### 2d. Content-Hash Caching Layer

Agents frequently re-request the same conversion (e.g., a report regenerated 5 times during a session with minor edits). Caching by SHA-256 of input parameters makes repeated calls instant.

- In-memory LRU cache (configurable size, default 50 entries)
- `Cache-Control` and `ETag` headers on conversion responses
- Optional Redis backend for multi-instance deployments (`INKDOWN_CACHE_BACKEND=redis`)
- Add `X-Cache: HIT|MISS` response header

### 2e. Base64 Response Mode

Binary streaming is awkward inside tool call responses. Add a JSON response mode.

```
POST /api/v1/convert
  Accept: application/json       ← triggers JSON mode
  → {
      filename: "document.pdf",
      mime_type: "application/pdf",
      size_bytes: 42000,
      data: "<base64>",
      report: { ... analyzer report ... }
    }
```

- Controlled by `Accept: application/json` header
- Default remains binary streaming (backward compatible)
- MCP server uses this internally

---

## Phase 3 — Python SDK + LangChain/LlamaIndex Tooling

Most AI orchestration frameworks (LangChain, LlamaIndex, AutoGen, CrewAI, PydanticAI) are Python-first. Without a Python SDK, InkDown is invisible to that ecosystem.

### Python SDK

```python
from inkdown import InkDownClient

client = InkDownClient(url="http://localhost:3000", api_key="...")

# Synchronous
pdf_bytes = client.convert(markdown="# Hello\nWorld", format="pdf", toc=True)

# Async
pdf_bytes = await client.aconvert(markdown="...", format="pdf")

# Analysis only
report = client.analyze(markdown="...")

# Clean without converting
clean_md = client.clean(markdown="...")
```

**LangChain Tool:**
```python
from inkdown.langchain import InkDownTool

tools = [InkDownTool(url="http://localhost:3000")]
# → agent can call convert_to_pdf, convert_to_docx, analyze_document
```

**LlamaIndex Tool:**
```python
from inkdown.llamaindex import InkDownToolSpec
tool_spec = InkDownToolSpec(url="http://localhost:3000")
tools = tool_spec.to_tool_list()
```

### Package

- Published to PyPI as `inkdown-client`
- Mirrors the Node.js SDK published to npm as `inkdown-client`
- Auto-generated from OpenAPI spec (see Phase 4a)

---

## Phase 4 — Output Format Expansion

### 4a. Presentation Slides (Reveal.js / Marp)

Agents write slide content in markdown constantly. No good tool accepts that today.

- New `format=slides` option
- H1 headings become new slides, H2 become sub-slides
- Mermaid diagrams render inline (Reveal.js supports them natively)
- Configurable themes: minimal, corporate, dark, tech
- Output: self-contained HTML or PDF (print mode)

```bash
inkdown --format slides deck.md presentation.html
```

### 4b. Structured JSON / Knowledge Base Format

For RAG pipelines, agents don't want a visual document — they want structured, chunk-ready output.

```
POST /api/v1/convert
  format: "json"
  → {
      sections: [
        {
          id: "heading-slug",
          level: 1,
          title: "Section Title",
          content: "plain text content",
          markdown: "raw markdown",
          tokens_approx: 142,
          diagrams: [...],
          tables: [...]
        }
      ],
      metadata: { ... },
      full_text: "...",
      total_tokens_approx: 4200
    }
```

- Sections are chunked at heading boundaries — exactly what RAG systems need
- `tokens_approx` helps agents decide whether to split further
- Pairs with the caching layer: generate JSON once, convert to PDF/DOCX on demand

### 4c. Email-Safe HTML

Many AI agents send formatted results via email. Standard HTML from InkDown has relative links and embedded CSS that email clients break.

- New `format=email-html` option
- Inlines all CSS
- Converts relative links to absolute
- Removes JavaScript and unsafe tags
- Compatible with major email clients (Outlook, Gmail)

---

## Phase 5 — Smart Template Library

Agents generate predictable document types. A template library removes the burden of formatting decisions from the model entirely.

### Built-in Templates

| Template | Use Case | Sections |
|----------|----------|---------|
| `report` | Research / analysis report | Executive Summary, Background, Findings, Recommendations, Appendix |
| `code-review` | Code review document | Summary, Issues (Critical/Major/Minor), Positives, Suggestions |
| `architecture` | Architecture decision record | Context, Decision, Consequences, Alternatives Considered |
| `meeting-notes` | Meeting minutes | Attendees, Agenda, Discussion, Action Items, Next Steps |
| `api-doc` | API documentation | Overview, Authentication, Endpoints, Examples, Error Codes |
| `proposal` | Project proposal | Problem, Solution, Scope, Timeline, Budget, Risks |

### Usage

```
POST /api/v1/convert
  template: "report"
  markdown: "..."     ← agent fills in content; template provides structure + styling
```

- Templates provide: reference.docx styles, PDF CSS, heading hierarchy, section ordering hints
- Agent only needs to fill in the content — no formatting knowledge required
- Reduces model output variance (fewer hallucinated heading levels, etc.)

---

## Phase 6 — Observability & Production Hardening

As InkDown becomes infrastructure for agent pipelines, it needs production-grade observability.

### Metrics Endpoint

```
GET /api/v1/metrics   (Prometheus format)
```

- `inkdown_conversions_total{format, status}` — counter
- `inkdown_conversion_duration_seconds{format}` — histogram
- `inkdown_queue_depth` — gauge
- `inkdown_cache_hit_ratio` — gauge
- `inkdown_active_browsers` — gauge (Puppeteer instances)

### Structured Logging

- Replace `console.log` with structured JSON logging (pino or similar)
- Log fields: `{ timestamp, request_id, format, input_bytes, output_bytes, duration_ms, status }`
- Configurable log level via `LOG_LEVEL` env var
- Correlation ID (`X-Request-Id`) passed through for distributed tracing

### Rate Limiting

- Per-API-key rate limits (configurable)
- `429 Too Many Requests` with `Retry-After` header
- Separate limits for sync vs async conversions

### OpenAPI Spec

- Auto-generate from route definitions
- Serves at `/api/v1/openapi.json`
- Enables: auto-generated SDKs, Postman collections, API gateway integration, LLM tool discovery

---

## Phase 7 — VSCode Extension Intelligence

### Inline AI Integration

- `inkdown.generateAndConvert` command — opens a prompt input, sends to the configured AI model, converts the response to PDF/DOCX immediately
- "Export AI Response" — right-click a Copilot/Claude inline chat response and export it
- Detect when a new markdown file contains AI-generated content (heuristic) and offer one-click export

### Frontmatter Assistant

- When opening a markdown file with no frontmatter, offer to auto-generate it (title from H1, date=today, reading time estimate)
- "Fill frontmatter with AI" — uses the workspace AI to suggest title, author, keywords from content

### Diff View for Cleaned Markdown

- When running "Clean Markdown", show a diff view before applying changes
- User can accept/reject individual changes

### Batch Export Progress

- Show a real progress notification for batch folder exports (currently silent)
- Per-file status, final summary notification

---

## Phase 8 — Agent-Optimized Deployment

### Official Docker Image on GHCR

```dockerfile
FROM inkdown/inkdown:latest
```

- Pre-bundled with Chromium, Pandoc, Node.js
- Single pull, zero configuration for self-hosting
- Published to `ghcr.io/inkdown/inkdown` on every release

### Agent Sidecar Pattern

InkDown is naturally a sidecar — it runs alongside an agent container and handles document I/O.

- Document the sidecar pattern with compose and k8s examples
- Add a `INKDOWN_SIDECAR_MODE=true` env var that:
  - Reduces memory footprint (no web UI)
  - Keeps Puppeteer warm (persistent browser, no cold start)
  - Enables the high-throughput async job API by default
  - Responds to `SIGTERM` gracefully (flush queue before exit)

### Hosted Service (Optional Future)

- `api.inkdown.dev` — managed cloud endpoint
- Removes the need to self-host for casual agent use
- Per-call pricing or subscription tiers
- Useful for agents that can't run a local server

---

## Quick Wins (Can Ship This Sprint)

These are small changes to the existing codebase that deliver immediate value for AI agent use:

1. **`/api/v1/analyze` endpoint** — wrap the existing `analyze()` in a route (< 20 lines)
2. **`/api/v1/clean` endpoint** — same, wrap the analyzer's clean-only mode
3. **`Accept: application/json` mode** — add base64 response path to `/api/v1/convert` (< 30 lines)
4. **`/api/v1/openapi.json`** — hand-write the OpenAPI 3.1 spec for all current endpoints
5. **`X-Request-Id` pass-through** — add correlation ID to all log lines
6. **Mermaid diagram count in health check** — agents can confirm mermaid is working: `GET /api/v1/health → { ..., capabilities: { mermaid: true, latex: true, grid_tables: true } }`

---

## Priority Order

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 🔴 P0 | MCP Server | Medium | Transformative — native AI tool integration |
| 🔴 P0 | Base64 JSON response mode | Tiny | High — unblocks all agent integrations today |
| 🔴 P0 | `/api/v1/analyze` endpoint | Tiny | High — agents need document intelligence |
| 🟠 P1 | Python SDK + LangChain tool | Medium | High — unlocks entire Python AI ecosystem |
| 🟠 P1 | Async Job API | Medium | High — production agent pipelines need it |
| 🟠 P1 | Content-hash caching | Small | High — dramatic latency improvement for agents |
| 🟡 P2 | Presentation slides format | Medium | Medium — common agent output type |
| 🟡 P2 | Structured JSON / RAG format | Medium | Medium — RAG pipeline integration |
| 🟡 P2 | Template library | Medium | Medium — removes formatting burden from agents |
| 🟢 P3 | OpenAPI spec | Small | Medium — enables auto-generated SDKs |
| 🟢 P3 | Prometheus metrics | Small | Medium — production observability |
| 🟢 P3 | Hosted service | Large | High (long-term) — removes self-hosting friction |

---

## Why InkDown Wins in the AI Era

- **Local-first** — no data leaves the machine; critical for enterprise AI agents
- **No hallucinated formatting** — the model writes markdown, InkDown handles the visual output
- **Token-efficient** — models don't burn context on formatting instructions
- **Polyglot output** — same input → PDF, DOCX, HTML, slides, JSON from one call
- **Runs anywhere** — Docker, k8s sidecar, VSCode, or hosted; same API everywhere
- **Battle-tested rendering** — Puppeteer + Pandoc instead of homegrown OOXML parsers

The documents AI agents produce today are mostly forgettable. InkDown makes them indistinguishable from human-authored work.
