# InkDown API Reference

InkDown exposes a REST API so you can convert Markdown to PDF or DOCX programmatically from any language or platform.

## Base URL

```
http://localhost:3000/api/v1
```

Replace `localhost:3000` with the host/port where InkDown is running.

---

## Authentication

Authentication is **optional by default**. To require an API key, set the `INKDOWN_API_KEYS` environment variable to one or more comma-separated keys before starting the server:

```bash
INKDOWN_API_KEYS=mysecretkey123 node server.js
```

Once set, every request to `/api/v1/convert` must include the key using **either** of these headers:

```
X-API-Key: mysecretkey123
```
or
```
Authorization: Bearer mysecretkey123
```

> The legacy `/api/convert` endpoint (used by the web UI) is always open regardless of this setting.

---

## Endpoints

| Method | Path | Auth required | Description |
|--------|------|--------------|-------------|
| `GET` | `/api/v1/health` | No | Health check |
| `GET` | `/api/v1/info` | No | API metadata |
| `POST` | `/api/v1/convert` | If configured | Convert Markdown → PDF / DOCX |

---

## GET /api/v1/health

Returns server status.

**Response**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-04-22T10:00:00.000Z",
  "formats": ["pdf", "docx"]
}
```

---

## GET /api/v1/info

Returns API metadata including configured auth mode and all endpoints.

**Response**

```json
{
  "name": "InkDown API",
  "version": "1.0.0",
  "description": "Convert Markdown to pixel-perfect PDF or DOCX documents",
  "formats": ["pdf", "docx"],
  "auth": "none",
  "endpoints": [
    { "method": "GET",  "path": "/api/v1/health",  "description": "Health check" },
    { "method": "GET",  "path": "/api/v1/info",    "description": "API information" },
    { "method": "POST", "path": "/api/v1/convert", "description": "Convert Markdown to PDF or DOCX" }
  ]
}
```

`auth` is `"none"` when no keys are configured, or `"api-key-required"` otherwise.

---

## POST /api/v1/convert

Converts Markdown content to a PDF or DOCX file. Returns the binary file.

### Input — pick one

| Method | Field | Content-Type |
|--------|-------|-------------|
| JSON body | `markdown` (string) | `application/json` |
| JSON body | `url` (string) | `application/json` |
| Multipart form | `file` (`.md` file) | `multipart/form-data` |

### Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | `"pdf"` \| `"docx"` | `"pdf"` | Output format |
| `title` | string | filename | Document title in PDF footer |
| `toc` | boolean | `false` | Auto-generate Table of Contents |
| `autoBreak` | boolean | `false` | Page break before every H1 |

### Response

On success: binary file stream with appropriate `Content-Type` and `Content-Disposition: attachment; filename="..."` headers.

On error: JSON body `{ "error": "message", "code": "ERROR_CODE" }`.

| Status | Code | Meaning |
|--------|------|---------|
| `200` | — | Success — binary file |
| `400` | `BAD_REQUEST` | Missing/invalid input |
| `400` | `FETCH_ERROR` | Could not fetch the provided URL |
| `401` | `UNAUTHORIZED` | Invalid or missing API key |
| `500` | `CONVERSION_ERROR` | Conversion failed (check server logs) |

---

## Code Examples

### cURL

```bash
# Convert inline markdown to PDF
curl -X POST http://localhost:3000/api/v1/convert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{"markdown": "# Hello\n\nWorld!", "format": "pdf", "title": "My Doc"}' \
  --output document.pdf

# Convert a local .md file
curl -X POST http://localhost:3000/api/v1/convert \
  -H "X-API-Key: your_api_key" \
  -F "file=@README.md" \
  -F "format=pdf" \
  -F "toc=true" \
  --output README.pdf

# Convert from a public URL
curl -X POST http://localhost:3000/api/v1/convert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{"url": "https://raw.githubusercontent.com/user/repo/main/README.md"}' \
  --output README.pdf
```

---

### JavaScript (browser)

```javascript
const response = await fetch('http://localhost:3000/api/v1/convert', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_api_key',
  },
  body: JSON.stringify({
    markdown: '# Hello World\n\nThis is my document.',
    format: 'pdf',
    title: 'My Document',
    toc: true,
  }),
});

if (!response.ok) {
  const err = await response.json();
  throw new Error(err.error);
}

// Trigger browser download
const blob = await response.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'document.pdf';
document.body.appendChild(a);
a.click();
a.remove();
URL.revokeObjectURL(url);
```

---

### Node.js

```javascript
import fs from 'fs';
import fetch from 'node-fetch';

// Send markdown as JSON
const res = await fetch('http://localhost:3000/api/v1/convert', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_api_key',
  },
  body: JSON.stringify({
    markdown: fs.readFileSync('README.md', 'utf-8'),
    format: 'pdf',
    title: 'README',
    toc: true,
  }),
});

if (!res.ok) {
  const err = await res.json();
  throw new Error(err.error);
}

fs.writeFileSync('output.pdf', Buffer.from(await res.arrayBuffer()));
console.log('Saved output.pdf');
```

**File upload via multipart (Node.js)**

```javascript
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const form = new FormData();
form.append('file', fs.createReadStream('README.md'));
form.append('format', 'pdf');
form.append('toc', 'true');

const res = await fetch('http://localhost:3000/api/v1/convert', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your_api_key',
    ...form.getHeaders(),
  },
  body: form,
});

fs.writeFileSync('output.pdf', Buffer.from(await res.arrayBuffer()));
```

---

### Python

```python
import requests

# JSON body
response = requests.post(
    'http://localhost:3000/api/v1/convert',
    headers={'X-API-Key': 'your_api_key'},
    json={
        'markdown': '# Hello World\n\nThis is my document.',
        'format': 'pdf',
        'title': 'My Document',
        'toc': True,
        'autoBreak': False,
    },
)
response.raise_for_status()

with open('document.pdf', 'wb') as f:
    f.write(response.content)
print('Saved document.pdf')
```

**File upload (Python)**

```python
import requests

with open('README.md', 'rb') as f:
    response = requests.post(
        'http://localhost:3000/api/v1/convert',
        headers={'X-API-Key': 'your_api_key'},
        files={'file': ('README.md', f, 'text/markdown')},
        data={'format': 'pdf', 'toc': 'true'},
    )

response.raise_for_status()
with open('output.pdf', 'wb') as f:
    f.write(response.content)
```

---

### PHP

```php
<?php
// JSON body
$ch = curl_init('http://localhost:3000/api/v1/convert');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'X-API-Key: your_api_key',
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'markdown'  => "# Hello World\n\nThis is my document.",
        'format'    => 'pdf',
        'title'     => 'My Document',
        'toc'       => true,
    ]),
]);

$pdf    = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($status === 200) {
    file_put_contents('document.pdf', $pdf);
    echo "Saved document.pdf\n";
} else {
    $err = json_decode($pdf, true);
    echo "Error: " . $err['error'] . "\n";
}
```

---

## Running InkDown as a Service

### Basic

```bash
# Install dependencies
npm install

# Start (defaults to port 3000)
npm start

# Start with API key protection
INKDOWN_API_KEYS=mykey123 npm start

# Custom port + CORS
PORT=8080 INKDOWN_CORS_ORIGINS=https://myapp.com npm start
```

### Docker (example)

```dockerfile
FROM node:20-slim

# Install Puppeteer dependencies + Pandoc
RUN apt-get update && apt-get install -y \
    chromium \
    pandoc \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t inkdown .
docker run -p 3000:3000 -e INKDOWN_API_KEYS=mykey inkdown
```

---

## Generating API Keys

Use `openssl` to generate secure random keys:

```bash
openssl rand -hex 32
# e.g. → a3f8c2e1d4b7960f5a2e8c3d1b4f7e9a2c5d8e1f3a6b9c2e5f8a1d4b7e0c3f6
```

Set multiple keys (useful for different apps or rotation):

```bash
INKDOWN_API_KEYS=key1abc,key2def,key3ghi node server.js
```

---

## CORS Configuration

By default all origins are allowed (`*`). In production, restrict this:

```bash
INKDOWN_CORS_ORIGINS=https://app.example.com,https://staging.example.com node server.js
```
