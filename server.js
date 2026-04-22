'use strict';

const express      = require('express');
const multer       = require('multer');
const os           = require('os');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const fetch        = require('node-fetch');
const cors         = require('cors');
const { convert }       = require('./src/converter');
const { convertToDocx } = require('./src/docxConverter');

const app    = express();
const upload = multer({ dest: os.tmpdir() });

// ── CORS ──────────────────────────────────────────────────────
const corsOrigins = process.env.INKDOWN_CORS_ORIGINS
  ? process.env.INKDOWN_CORS_ORIGINS.split(',').map(o => o.trim())
  : '*';

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['Content-Disposition'],
}));

// ── Middleware ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// ── Helpers ───────────────────────────────────────────────────
function tmpFile(ext = '') {
  return path.join(os.tmpdir(), `mdpdf-${crypto.randomUUID()}${ext}`);
}

function cleanup(...files) {
  for (const f of files) {
    if (f && fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

// ── API Key Middleware ────────────────────────────────────────
function requireApiKey(req, res, next) {
  const configured = process.env.INKDOWN_API_KEYS;
  if (!configured) return next(); // no keys set = open access

  const keys = configured.split(',').map(k => k.trim()).filter(Boolean);
  if (!keys.length) return next();

  const provided =
    req.headers['x-api-key'] ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();

  if (!provided || !keys.includes(provided)) {
    return res.status(401).json({
      error: 'Invalid or missing API key. Provide it as X-API-Key header or Authorization: Bearer <key>.',
      code: 'UNAUTHORIZED',
    });
  }
  next();
}

// ── URL Safety Guard (SSRF prevention) ───────────────────────
// Only allow public http/https URLs. Block loopback, private ranges,
// link-local (AWS metadata), and any non-http(s) scheme.
function isSafeUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { return false; }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Loopback
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return false;

  // Link-local / AWS instance metadata
  if (/^169\.254\./.test(host)) return false;

  // RFC-1918 private ranges
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return false;

  return true;
}

// ── Shared Convert Handler ────────────────────────────────────
// Used by both /api/convert (legacy UI) and /api/v1/convert (REST API)
async function handleConvert(req, res) {
  let inputPath  = null;
  let outputPath = null;
  let ownInput   = false;

  try {
    // ── Resolve input ──────────────────────────────────────
    if (req.file) {
      inputPath = req.file.path;
      ownInput  = true;
    } else {
      // Support `markdown` (v1 JSON API) and `text` (legacy multipart UI)
      const mdText = req.body.markdown || req.body.text;
      if (mdText && String(mdText).trim()) {
        inputPath = tmpFile('.md');
        fs.writeFileSync(inputPath, String(mdText), 'utf-8');
        ownInput  = true;
      } else if (req.body.url && String(req.body.url).trim()) {
        const url = String(req.body.url).trim();
        if (!isSafeUrl(url)) {
          return res.status(400).json({
            error: 'URL must use http or https and must not point to a private or loopback address.',
            code: 'BAD_REQUEST',
          });
        }
        let fetched;
        try {
          const resp = await fetch(url, { timeout: 15000 });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
          fetched = await resp.text();
        } catch (err) {
          return res.status(400).json({
            error: `Could not fetch URL: ${err.message}`,
            code: 'FETCH_ERROR',
          });
        }
        inputPath = tmpFile('.md');
        fs.writeFileSync(inputPath, fetched, 'utf-8');
        ownInput  = true;
      } else {
        return res.status(400).json({
          error: 'No input provided. Send `markdown`, `url`, or a multipart file field.',
          code: 'BAD_REQUEST',
        });
      }
    }

    // ── Parse options ──────────────────────────────────────
    const opts = {
      toc:       req.body.toc       === 'true' || req.body.toc       === true,
      autoBreak: req.body.autoBreak === 'true' || req.body.autoBreak === true,
      title:     req.body.title     ? String(req.body.title).trim()  : undefined,
    };
    const format = ((req.body.format || 'pdf') + '').toLowerCase();
    const isDocx = format === 'docx';

    // ── Derive base filename ───────────────────────────────
    let baseName = 'document';
    if (opts.title) {
      baseName = opts.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    } else if (req.file && req.file.originalname) {
      baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    }

    // ── Convert ────────────────────────────────────────────
    if (isDocx) {
      const mdContent = fs.readFileSync(inputPath, 'utf-8');
      const { buffer } = await convertToDocx(mdContent, {
        title:     opts.title || baseName,
        toc:       opts.toc,
        autoBreak: opts.autoBreak,
      });

      const filename = `${baseName}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      cleanup(ownInput ? inputPath : null);
    } else {
      outputPath = tmpFile('.pdf');
      await convert(inputPath, outputPath, opts);

      const filename = `${baseName}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);
      stream.on('end',   () => cleanup(ownInput ? inputPath : null, outputPath));
      stream.on('error', (err) => {
        cleanup(ownInput ? inputPath : null, outputPath);
        if (!res.headersSent) res.status(500).json({ error: err.message, code: 'CONVERSION_ERROR' });
      });
    }

  } catch (err) {
    cleanup(ownInput ? inputPath : null, outputPath);
    console.error('Conversion error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Conversion failed', code: 'CONVERSION_ERROR' });
    }
  }
}

// ── Legacy UI Route (no auth — backward compatible) ───────────
app.post('/api/convert', upload.single('file'), handleConvert);

// ── API v1 Routes ─────────────────────────────────────────────

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({
    status:    'ok',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    formats:   ['pdf', 'docx'],
  });
});

// API info
app.get('/api/v1/info', (_req, res) => {
  res.json({
    name:        'InkDown API',
    version:     '1.0.0',
    description: 'Convert Markdown to pixel-perfect PDF or DOCX documents',
    formats:     ['pdf', 'docx'],
    auth:        process.env.INKDOWN_API_KEYS ? 'api-key-required' : 'none',
    endpoints: [
      { method: 'GET',  path: '/api/v1/health',  description: 'Health check' },
      { method: 'GET',  path: '/api/v1/info',    description: 'API information' },
      { method: 'POST', path: '/api/v1/convert', description: 'Convert Markdown to PDF or DOCX' },
    ],
  });
});

// Convert (authenticated)
app.post('/api/v1/convert', requireApiKey, upload.single('file'), handleConvert);

// ── 404 for unknown /api/* paths ──────────────────────────────
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found', code: 'NOT_FOUND' });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const hasKey = Boolean(process.env.INKDOWN_API_KEYS);
  console.log(`\nInkDown`);
  console.log(`─────────────────────────────────────────────`);
  console.log(`  Web App  : http://localhost:${PORT}`);
  console.log(`  API v1   : http://localhost:${PORT}/api/v1`);
  console.log(`  Auth     : ${hasKey ? 'API key required (INKDOWN_API_KEYS set)' : 'open — set INKDOWN_API_KEYS to restrict'}`);
  console.log(`─────────────────────────────────────────────\n`);
});
