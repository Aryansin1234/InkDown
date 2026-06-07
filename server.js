'use strict';

const express      = require('express');
const multer       = require('multer');
const os           = require('os');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const cors         = require('cors');
const { convert, convertToHtml } = require('./src/converter');
const { convertToDocx } = require('./src/docxConverter');
const { rateLimit }     = require('express-rate-limit');
const { validate }      = require('./src/validator');
const { queue }         = require('./src/jobQueue');

const app    = express();
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.md', '.markdown', '.txt', '.text', '.mdown', '.mkd'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype === 'text/markdown' || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only Markdown files are accepted'), false);
    }
  },
});

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

// Serve local mermaid.js from node_modules (used by preview iframe)
app.get('/vendor/mermaid.min.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'));
});
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

// ── Rate Limiting ───────────────────────────────────────────
// Conversion endpoints are throttled to prevent abuse.
// Override the default cap with INKDOWN_RATE_LIMIT env var.
const convertLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: process.env.INKDOWN_RATE_LIMIT ? parseInt(process.env.INKDOWN_RATE_LIMIT, 10) : 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many requests — you have exceeded the conversion rate limit. Please wait and retry.',
    code: 'RATE_LIMITED',
  },
});

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
    // upload.fields() populates req.files (keyed by field name), not req.file
    const uploadedFile = req.files?.file?.[0] ?? req.file ?? null;
    const uploadedCss  = req.files?.cssTheme?.[0] ?? null;

    if (uploadedFile) {
      inputPath = uploadedFile.path;
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
    // Derive base filename early so we can use it as fallback title
    let baseName = 'document';
    if (req.body.title && String(req.body.title).trim()) {
      baseName = String(req.body.title).trim().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    } else if (uploadedFile && uploadedFile.originalname) {
      baseName = path.basename(uploadedFile.originalname, path.extname(uploadedFile.originalname));
    } else {
      // Try to extract the first H1 from the markdown content
      const content = fs.existsSync(inputPath) ? fs.readFileSync(inputPath, 'utf-8') : '';
      const h1Match = content.match(/^#\s+(.+)$/m);
      if (h1Match) baseName = h1Match[1].trim();
    }

    // Sanitize baseName for use in Content-Disposition header (ASCII-safe filename)
    const displayTitle = baseName;
    baseName = baseName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'document';

    const opts = {
      toc:            req.body.toc            === 'true' || req.body.toc            === true,
      autoBreak:      req.body.autoBreak      === 'true' || req.body.autoBreak      === true,
      title:          req.body.title          ? String(req.body.title).trim()          : displayTitle,
      author:         req.body.author         ? String(req.body.author).trim()         : '',
      numberSections: req.body.numberSections === 'true' || req.body.numberSections === true,
      pageSize:       req.body.pageSize       ? String(req.body.pageSize).trim()       : 'A4',
      landscape:      req.body.landscape      === 'true' || req.body.landscape         === true,
      watermark:      req.body.watermark      ? String(req.body.watermark).trim()      : '',
      theme:          uploadedCss
                        ? uploadedCss.path
                        : (req.body.theme ? String(req.body.theme).trim() : ''),
    };
    const format = ((req.body.format || 'pdf') + '').toLowerCase();
    const isDocx = format === 'docx';
    const isHtml = format === 'html';

    // ── Validate (non-blocking) ────────────────────────────
    // Run asset/link validation and attach any warnings as response headers.
    // Warnings never block conversion — they are advisory only.
    try {
      const mdRaw = fs.readFileSync(inputPath, 'utf-8');
      const { warnings: valWarnings } = validate(mdRaw);
      if (valWarnings.length > 0) {
        res.setHeader('X-InkDown-Warning-Count', String(valWarnings.length));
        res.setHeader('X-InkDown-Warnings', JSON.stringify(valWarnings));
      }
    } catch { /* validation is advisory — never fail the conversion */ }

    // ── Convert ────────────────────────────────────────────
    if (isDocx) {
      const mdContent = fs.readFileSync(inputPath, 'utf-8');
      const { buffer } = await convertToDocx(mdContent, {
        title:     opts.title,
        toc:       opts.toc,
        autoBreak: opts.autoBreak,
        author:    opts.author,
        numberSections: opts.numberSections,
        landscape: opts.landscape,
      });

      const docxTmp = tmpFile('.docx');
      fs.writeFileSync(docxTmp, buffer);

      const filename = `${baseName}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.download(docxTmp, filename, (err) => {
        cleanup(docxTmp, ownInput ? inputPath : null);
        if (err && !res.headersSent) {
          res.status(500).json({ error: err.message, code: 'CONVERSION_ERROR' });
        }
      });

    } else if (isHtml) {
      outputPath = tmpFile('.html');
      await convertToHtml(inputPath, outputPath, opts);

      const filename = `${baseName}.html`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);
      const doCleanup = () => cleanup(ownInput ? inputPath : null, outputPath);
      stream.on('end', doCleanup);
      stream.on('error', (err) => {
        doCleanup();
        if (!res.headersSent) res.status(500).json({ error: err.message, code: 'CONVERSION_ERROR' });
      });
      res.on('close', () => { stream.destroy(); doCleanup(); });

    } else {
      outputPath = tmpFile('.pdf');
      await convert(inputPath, outputPath, opts);

      const filename = `${baseName}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);
      const doCleanup = () => cleanup(ownInput ? inputPath : null, outputPath);
      stream.on('end', doCleanup);
      stream.on('error', (err) => {
        doCleanup();
        if (!res.headersSent) res.status(500).json({ error: err.message, code: 'CONVERSION_ERROR' });
      });
      res.on('close', () => { stream.destroy(); doCleanup(); });
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
app.post('/api/convert', convertLimiter, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cssTheme', maxCount: 1 }]), handleConvert);

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
    description: 'Convert Markdown to pixel-perfect PDF, DOCX, HTML or EPUB',
    formats:     ['pdf', 'docx', 'html', 'epub', 'slides'],
    auth:        process.env.INKDOWN_API_KEYS ? 'api-key-required' : 'none',
    endpoints: [
      { method: 'GET',  path: '/api/v1/health',  description: 'Health check' },
      { method: 'GET',  path: '/api/v1/info',    description: 'API information' },
      { method: 'POST', path: '/api/v1/convert', description: 'Convert Markdown to PDF, DOCX, HTML, EPUB, or Slides' },
      { method: 'POST', path: '/api/v1/merge',   description: 'Merge multiple Markdown documents into one output' },
      { method: 'POST', path: '/api/v1/jobs',    description: 'Enqueue an async conversion job' },
      { method: 'GET',  path: '/api/v1/jobs/:id', description: 'Poll async job status; add ?download=1 to get the file' },
      { method: 'GET',  path: '/api/v1/metrics', description: 'Prometheus-compatible metrics' },
    ],
  });
});

// Convert (authenticated + rate-limited)
app.post('/api/v1/convert', convertLimiter, requireApiKey, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cssTheme', maxCount: 1 }]), handleConvert);

// Merge — combine multiple Markdown documents into one output
app.post('/api/v1/merge', convertLimiter, requireApiKey, express.json({ limit: '20mb' }), async (req, res) => {
  let mergedPath = null;
  let outputPath = null;

  try {
    const documents = req.body.documents;
    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        error: '`documents` must be a non-empty array of Markdown strings.',
        code: 'BAD_REQUEST',
      });
    }
    if (documents.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 documents per merge request.', code: 'BAD_REQUEST' });
    }

    const separator = String(req.body.separator || 'pagebreak');
    const sep = separator === 'none' ? '\n\n'
              : separator === 'hr'   ? '\n\n---\n\n'
              : '\n\n<!-- pagebreak -->\n\n'; // default: pagebreak

    const merged = documents.map(d => String(d)).join(sep);
    mergedPath = tmpFile('.md');
    fs.writeFileSync(mergedPath, merged, 'utf-8');

    const format = String(req.body.format || 'pdf').toLowerCase();
    const title  = req.body.title ? String(req.body.title).trim() : 'merged-document';
    const safeName = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'merged-document';
    const opts = {
      toc:      req.body.toc      === 'true' || req.body.toc      === true,
      title,
      author:   req.body.author   ? String(req.body.author).trim() : '',
      pageSize: req.body.pageSize ? String(req.body.pageSize).trim() : 'A4',
      landscape: req.body.landscape === 'true' || req.body.landscape === true,
      watermark: req.body.watermark ? String(req.body.watermark).trim() : '',
      theme:     req.body.theme ? String(req.body.theme).trim() : '',
    };

    if (format === 'docx') {
      const { buffer } = await convertToDocx(merged, opts);
      const tmpDocx = tmpFile('.docx');
      fs.writeFileSync(tmpDocx, buffer);
      const filename = `${safeName}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.download(tmpDocx, filename, (err) => {
        cleanup(tmpDocx, mergedPath);
        if (err && !res.headersSent) res.status(500).json({ error: err.message, code: 'CONVERSION_ERROR' });
      });
    } else if (format === 'html') {
      outputPath = tmpFile('.html');
      await convertToHtml(mergedPath, outputPath, opts);
      const filename = `${safeName}.html`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.download(outputPath, filename, (err) => {
        cleanup(mergedPath, outputPath);
        if (err && !res.headersSent) res.status(500).json({ error: err.message, code: 'CONVERSION_ERROR' });
      });
    } else {
      outputPath = tmpFile('.pdf');
      await convert(mergedPath, outputPath, opts);
      const filename = `${safeName}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);
      const doCleanup = () => cleanup(mergedPath, outputPath);
      stream.on('end', doCleanup);
      stream.on('error', (err) => { doCleanup(); if (!res.headersSent) res.status(500).json({ error: err.message, code: 'CONVERSION_ERROR' }); });
      res.on('close', () => { stream.destroy(); doCleanup(); });
    }
  } catch (err) {
    cleanup(mergedPath, outputPath);
    console.error('Merge error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message || 'Merge failed', code: 'MERGE_ERROR' });
  }
});

// ── Async convert ─────────────────────────────────────────────
// POST /api/v1/jobs  — enqueue a conversion, returns a job ID immediately
app.post('/api/v1/jobs', convertLimiter, requireApiKey, upload.single('file'), async (req, res) => {
  try {
    // Resolve and capture input before the async job runs
    let mdContent;
    if (req.file) {
      mdContent = fs.readFileSync(req.file.path, 'utf-8');
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    } else {
      const md = req.body.markdown || req.body.text;
      if (!md) return res.status(400).json({ error: 'No input provided.', code: 'BAD_REQUEST' });
      mdContent = String(md);
    }

    const format   = String(req.body.format || 'pdf').toLowerCase();
    const title    = req.body.title ? String(req.body.title).trim() : 'document';
    const webhook  = req.body.callbackUrl || req.body.webhook || null;
    const opts = {
      toc:      req.body.toc      === 'true' || req.body.toc      === true,
      autoBreak: req.body.autoBreak === 'true' || req.body.autoBreak === true,
      title,
      author:   req.body.author   ? String(req.body.author).trim()   : '',
      pageSize: req.body.pageSize ? String(req.body.pageSize).trim() : 'A4',
      landscape: req.body.landscape === 'true' || req.body.landscape === true,
      watermark: req.body.watermark ? String(req.body.watermark).trim() : '',
      theme:    req.body.theme    ? String(req.body.theme).trim()    : '',
    };

    // Build the actual conversion function that runs in the background
    const conversionFn = async () => {
      const inputTmp  = path.join(os.tmpdir(), `inkdown-job-${crypto.randomUUID()}.md`);
      const extMap    = { docx: '.docx', html: '.html', epub: '.epub', slides: '.html' };
      const outputTmp = path.join(os.tmpdir(), `inkdown-job-${crypto.randomUUID()}${extMap[format] || '.pdf'}`);
      fs.writeFileSync(inputTmp, mdContent, 'utf-8');
      try {
        if (format === 'docx') {
          const { buffer } = await convertToDocx(mdContent, opts);
          fs.writeFileSync(outputTmp, buffer);
        } else if (format === 'html') {
          await convertToHtml(inputTmp, outputTmp, opts);
        } else if (format === 'epub') {
          const { buffer } = await convertToEpub(mdContent, opts);
          fs.writeFileSync(outputTmp, buffer);
        } else if (format === 'slides') {
          await convertToSlides(inputTmp, outputTmp, opts);
        } else {
          await convert(inputTmp, outputTmp, opts);
        }
        const safeName = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-') || 'document';
        return { filePath: outputTmp, filename: `${safeName}${extMap[format] || '.pdf'}` };
      } finally {
        try { fs.unlinkSync(inputTmp); } catch { /* ignore */ }
      }
    };

    const jobId = queue.enqueue(conversionFn, { format, title, webhook });
    const job   = queue.get(jobId);

    res.status(202).json({
      jobId,
      status:    job.status,
      createdAt: new Date(job.createdAt).toISOString(),
      pollUrl:   `/api/v1/jobs/${jobId}`,
    });
  } catch (err) {
    res.status(err.message.includes('full') ? 503 : 500).json({
      error: err.message,
      code: err.message.includes('full') ? 'QUEUE_FULL' : 'ENQUEUE_ERROR',
    });
  }
});

// GET /api/v1/jobs/:id — poll job status; download result when done
app.get('/api/v1/jobs/:id', requireApiKey, (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found or expired.', code: 'NOT_FOUND' });
  }

  if (job.status === 'done' && req.query.download === '1') {
    if (!job.filePath || !fs.existsSync(job.filePath)) {
      return res.status(410).json({ error: 'Result file has been deleted.', code: 'GONE' });
    }
    const mimeMap = {
      '.pdf':  'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.epub': 'application/epub+zip',
      '.html': 'text/html; charset=utf-8',
    };
    const ext  = path.extname(job.filePath).toLowerCase();
    const mime = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.download(job.filePath, job.filename, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Failed to send file.', code: 'DOWNLOAD_ERROR' });
      }
    });
    return;
  }

  // Status response
  const resp = {
    jobId:     job.id,
    status:    job.status,
    format:    job.format,
    title:     job.title,
    createdAt: new Date(job.createdAt).toISOString(),
  };
  if (job.startedAt)  resp.startedAt  = new Date(job.startedAt).toISOString();
  if (job.finishedAt) resp.finishedAt = new Date(job.finishedAt).toISOString();
  if (job.status === 'done') {
    resp.filename   = job.filename;
    resp.downloadUrl = `/api/v1/jobs/${job.id}?download=1`;
  }
  if (job.status === 'failed') {
    resp.error = job.error;
  }

  res.json(resp);
});

// ── Metrics ───────────────────────────────────────────────────
// GET /api/v1/metrics — Prometheus-compatible plain-text metrics
const _conversionCounters = { total: 0, pdf: 0, docx: 0, html: 0, epub: 0, slides: 0, errors: 0 };
const _startTime = Date.now();

// Monkey-patch handleConvert to count completions
const _origHandleConvert = handleConvert;
async function handleConvertInstrumented(req, res, ...args) {
  const fmt = ((req.body && req.body.format) || 'pdf').toLowerCase();
  try {
    await _origHandleConvert(req, res, ...args);
    _conversionCounters.total++;
    if (_conversionCounters[fmt] !== undefined) _conversionCounters[fmt]++;
  } catch (err) {
    _conversionCounters.errors++;
    throw err;
  }
}

app.get('/api/v1/metrics', requireApiKey, (_req, res) => {
  const uptimeSec = Math.floor((Date.now() - _startTime) / 1000);
  const jobs      = queue.list();
  const jobCounts = { queued: 0, processing: 0, done: 0, failed: 0 };
  for (const j of jobs) { jobCounts[j.status] = (jobCounts[j.status] || 0) + 1; }

  const lines = [
    '# HELP inkdown_uptime_seconds Server uptime in seconds',
    '# TYPE inkdown_uptime_seconds gauge',
    `inkdown_uptime_seconds ${uptimeSec}`,
    '',
    '# HELP inkdown_conversions_total Total synchronous conversions',
    '# TYPE inkdown_conversions_total counter',
    `inkdown_conversions_total{format="pdf"}   ${_conversionCounters.pdf}`,
    `inkdown_conversions_total{format="docx"}  ${_conversionCounters.docx}`,
    `inkdown_conversions_total{format="html"}  ${_conversionCounters.html}`,
    `inkdown_conversions_total{format="epub"}  ${_conversionCounters.epub}`,
    `inkdown_conversions_total{format="slides"} ${_conversionCounters.slides}`,
    `inkdown_conversions_errors_total          ${_conversionCounters.errors}`,
    '',
    '# HELP inkdown_jobs_total Async jobs by status',
    '# TYPE inkdown_jobs_total gauge',
    `inkdown_jobs_total{status="queued"}     ${jobCounts.queued}`,
    `inkdown_jobs_total{status="processing"} ${jobCounts.processing}`,
    `inkdown_jobs_total{status="done"}       ${jobCounts.done}`,
    `inkdown_jobs_total{status="failed"}     ${jobCounts.failed}`,
  ];
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(lines.join('\n') + '\n');
});

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
