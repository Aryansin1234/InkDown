'use strict';

/**
 * jobQueue.js — In-memory async job queue for long-running conversions
 *
 * Jobs transition through these states:
 *   queued → processing → done | failed
 *
 * Callers:
 *   1. Enqueue a job:  queue.enqueue(fn, meta)  → jobId
 *   2. Poll status:    queue.get(jobId)          → JobRecord
 *   3. Results expire: configurable TTL (default 30 min)
 *
 * This is a single-process in-memory queue suitable for one InkDown instance.
 * For multi-instance deployments, swap the store for Redis + Bull/BullMQ.
 */

const crypto = require('crypto');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');

const JOB_TTL_MS    = (process.env.INKDOWN_JOB_TTL_MIN  ? parseInt(process.env.INKDOWN_JOB_TTL_MIN, 10)  : 30) * 60 * 1000;
const MAX_JOBS      =  process.env.INKDOWN_MAX_JOBS      ? parseInt(process.env.INKDOWN_MAX_JOBS, 10)      : 500;
const MAX_CONCURRENT = process.env.INKDOWN_MAX_CONCURRENT ? parseInt(process.env.INKDOWN_MAX_CONCURRENT, 10) : 3;

class JobQueue {
  constructor() {
    /** @type {Map<string, JobRecord>} */
    this._jobs = new Map();
    this._running = 0;
    /** @type {Array<{id:string, fn:Function}>} */
    this._pending = [];

    // Periodic cleanup of expired jobs
    setInterval(() => this._purge(), 5 * 60 * 1000).unref();
  }

  /**
   * Add a conversion job to the queue.
   *
   * @param {() => Promise<{filePath: string}>} fn - Async function that performs the conversion
   *   and returns { filePath } of the output file.
   * @param {object} meta - { format, title } stored with the job for display purposes
   * @returns {string} jobId
   */
  enqueue(fn, meta = {}) {
    if (this._jobs.size >= MAX_JOBS) {
      throw new Error('Job queue is full. Please wait for existing jobs to complete.');
    }

    const id = crypto.randomUUID();
    const record = {
      id,
      status:    'queued',
      format:    meta.format    || 'pdf',
      title:     meta.title     || 'document',
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      filePath:  null,
      filename:  null,
      error:     null,
      webhook:   meta.webhook   || null,
    };

    this._jobs.set(id, record);
    this._pending.push({ id, fn });
    this._drain();
    return id;
  }

  /**
   * Retrieve a job record by ID.
   * @param {string} id
   * @returns {JobRecord|null}
   */
  get(id) {
    return this._jobs.get(id) ?? null;
  }

  /**
   * List all jobs (for admin/debug).
   */
  list() {
    return [...this._jobs.values()];
  }

  // ── Internal ──────────────────────────────────────────────

  _drain() {
    while (this._running < MAX_CONCURRENT && this._pending.length > 0) {
      const { id, fn } = this._pending.shift();
      const record = this._jobs.get(id);
      if (!record) continue;
      this._running++;
      record.status    = 'processing';
      record.startedAt = Date.now();

      fn()
        .then(({ filePath, filename }) => {
          record.status     = 'done';
          record.filePath   = filePath;
          record.filename   = filename || path.basename(filePath);
          record.finishedAt = Date.now();
          this._fireWebhook(record);
        })
        .catch((err) => {
          record.status     = 'failed';
          record.error      = err.message || String(err);
          record.finishedAt = Date.now();
          this._fireWebhook(record);
          // Clean up temp output file if it exists
          if (record.filePath && fs.existsSync(record.filePath)) {
            try { fs.unlinkSync(record.filePath); } catch { /* ignore */ }
          }
        })
        .finally(() => {
          this._running--;
          this._drain();
        });
    }
  }

  async _fireWebhook(record) {
    if (!record.webhook) return;
    try {
      const url = record.webhook;
      // Simple validation — only fire http/https webhooks
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      // Non-blocking POST
      const body = JSON.stringify({
        jobId:     record.id,
        status:    record.status,
        format:    record.format,
        title:     record.title,
        filename:  record.filename,
        error:     record.error,
        finishedAt: record.finishedAt,
      });
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10000),
      }).catch(() => { /* webhook failures are non-fatal */ });
    } catch { /* ignore invalid webhook URLs */ }
  }

  _purge() {
    const now = Date.now();
    for (const [id, record] of this._jobs) {
      if (record.status === 'done' || record.status === 'failed') {
        if (now - record.finishedAt > JOB_TTL_MS) {
          // Delete output file before removing the record
          if (record.filePath && fs.existsSync(record.filePath)) {
            try { fs.unlinkSync(record.filePath); } catch { /* ignore */ }
          }
          this._jobs.delete(id);
        }
      }
    }
  }
}

// Singleton — one queue per process
const queue = new JobQueue();

module.exports = { queue };
