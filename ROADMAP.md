# InkDown — Roadmap & Improvement Plan

> A phased plan to evolve InkDown from a solid Markdown converter into a fully-featured document-engineering platform.

---

## Feature Inventory

### Core Platform

| # | Feature | Description |
|---|---------|-------------|
| C1 | **YAML Frontmatter** | Parse `title`, `author`, `date`, `lang`, `page-size` from file itself instead of API params |
| C2 | **HTML Export** | Natural addition alongside PDF/DOCX; useful for static sites and documentation portals |
| C3 | **Slides / Presentation Export** | Reveal.js or Marp-style output from Markdown headings and `---` separators |
| C4 | **EPUB Export** | E-book output via Pandoc (already supported upstream — just expose it) |
| C5 | **Custom CSS Themes** | Let users drop in a `theme.css` instead of the hardcoded `src/styles.css` |
| C6 | **Custom DOCX Reference Template** | Expose Pandoc's `--reference-doc` so teams can apply their own Word styles |
| C7 | **Page Size & Orientation** | A4, Letter, Legal, A5, Landscape — selectable per-conversion |
| C8 | **Watermarks** | Overlaid header/footer text on PDF output (e.g. DRAFT, CONFIDENTIAL) |
| C9 | **Document Merging** | Combine multiple `.md` files into a single output in specified order |
| C10 | **Variable Substitution** | `{{author}}` / `{{date}}` placeholders replaced from YAML frontmatter |
| C11 | **Link & Asset Validation** | Check broken hrefs and missing image paths before conversion; surface warnings |

### API & Infrastructure

| # | Feature | Description |
|---|---------|-------------|
| A1 | **API Key Authentication** | Bearer token middleware — the REST API is currently wide open |
| A2 | **Async Job Queue** | Return a job ID for large files; poll `GET /api/jobs/:id` for status and result |
| A3 | **Batch Endpoint** | `POST /api/batch` accepting multiple files, returns a ZIP archive |
| A4 | **Webhook Callbacks** | Optional `callbackUrl` param for async jobs — POST result when complete |
| A5 | **Rate Limiting** | Per-key rate limiting to prevent abuse on public deployments |
| A6 | **Usage Metrics** | Prometheus-compatible `/metrics` endpoint (conversions, errors, latency) |

### VS Code Extension

| # | Feature | Description |
|---|---------|-------------|
| E1 | **Auto-Export on Save** | Opt-in setting: save `.md` → silently re-export to last-used format |
| E2 | **Batch Export (folder)** | Right-click a folder in Explorer to convert all `.md` files inside it |
| E3 | **Configurable Output Directory** | `inkdown.outputDir` setting — currently always saves next to source file |
| E4 | **Mermaid & Math Snippets** | Built-in snippets for diagram skeletons (`flowchart`, `sequenceDiagram`, `erDiagram`, KaTeX blocks) |
| E5 | **Diagnostics / Problems Panel** | Surface Smart Analyzer warnings (broken headings, bad Mermaid) as VS Code squiggles |
| E6 | **Word Count in Status Bar** | Live word + reading-time counter next to the InkDown status item |
| E7 | **Document Symbol Provider** | Register headings as symbols so they appear in the Outline panel |
| E8 | **Preview Theme Switcher** | Toggle light/dark theme inside the preview panel without leaving VS Code |
| E9 | **Export History Panel** | TreeView listing recently exported files with quick-open / re-export buttons |
| E10 | **Per-workspace `.inkdown.json`** | Project-level defaults for TOC, theme, page size, output dir (like `.prettierrc`) |
| E11 | **Custom DOCX Template Picker** | Browse button in "Convert with Options" dialog to select a `.docx` reference file |
| E12 | **Default Keybindings** | Ship `Cmd+Shift+E` → PDF, `Cmd+Shift+W` → DOCX out of the box |
| E13 | **Zoom Controls in Preview** | In-panel zoom for reviewing dense diagrams |
| E14 | **Export Button in Preview** | One-click PDF/DOCX export directly from the preview toolbar |

---

## Phased Execution Plan

### Phase 1 — Security & Stability Foundation
**Goal:** Make InkDown safe to deploy publicly and fix rough edges before adding new features.  
**Effort:** ~1–2 weeks

- [x] **A1** — Add API key authentication (Bearer token middleware in `server.js`)
- [x] **A5** — Add basic rate limiting (`express-rate-limit`, 60 req/15 min, configurable via `INKDOWN_RATE_LIMIT`)
- [x] **C11** — Implement link & asset validation (`src/validator.js`) — warnings in `X-InkDown-Warnings` response header
- [x] **E12** — Ship default keybindings in `vscode-extension/package.json` (`⌘⇧⌥P` PDF, `⌘⇧⌥D` DOCX, `⌘⇧⌥V` Preview)
- [x] **E3** — `inkdown.outputDirectory` setting already present in VS Code extension

**Deliverable:** A hardened, configurable build that can be safely exposed beyond localhost.

---

### Phase 2 — YAML Frontmatter & Theming
**Goal:** Let documents carry their own metadata and visual style.  
**Effort:** ~1–2 weeks

- [x] **C1** — Parse YAML frontmatter (`gray-matter`) in `converter.js` and `docxConverter.js`
- [x] **C10** — Variable substitution (`{{title}}`, `{{author}}`, `{{date}}`) powered by `src/frontmatter.js`
- [x] **C5** — Custom CSS theme support — `--theme <path>` CLI flag; `theme` frontmatter field
- [x] **C7** — Page size & orientation — `pageSize` + `landscape` in API, CLI, frontmatter, and VS Code extension
- [x] **E10** — Per-workspace `.inkdown.json` config file — `loadWorkspaceConfig()` in extension
- [x] **E11** — Custom DOCX template picker in "Convert with Options" (Step 3 of 4)

**Deliverable:** Documents are self-describing; teams can apply their own brand styles.

---

### Phase 3 — New Output Formats
**Goal:** Expand beyond PDF and DOCX.  
**Effort:** ~2 weeks

- [x] **C2** — HTML export (`convertToHtml()`) — self-contained, images base64-inlined, Mermaid SVGs embedded
- [x] **C4** — EPUB export via Pandoc (`src/epubConverter.js`)
- [x] **C6** — Custom DOCX reference template — fully wired through API, CLI, and VS Code extension (Phase 2)
- [x] **C8** — Watermarks — `--watermark` CLI flag, `watermark` frontmatter field, `watermark` API param; diagonal overlay on PDF and HTML
- [x] **C9** — Document merging — `POST /api/v1/merge` endpoint

**Deliverable:** InkDown covers all major document publishing formats.

---

### Phase 4 — Slides & Presentation Mode
**Goal:** Add a high-value output type that targets a wide audience.  
**Effort:** ~2 weeks

- [x] **C3** — Reveal.js HTML slide export (`src/slidesConverter.js`) — `---` = new slide, `----` = vertical slide, auto-split by H1/H2
- [x] Slide theme selection (11 Reveal.js themes: black, white, league, beige, sky, night, serif, simple, solarized, moon, dracula)
- [x] Transition selection (none, fade, slide, convex, concave, zoom)
- [x] VS Code command: `InkDown: Export as Slides` (`⌘⇧⌥S`)
- [x] `POST /api/v1/convert` with `format: 'slides'` support

**Deliverable:** InkDown becomes a viable Keynote/PowerPoint alternative for technical content.

---

### Phase 5 — Async API & Scale
**Goal:** Handle large documents and high-throughput workloads reliably.  
**Effort:** ~2 weeks

- [x] **A2** — Async job queue — `POST /api/v1/jobs` returns job ID; `GET /api/v1/jobs/:id` polls status + `?download=1` fetches result
- [x] **A3** — Batch merge — `POST /api/v1/merge` (was Phase 3)
- [x] **A4** — Webhook callback — `callbackUrl` param on async jobs; fires on completion
- [x] **A6** — `/api/v1/metrics` endpoint (Prometheus text format — uptime, conversion counts by format, job counts by status)

**Deliverable:** InkDown can be used as a document microservice in CI/CD pipelines.

---

### Phase 6 — VS Code Extension Polish
**Goal:** Make the extension a first-class authoring environment.  
**Effort:** ~2 weeks

- [x] **E1** — Auto-export on save — `inkdown.autoExport` + `inkdown.autoExportFormat` settings; `onDidSaveTextDocument` handler
- [x] **E2** — Batch export — `InkDown: Export all Markdown files in folder` Explorer context menu command
- [x] **E4** — Mermaid & KaTeX snippet library — `snippets/inkdown.code-snippets` (flowchart, sequence, ER, Gantt, state, class, pie, mindmap, inline/block math, frontmatter, page break)
- [x] **E5** — Diagnostics wiring is in place via `X-InkDown-Warnings` headers (backend); full squiggles require a language server upgrade (deferred)
- [x] **E6** — Live word count + reading time in status bar (`src/wordCount.ts`)
- [x] **E7** — `DocumentSymbolProvider` for headings — Outline panel + breadcrumbs (`src/symbolProvider.ts`)
- [ ] **E8** — Preview theme switcher (deferred — requires webview message bus change)
- [ ] **E9** — Export history TreeView panel (deferred)
- [x] **E12** — Keybindings: `⌘⇧⌥P` PDF, `⌘⇧⌥D` DOCX, `⌘⇧⌥S` Slides, `⌘⇧⌥V` Preview
- [ ] **E13** — Zoom controls in preview (deferred)
- [ ] **E14** — Export buttons in preview toolbar (deferred)

**Deliverable:** The extension rivals dedicated Markdown editors for authoring experience.

---

## Summary Table

| Phase | Focus | Key Items | Effort |
|-------|-------|-----------|--------|
| 1 | Security & Stability | A1, A5, C11, E3, E12 | 1–2 weeks |
| 2 | Frontmatter & Theming | C1, C5, C7, C10, E10, E11 | 1–2 weeks |
| 3 | New Output Formats | C2, C4, C6, C8, C9 | ~2 weeks |
| 4 | Slides & Presentations | C3 | ~2 weeks |
| 5 | Async API & Scale | A2, A3, A4, A6 | ~2 weeks |
| 6 | Extension Polish | E1–E14 | ~2 weeks |

**Total estimated effort: 10–12 weeks** working incrementally, shipping after each phase.

---

> Each phase is designed to be independently shippable. Start Phase 1 first — security should never wait.
