'use strict';

/**
 * gridTableParser.js — Pre-processor for Pandoc-style grid & multiline tables
 *
 * Converts grid tables and multiline tables into HTML <table> blocks
 * so that downstream renderers (marked, remark) can handle them.
 */

// ── Inline markdown helper ────────────────────────────────────
function inlineMd(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// ── Grid Table Parser ─────────────────────────────────────────

function parseGridTable(lines) {
  const isSeparator = (line) => /^\+[-=+]+\+$/.test(line.trim());
  const isHeaderSep = (line) => /^\+[=+]+\+$/.test(line.trim());

  if (!isSeparator(lines[0])) return null;

  const firstSep = lines[0];
  const colStarts = [];
  const colEnds = [];

  for (let i = 0; i < firstSep.length; i++) {
    if (firstSep[i] === '+') {
      if (colStarts.length > colEnds.length) colEnds.push(i);
      if (i < firstSep.length - 1) colStarts.push(i + 1);
    }
  }
  if (colStarts.length > colEnds.length) colStarts.pop();

  const numCols = colStarts.length;
  if (numCols === 0) return null;

  const rowBlocks = [];
  let currentBlock = [];
  let headerSepIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (isSeparator(line)) {
      if (currentBlock.length > 0) {
        rowBlocks.push(currentBlock);
        currentBlock = [];
      }
      if (isHeaderSep(line)) headerSepIndex = rowBlocks.length;
    } else if (line.startsWith('|')) {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) rowBlocks.push(currentBlock);
  if (rowBlocks.length === 0) return null;

  function extractCells(block) {
    const cells = [];
    for (let c = 0; c < numCols; c++) {
      const cellLines = [];
      for (const line of block) {
        const start = colStarts[c];
        const end = colEnds[c];
        if (start < line.length) {
          const slice = line.substring(start, Math.min(end, line.length));
          cellLines.push(slice.trim());
        } else {
          cellLines.push('');
        }
      }
      cells.push(cellLines.filter(l => l !== '').join('<br>'));
    }
    return cells;
  }

  const hasHeader = headerSepIndex > 0;
  const headerRows = hasHeader ? rowBlocks.slice(0, headerSepIndex) : [];
  const bodyRows = hasHeader ? rowBlocks.slice(headerSepIndex) : rowBlocks;

  let html = '<table>\n';
  if (hasHeader && headerRows.length > 0) {
    html += '<thead>\n';
    for (const block of headerRows) {
      const cells = extractCells(block);
      html += '<tr>' + cells.map(c => '<th>' + inlineMd(c) + '</th>').join('') + '</tr>\n';
    }
    html += '</thead>\n';
  }
  html += '<tbody>\n';
  for (const block of bodyRows) {
    const cells = extractCells(block);
    html += '<tr>' + cells.map(c => '<td>' + inlineMd(c) + '</td>').join('') + '</tr>\n';
  }
  html += '</tbody>\n</table>';
  return html;
}

// ── Multiline Table Parser ────────────────────────────────────

function parseMultilineTable(lines) {
  const isDashedRule = (line) => /^[\s-]+$/.test(line) && /---/.test(line);
  const hasMultipleDashGroups = (line) => {
    const groups = line.match(/-{3,}/g);
    return groups && groups.length >= 2;
  };

  if (!isDashedRule(lines[0])) return null;

  // Find the column-defining rule (has multiple dash groups separated by spaces)
  let colRuleIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (isDashedRule(lines[i]) && hasMultipleDashGroups(lines[i])) {
      colRuleIdx = i;
      break;
    }
  }
  if (colRuleIdx < 0) return null;

  function getColumnRanges(ruleLine) {
    const ranges = [];
    let inDash = false;
    let start = -1;
    for (let i = 0; i < ruleLine.length; i++) {
      if (ruleLine[i] === '-') {
        if (!inDash) { start = i; inDash = true; }
      } else {
        if (inDash) { ranges.push([start, i]); inDash = false; }
      }
    }
    if (inDash) ranges.push([start, ruleLine.length]);
    return ranges;
  }

  const colRanges = getColumnRanges(lines[colRuleIdx]);
  if (colRanges.length < 2) return null;

  // Extract header text
  const headerLines = lines.slice(1, colRuleIdx);
  const headers = colRanges.map(([start, end]) => {
    const cellLines = [];
    for (const line of headerLines) {
      const slice = line.substring(start, Math.min(end, line.length));
      const trimmed = slice.trim();
      if (trimmed) cellLines.push(trimmed);
    }
    return cellLines.join(' ');
  });

  // Find closing rule
  let endIdx = lines.length;
  for (let i = colRuleIdx + 1; i < lines.length; i++) {
    if (isDashedRule(lines[i])) {
      endIdx = i;
      break;
    }
  }

  // Parse body rows (separated by blank lines)
  const bodyLines = lines.slice(colRuleIdx + 1, endIdx);
  const rowBlocks = [];
  let currentBlock = [];

  for (const line of bodyLines) {
    if (line.trim() === '') {
      if (currentBlock.length > 0) {
        rowBlocks.push(currentBlock);
        currentBlock = [];
      }
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) rowBlocks.push(currentBlock);

  function extractCells(block) {
    return colRanges.map(([start, end]) => {
      const cellLines = [];
      for (const line of block) {
        const slice = line.substring(start, Math.min(end, line.length));
        const trimmed = slice.trim();
        if (trimmed) cellLines.push(trimmed);
      }
      return cellLines.join(' ');
    });
  }

  let html = '<table>\n<thead>\n<tr>';
  html += headers.map(h => '<th>' + inlineMd(h) + '</th>').join('');
  html += '</tr>\n</thead>\n<tbody>\n';
  for (const block of rowBlocks) {
    const cells = extractCells(block);
    html += '<tr>' + cells.map(c => '<td>' + inlineMd(c) + '</td>').join('') + '</tr>\n';
  }
  html += '</tbody>\n</table>';
  return html;
}

// ── Main pre-processor ────────────────────────────────────────

function convertGridTables(markdown) {
  const lines = markdown.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trimEnd();

    // ── Grid table: starts with +---+
    if (/^\+[-=+]+\+$/.test(trimmed)) {
      const tableLines = [trimmed];
      let j = i + 1;
      while (j < lines.length) {
        const tl = lines[j].trimEnd();
        if (/^\+[-=+]+\+$/.test(tl) || /^\|/.test(tl)) {
          tableLines.push(tl);
          if (/^\+[-=+]+\+$/.test(tl)) {
            if (j + 1 >= lines.length || (!/^\|/.test(lines[j + 1].trimEnd()) && !/^\+/.test(lines[j + 1].trimEnd()))) {
              j++;
              break;
            }
          }
          j++;
        } else {
          break;
        }
      }
      const html = parseGridTable(tableLines);
      if (html) {
        result.push('', html, '');
        i = j;
        continue;
      }
    }

    // ── Multiline table: opens with a solid dashed rule (no spaces)
    if (/^-{10,}$/.test(trimmed)) {
      const tableLines = [trimmed];
      let j = i + 1;
      let foundColumnRule = false;
      let foundClosingRule = false;

      while (j < lines.length) {
        const tl = lines[j];
        tableLines.push(tl);
        const tlTrimmed = tl.trimEnd();

        if (!foundColumnRule && /^[\s-]+$/.test(tlTrimmed) && /---\s+---/.test(tlTrimmed)) {
          foundColumnRule = true;
          j++;
          continue;
        }
        if (foundColumnRule && /^-{10,}$/.test(tlTrimmed)) {
          foundClosingRule = true;
          j++;
          break;
        }
        j++;
      }

      if (foundColumnRule && foundClosingRule) {
        const html = parseMultilineTable(tableLines);
        if (html) {
          result.push('', html, '');
          i = j;
          continue;
        }
      }
    }

    result.push(lines[i]);
    i++;
  }

  return result.join('\n');
}

module.exports = { convertGridTables };
