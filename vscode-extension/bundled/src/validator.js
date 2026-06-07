'use strict';

/**
 * validator.js — pre-conversion link & asset validation
 *
 * Scans Markdown content for local image paths and file links,
 * checks file existence when a basePath is available, and returns
 * an array of warning objects.
 *
 * Each warning: { type, message, ref, line }
 *   type: 'missing-image' | 'missing-link' | 'unresolvable-ref'
 */

const fs   = require('fs');
const path = require('path');

function isRemote(ref) {
  return /^https?:\/\//i.test(ref) || ref.startsWith('//');
}

function isAnchor(ref) {
  return ref.startsWith('#');
}

function isDataUri(ref) {
  return ref.startsWith('data:');
}

/**
 * Strips an optional quoted title from a Markdown URL token, e.g.:
 *   ./img/foo.png "My Title"  →  ./img/foo.png
 */
function stripTitle(ref) {
  return ref.split(/\s+/)[0].trim();
}

/**
 * @param {string} markdown  - Raw Markdown content
 * @param {string|null} basePath - Directory of the source file for local path resolution
 * @returns {{ warnings: Array<{type:string, message:string, ref:string, line:number}> }}
 */
function validate(markdown, basePath = null) {
  const warnings = [];
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // ── Images: ![alt](path) ──────────────────────────────
    const imgRe = /!\[[^\]]*\]\(([^)]+)\)/g;
    let m;
    while ((m = imgRe.exec(line)) !== null) {
      const raw = m[1].trim();
      const ref = stripTitle(raw);

      if (isRemote(ref) || isAnchor(ref) || isDataUri(ref)) continue;

      if (!basePath) {
        warnings.push({
          type: 'unresolvable-ref',
          message: `Image "${ref}" is a local path but no source directory is known — it may not resolve at render time.`,
          ref,
          line: lineNum,
        });
      } else {
        const resolved = path.resolve(basePath, ref);
        if (!fs.existsSync(resolved)) {
          warnings.push({
            type: 'missing-image',
            message: `Image not found: "${ref}" (resolved to "${resolved}")`,
            ref,
            line: lineNum,
          });
        }
      }
    }

    // ── File links: [text](path) — skip anchors and URLs ──
    // Negative lookbehind for ! prevents re-matching images
    const lnkRe = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
    while ((m = lnkRe.exec(line)) !== null) {
      const raw = m[1].trim();
      const ref = stripTitle(raw);

      if (isRemote(ref) || isAnchor(ref) || isDataUri(ref)) continue;

      // Only flag references that look like file paths (contain a dot extension or a slash)
      if (!/\.\w{1,10}$/.test(ref) && !ref.includes('/')) continue;

      if (basePath) {
        const resolved = path.resolve(basePath, ref);
        if (!fs.existsSync(resolved)) {
          warnings.push({
            type: 'missing-link',
            message: `Linked file not found: "${ref}" (resolved to "${resolved}")`,
            ref,
            line: lineNum,
          });
        }
      }
    }
  }

  return { warnings };
}

module.exports = { validate };
