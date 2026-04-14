# InkDown — Test Document

This document exercises every feature the converter must handle correctly: long lines, wide tables, images, page breaks, nested lists, and code blocks with syntax highlighting.

---

## 1. Typography & Paragraphs

Regular body text with **bold**, *italic*, ~~strikethrough~~, and `inline code`. Links work too: [Anthropic](https://anthropic.com).

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

> **Blockquote test:** Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. These should render with a grey left border and indented text.

---

## 2. Code Blocks

### JavaScript

```javascript
// A deliberately long line that would overflow on a naive renderer:
const veryLongVariableName = someFunction(argumentOne, argumentTwo, argumentThree, argumentFour, argumentFive);

async function fetchUserData(userId, options = { cache: true, timeout: 5000 }) {
  const response = await fetch(`https://api.example.com/users/${userId}`, {
    headers: { 'Authorization': `Bearer ${process.env.API_KEY}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}
```

### Python

```python
def fibonacci(n: int) -> list[int]:
    """Return the first n Fibonacci numbers."""
    if n <= 0:
        return []
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]

# Very long import line (tests overflow prevention)
from some.deeply.nested.module.path import SomeClass, AnotherClass, YetAnotherClass, FinalClass
```

### Bash

```bash
# Multi-flag command that is intentionally very wide:
curl -s -X POST https://api.example.com/v1/completions -H "Content-Type: application/json" -H "Authorization: Bearer $ANTHROPIC_API_KEY" -d '{"model":"claude-opus-4-6","max_tokens":1024}'
```

---

## 3. Wide Tables

Tables must scale to fit the page and never overflow.

| Feature | Description | Status | Priority | Owner | Notes |
|---------|-------------|--------|----------|-------|-------|
| Overflow fix | Wrap long lines in code blocks with `pre-wrap` | Done | High | @alice | Critical for narrow pages |
| Table scaling | `table-layout: auto` + `word-break: break-word` | Done | High | @bob | Also tested with 8-column tables |
| Image resize | `max-width: 100%; height: auto` | Done | Medium | @carol | Base64 inlining for local files |
| Page breaks | CSS `break-inside: avoid` on pre/table | Done | High | @dave | Also supports manual `<!-- pagebreak -->` |
| Syntax highlighting | highlight.js with GitHub-light theme | Done | Medium | @alice | 190+ languages supported |
| TOC generation | Regex extraction + slug anchors | Done | Low | @bob | Optional via `--toc` flag |

---

## 4. Nested Lists

1. First-level ordered item
   - Nested unordered bullet
   - Another bullet with `inline code`
     - Third level — deeply nested
       - Fourth level (rarely used, but must not overflow)
2. Second-level ordered item
   1. Nested ordered sub-item
   2. Another sub-item with **bold text** and a [link](https://example.com)
3. Third item
   - Mixed nesting is common in real documentation

---

## 5. Inline HTML & Horizontal Rules

You can mix raw HTML into Markdown:

<figure>
  <img src="https://via.placeholder.com/600x200/f6f8fa/24292e?text=Placeholder+Image" alt="Placeholder">
  <figcaption>Figure 1 — Images scale to fit the page and are never clipped</figcaption>
</figure>

---

<!-- pagebreak -->

## 6. After Manual Page Break

The section above contains a `<!-- pagebreak -->` comment. This heading should start on a fresh page.

### Deep-nested heading test

#### Level 4 heading

##### Level 5 heading

###### Level 6 heading (smallest, grey colour)

---

## 7. Long Unbreakable Strings

These are words-that-refuse-to-break and URLs that have no spaces:

`https://www.example.com/very/long/path/that/has/no/natural/break/points/and/will/overflow/a/naive/layout/with/ease`

Plain text version: https://www.example.com/very/long/path/that/has/no/natural/break/points/and/will/overflow/a/naive/layout/with/ease

The `overflow-wrap: break-word` rule must split these at the page boundary.

---

## 8. Blockquotes & Nested Quotes

> First level blockquote. This text is indented with a grey left border.
>
> Still in the first blockquote.
>
> > Second level nested blockquote. Deeply nested quotes should not clip text.

---

## 9. Task Lists (GFM Extension)

- [x] Implement overflow-safe CSS for code blocks
- [x] Add table width constraints
- [x] Inline local images as base64
- [ ] Add cover page support
- [ ] Watermark/draft mode

---

## 10. Conclusion

If this document renders without any text exceeding the page margins, with all code blocks wrapped, tables fitting within the page, and the manual page break landing cleanly before Section 6, the converter is working correctly.
