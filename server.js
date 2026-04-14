'use strict';

const express      = require('express');
const multer       = require('multer');
const os           = require('os');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const fetch        = require('node-fetch');
const { convert }       = require('./src/converter');
const { convertToDocx } = require('./src/docxConverter');

const app    = express();
const upload = multer({ dest: os.tmpdir() });

// ── Middleware ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '5mb' }));

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

// ── POST /api/convert ─────────────────────────────────────────
app.post('/api/convert', upload.single('file'), async (req, res) => {
  let inputPath  = null;
  let outputPath = null;
  let ownInput   = false; // did WE create the input temp file (need to delete it)?

  try {
    // ── Resolve input mode ──────────────────────────────────
    if (req.file) {
      // Mode: file upload — multer already wrote it to a temp path
      inputPath = req.file.path;
      ownInput  = true;
    } else if (req.body.text && req.body.text.trim()) {
      // Mode: raw text body
      inputPath = tmpFile('.md');
      fs.writeFileSync(inputPath, req.body.text, 'utf-8');
      ownInput  = true;
    } else if (req.body.url && req.body.url.trim()) {
      // Mode: URL fetch
      const url = req.body.url.trim();
      let mdText;
      try {
        const resp = await fetch(url, { timeout: 15000 });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        mdText = await resp.text();
      } catch (err) {
        return res.status(400).json({ error: `Could not fetch URL: ${err.message}` });
      }
      inputPath = tmpFile('.md');
      fs.writeFileSync(inputPath, mdText, 'utf-8');
      ownInput  = true;
    } else {
      return res.status(400).json({ error: 'No input provided. Send a file, text, or url field.' });
    }

    // ── Parse options ───────────────────────────────────────
    const format = (req.body.format || 'pdf').toLowerCase(); // 'pdf' | 'docx'
    const opts = {
      toc:       req.body.toc       === 'true' || req.body.toc       === true,
      autoBreak: req.body.autoBreak === 'true' || req.body.autoBreak === true,
      title:     req.body.title     ? String(req.body.title).trim()  : undefined,
    };

    // ── Derive base filename ─────────────────────────────────
    let baseName = 'document';
    if (opts.title) {
      baseName = opts.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    } else if (req.file && req.file.originalname) {
      baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    }

    if (format === 'docx') {
      // ── DOCX path — uses programmatic docx package (Word-compatible) ──
      const markdown    = fs.readFileSync(inputPath, 'utf-8');
      const docxBuffer  = await convertToDocx(markdown, {
        title:     opts.title || baseName,
        autoBreak: opts.autoBreak,
      });

      const filename = `${baseName}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', docxBuffer.length);
      cleanup(ownInput ? inputPath : null);
      return res.end(docxBuffer);
    }

    // ── PDF path ─────────────────────────────────────────────
    outputPath = tmpFile('.pdf');
    await convert(inputPath, outputPath, opts);

    const filename = `${baseName}.pdf`;

    // ── Stream PDF to client ─────────────────────────────────
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => cleanup(ownInput ? inputPath : null, outputPath));
    stream.on('error', (err) => {
      cleanup(ownInput ? inputPath : null, outputPath);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

  } catch (err) {
    cleanup(ownInput ? inputPath : null, outputPath);
    console.error('Conversion error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Conversion failed' });
    }
  }
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nInkDown`);
  console.log(`─────────────────────────────────────`);
  console.log(`  Server  : http://localhost:${PORT}`);
  console.log(`  Mode    : file upload + text + URL`);
  console.log(`─────────────────────────────────────\n`);
});
