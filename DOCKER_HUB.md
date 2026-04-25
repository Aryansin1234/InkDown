# InkDown

**Markdown in. Beautiful documents out.**

Convert Markdown to pixel-perfect **PDF** and native **Word DOCX** documents — with a web UI, REST API, and CLI. Everything is bundled in this image: Node 20, Chromium (for PDF), and Pandoc (for DOCX). No installs required on the host.

[![Docker Pulls](https://img.shields.io/docker/pulls/aryansin1234/inkdown?style=flat-square&logo=docker)](https://hub.docker.com/r/aryansin1234/inkdown)
[![Docker Image Size](https://img.shields.io/docker/image-size/aryansin1234/inkdown/latest?style=flat-square)](https://hub.docker.com/r/aryansin1234/inkdown)
[![GitHub](https://img.shields.io/badge/GitHub-Aryansin1234%2FInkDown-181717?style=flat-square&logo=github)](https://github.com/Aryansin1234/InkDown)
[![Node](https://img.shields.io/badge/node-20--slim-339933?style=flat-square&logo=node.js)](https://hub.docker.com/_/node)

---

## Quick Start

```bash
docker run -p 3000:3000 aryansin1234/inkdown:latest
```

Then open **http://localhost:3000** — that's it.

---

## What is InkDown?

InkDown turns raw Markdown into documents you can actually share:

```
  ┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
  │  Markdown   │ ───▶ │   InkDown    │ ───▶ │  PDF  or  DOCX   │
  │  Web · CLI  │      │  REST API    │      │  pixel-perfect   │
  │  REST API   │      │  ⚡ Engine   │      │  ready to share  │
  └─────────────┘      └──────────────┘      └──────────────────┘
```

**Three ways to use it:**
- **Web UI** — drag & drop or paste Markdown, download the document
- **REST API** — call from any language, any platform
- **CLI** — `node src/cli.js input.md output.pdf`

---

## Features

| Feature | Details |
|---------|---------|
| 🎨 Syntax Highlighting | 190+ languages, GitHub-light theme |
| 📊 Smart Tables | Pipe tables, grid tables, multiline tables — all with borders & alignment |
| 📄 Page Break Control | `<!-- pagebreak -->` comments or auto-break before H1 |
| 📑 Table of Contents | Auto-generated TOC with clickable anchor links |
| 🔢 Page Numbers | Footer on every page: *Title — Page X / Y* |
| ⚡ PDF Output | Headless Chrome via Puppeteer, A4 format |
| 📝 DOCX Output | Native Word documents via Pandoc — real heading styles, bordered tables |
| 🔌 REST API v1 | JSON body · file upload · URL fetch |
| 🔒 API Key Auth | Optional `INKDOWN_API_KEYS` env var |
| 🏃 Non-root | Runs as unprivileged `inkdown` user |

---

## Available Tags

| Tag | Description |
|-----|-------------|
| `latest` | Most recent stable build |
| `v1.0.0` | First stable release |

---

## Usage

### One-liner

```bash
docker run -p 3000:3000 aryansin1234/inkdown:latest
```

### Detached (background)

```bash
docker run -d --name inkdown --restart unless-stopped \
  -p 3000:3000 \
  aryansin1234/inkdown:latest
```

### Docker Compose

```yaml
services:
  inkdown:
    image: aryansin1234/inkdown:latest
    container_name: inkdown
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      # - INKDOWN_API_KEYS=your-secret-key
      # - INKDOWN_CORS_ORIGINS=https://myapp.com
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/v1/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

```bash
docker compose up -d
```

### With API Key (production)

```bash
docker run -d --name inkdown --restart unless-stopped \
  -p 3000:3000 \
  -e INKDOWN_API_KEYS=your-secret-key \
  aryansin1234/inkdown:latest
```

Pass the key in requests:
```
X-API-Key: your-secret-key
# or
Authorization: Bearer your-secret-key
```

### Custom Port

```bash
docker run -p 8080:8080 -e PORT=8080 aryansin1234/inkdown:latest
```

### Restrict CORS Origins

```bash
docker run -p 3000:3000 \
  -e INKDOWN_CORS_ORIGINS=https://myapp.com,https://staging.myapp.com \
  aryansin1234/inkdown:latest
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port the server listens on |
| `INKDOWN_API_KEYS` | *(unset — open)* | Comma-separated API keys. When set, `/api/v1/convert` requires authentication. |
| `INKDOWN_CORS_ORIGINS` | `*` | Allowed CORS origins. Restrict in production: `https://myapp.com` |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` | Pre-configured — no need to change |
| `NODE_ENV` | `production` | Node environment |

---

## REST API

Base URL: `http://localhost:3000/api/v1`

### Health Check

```bash
curl http://localhost:3000/api/v1/health
```

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-04-25T00:00:00.000Z",
  "formats": ["pdf", "docx"]
}
```

### Convert Markdown → PDF

```bash
curl -X POST http://localhost:3000/api/v1/convert \
  -H "Content-Type: application/json" \
  -d '{"markdown": "# Hello\n\nWorld!", "format": "pdf"}' \
  --output document.pdf
```

### Convert Markdown → DOCX

```bash
curl -X POST http://localhost:3000/api/v1/convert \
  -H "Content-Type: application/json" \
  -d '{"markdown": "# Hello\n\nWorld!", "format": "docx"}' \
  --output document.docx
```

### Convert with API Key

```bash
curl -X POST http://localhost:3000/api/v1/convert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"markdown": "# Hello\n\nWorld!", "format": "pdf", "toc": true}' \
  --output document.pdf
```

### Upload a File

```bash
curl -X POST http://localhost:3000/api/v1/convert \
  -F "file=@README.md" \
  -F "format=pdf" \
  --output README.pdf
```

### Convert from URL

```bash
curl -X POST http://localhost:3000/api/v1/convert \
  -H "Content-Type: application/json" \
  -d '{"url": "https://raw.githubusercontent.com/Aryansin1234/InkDown/docker-version/README.md", "format": "pdf"}' \
  --output README.pdf
```

### Request Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `markdown` | String | — | Raw Markdown content (use this **or** `url` **or** file upload) |
| `url` | String | — | Public HTTPS URL to a `.md` file |
| `file` | File | — | Multipart `.md` file upload |
| `format` | `pdf` \| `docx` | `pdf` | Output format |
| `title` | String | filename | Document title shown in PDF footer |
| `toc` | Boolean | `false` | Generate a Table of Contents |
| `autoBreak` | Boolean | `false` | Auto page-break before every H1 |

**Response:** Binary file download with `Content-Disposition: attachment`.  
**On error:** `{ "error": "...", "code": "..." }`

---

## What's Inside the Image

| Component | Version | Purpose |
|-----------|---------|---------|
| `node:20-slim` | 20 LTS | JavaScript runtime |
| Chromium | latest (apt) | Headless PDF rendering |
| Pandoc | latest (apt) | Native DOCX generation |
| Puppeteer | `^24` | Chrome automation (uses system Chromium) |
| marked | `^13` | Markdown → HTML parser |
| highlight.js | `^11` | Syntax highlighting (190+ languages) |
| Express | `^5` | HTTP server |
| Non-root user `inkdown` | — | Security best-practice |

> **Base image:** `node:20-slim` (Debian)  
> **Exposed port:** `3000`  
> **Image size:** ~400 MB  
> **Architecture:** `linux/amd64`

---

## Security

- Runs as a **non-root user** (`inkdown`) inside the container
- URL fetching only allows public `http`/`https` addresses — private IPs, loopback, and cloud metadata endpoints (`169.254.x.x`) are blocked
- Image inlining is restricted to files inside the document's own directory — path traversal is blocked
- Set `INKDOWN_API_KEYS` to require authentication on the convert endpoint
- Set `INKDOWN_CORS_ORIGINS` to restrict which browser origins can call the API

---

## Source & Links

- **GitHub:** https://github.com/Aryansin1234/InkDown
- **Docker Hub:** https://hub.docker.com/r/aryansin1234/inkdown
- **API Docs:** https://github.com/Aryansin1234/InkDown/blob/docker-version/API.md
- **Issues:** https://github.com/Aryansin1234/InkDown/issues

---

*Made with ☕ — your documents never leave your machine.*
