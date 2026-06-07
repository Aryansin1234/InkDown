'use strict';

/**
 * frontmatter.js — YAML frontmatter parsing and variable substitution
 *
 * Supported frontmatter fields (both PDF and DOCX unless noted):
 *   title:          string  — document title (overrides filename / API param)
 *   author:         string  — author name shown on cover page
 *   date:           string  — date shown on cover page
 *   toc:            boolean — include table of contents
 *   autoBreak:      boolean — page break before every H1
 *   pageSize:       string  — A4 (default), A3, A5, Letter, Legal
 *   landscape:      boolean — landscape orientation
 *   theme:          string  — path to custom CSS file (PDF only)
 *   referenceDoc:   string  — path to custom .docx reference template (DOCX only)
 *   numberSections: boolean — numbered headings (DOCX only)
 *
 * Example:
 *   ---
 *   title: "API Reference"
 *   author: "Aryan Singh"
 *   date: "June 2026"
 *   toc: true
 *   pageSize: Letter
 *   ---
 *
 *   # Introduction
 *   Welcome to {{title}}, written by {{author}}.
 */

const matter = require('gray-matter');

/**
 * Parse YAML frontmatter from raw Markdown content.
 *
 * @param {string} markdown - Raw Markdown (may begin with `---` frontmatter block)
 * @returns {{ data: object, content: string }}
 *   data    = parsed YAML object
 *   content = markdown body with frontmatter stripped
 */
function parseFrontmatter(markdown) {
  try {
    const { data, content } = matter(markdown);
    return { data: data || {}, content };
  } catch {
    // Malformed YAML — return original content unchanged
    return { data: {}, content: markdown };
  }
}

/**
 * Replace `{{key}}` placeholders in text with values from a data object.
 * Unmatched placeholders are left as-is.
 *
 * @param {string} text - Source text containing {{key}} tokens
 * @param {object} data - Key/value map (typically frontmatter data)
 * @returns {string}
 */
function substituteVariables(text, data) {
  if (!data || Object.keys(data).length === 0) return text;
  return text.replace(/\{\{([\w.-]+)\}\}/g, (match, key) => {
    const val = data[key];
    return (val !== undefined && val !== null) ? String(val) : match;
  });
}

module.exports = { parseFrontmatter, substituteVariables };
