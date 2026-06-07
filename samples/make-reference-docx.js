#!/usr/bin/env node
/**
 * make-reference-docx.js
 * 
 * Generates a starting reference.docx using Pandoc's built-in template,
 * then explains how to customise it.
 *
 * Usage:
 *   node samples/make-reference-docx.js
 *
 * Requirements:
 *   - Pandoc must be installed (https://pandoc.org/installing.html)
 *     macOS:   brew install pandoc
 *     Windows: winget install JohnMacFarlane.Pandoc
 *     Linux:   sudo apt install pandoc
 */

'use strict';
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const outFile = path.join(__dirname, 'reference.docx');

// ── Check pandoc ─────────────────────────────────────────────
try {
  const ver = execSync('pandoc --version', { encoding: 'utf8' }).split('\n')[0];
  console.log(`Found: ${ver}`);
} catch {
  console.error('❌  pandoc not found. Install it first:');
  console.error('    macOS:   brew install pandoc');
  console.error('    Windows: winget install JohnMacFarlane.Pandoc');
  console.error('    Linux:   sudo apt install pandoc');
  process.exit(1);
}

// ── Extract default reference.docx ───────────────────────────
console.log(`\nGenerating default reference.docx → ${outFile}`);
try {
  execSync(`pandoc --print-default-data-file reference.docx > "${outFile}"`, {
    stdio: ['pipe', 'pipe', 'inherit'],
    shell: true
  });
  const size = fs.statSync(outFile).size;
  console.log(`✅  Created reference.docx (${(size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error('❌  Failed to generate reference.docx:', err.message);
  process.exit(1);
}

// ── Instructions ─────────────────────────────────────────────
console.log(`
─────────────────────────────────────────────
  Next steps: customise samples/reference.docx
─────────────────────────────────────────────

1. Open samples/reference.docx in Microsoft Word or LibreOffice Writer

2. Edit the built-in paragraph styles (do NOT change body text directly):
   • Heading 1   → controls all # headings
   • Heading 2   → controls ## headings
   • Body Text   → default paragraph font, size, spacing
   • Source Code → fenced code blocks
   • Block Text  → blockquotes

3. Useful changes to try:
   • Change font in "Body Text" to Garamond / Calibri / Georgia etc.
   • Set Heading 1 colour to your brand colour
   • Add a header / footer with company name or page numbers

4. Save the file and keep it as .docx (NOT .dotx)

5. Use it in InkDown:
   • Web UI:  select "DOCX" format → provide the reference doc path in options
   • API:     -F "referenceDoc=@samples/reference.docx"
   • VS Code: Convert with Options → Step 3 → Browse for template
   • Config:  { "referenceDoc": "./samples/reference.docx" } in .inkdown.json

Tip: Keep your custom reference.docx in version control alongside your project.
`);
