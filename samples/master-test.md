# Master Test Document for InkDown

<h2 style="color: #2F80ED;">1. HTML Elements & Colored Headings</h2>

This tests whether the converter strips, honors, or ignores raw HTML.
<p style="color: #27AE60; font-weight: bold;">This paragraph should be green and bold if HTML is supported.</p>

---

## 2. Typography & Formatting

Here is standard text with **Bold**, *Italic*, ***Bold Italic***, and ~~Strikethrough~~ text. 
Here is a test for `inline code` formatting and subscript/superscript if supported: H~2~O, X^2^.

---

## 3. Extended Characters & ASCII/Unicode

* **Symbols:** © ® ™ § ¶ † ‡
* **Currency:** $ € £ ¥ ¢
* **Arrows:** ← ↑ → ↓ ↔ ↕
* **Math:** ∑ ∏ √ ∞ ∫ ≈ ≠ ≤ ≥
* **Emoji:** 😊 🌍 🚀 🎉 📝 🐛
* **ASCII Art:**
```text
  _____       _    _____                       
 |_   _|     | |  |  __ \                      
   | |  _ __ | | _| |  | | _____      ___ __   
   | | | '_ \| |/ / |  | |/ _ \ \ /\ / / '_ \  
  _| |_| | | |   <| |__| | (_) \ V  V /| | | | 
 |_____|_| |_|_|\_\_____/ \___/ \_/\_/ |_| |_| 
```

---

## 4. Blockquotes

> This is a standard blockquote.
> It can span multiple lines.
>
> > This is a nested blockquote to see how the styling handles deep nesting.
> > - List inside a blockquote
> > - Another item

---

## 5. Lists & Task Lists

### Unordered & Ordered
1. First item
2. Second item
   1. Sub-item A
   2. Sub-item B
      - Deeply nested bullet
      - Deeply nested bullet 2
3. Third item

### Task Lists
- [ ] Implement PDF creation
- [x] Implement DOCX creation
- [ ] Validate edge cases

---

## 6. Tables & Alignments

| Left-Aligned | Center Aligned | Right Aligned |
| :---         |     :---:      |          ---: |
| Row 1 Col 1  |  Row 1 Col 2   |   Row 1 Col 3 |
| Apple        | Banana         | Cherry        |
| Long text that might wrap to a new line to test column widths | Short | Medium length |

### Grid Tables

+---------------+---------------+--------------------+
| Fruit         | Price         | Advantages         |
+===============+===============+====================+
| *Apple*       | $1.00         | - Keeps doc away   |
|               |               | - Crunchy          |
+---------------+---------------+--------------------+
| **Banana**    | $0.50         | - Potassium        |
|               |               | - Peelable         |
+---------------+---------------+--------------------+

### Multiline Tables

-------------------------------------------------------------
 Centered   Default           Right Left
  Header    Aligned         Aligned Aligned
----------- ------- --------------- -------------------------
   First    row                12.0 Example of a row that
                                    spans multiple lines.

  Second    row                 5.0 Here's another one. Note
                                    the blank line between
                                    rows.
-------------------------------------------------------------

---

## 7. Code Blocks

Testing multiline code blocks with syntax highlighting (if supported):

```javascript
// A simple Express route
const express = require('express');
const app = express();

app.get('/test', (req, res) => {
    res.json({ message: "Hello, world!" });
});
```

```python
# A simple Python script
def calculate_fibonacci(n):
    if n <= 1: return n
    return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)
```

---

## 8. Images and Links

* **Absolute Link:** [Visit Google](https://www.google.com)
* **Image (External):** 
![Placeholder Image](https://via.placeholder.com/400x150/000000/FFFFFF/?text=Test+Image)

---

## 9. Page Breaks (Page 1 ends here)

The following HTML div should forcefully break the page in PDF output.

<div style="page-break-after: always; break-after: page;"></div>

## 10. Page 2 - Long Text & Text Wrapping

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

*Repeated to force line wrapping and potentially natural page breaks if this document gets very long...*

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

*Repeated enough times to trigger a natural page break...*
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

---

<div style="page-break-after: always; break-after: page;"></div>

## 11. Page 3 - Flowing Tables & Large Elements

When tables or elements possess multiple rows, they should correctly break across pages rather than cut off midway. 

| Item # | Description | Quantity | Price |
|---|---|---|---|
| 1 | Test Item A | 100 | $10.00 |
| 2 | Test Item B | 200 | $20.00 |
| 3 | Test Item C | 300 | $30.00 |
| 4 | Test Item D | 400 | $40.00 |
| 5 | Test Item E | 500 | $50.00 |
| 6 | Test Item F | 600 | $60.00 |
| 7 | Test Item G | 700 | $70.00 |
| 8 | Test Item H | 800 | $80.00 |
| 9 | Test Item I | 900 | $90.00 |
| 10 | Test Item J | 1000 | $100.00 |

Here is a large blockquote meant to stretch down the page layout:

> "The true test of a PDF generator is not just how it renders a basic paragraph, but how gracefully it fails when confronted with overlapping constraints, extreme margins, and page-breaking logic that spans across multiple dimensions of HTML to PDF translations. 
> 
> We must ensure that widow and orphan properties inside the CSS are properly configured and respected by the browser rendering engine, otherwise text that should be kept together will be unceremoniously split across printing mediums."

<br/><br/><br/><br/><br/><br/><br/><br/><br/>
*(Testing massive vertical spacing properties)*

<div style="page-break-after: always; break-after: page;"></div>

## 12. Page 4 - Final Validations

This concludes the master test for multi-page document generation. There should be at minimum 4 distinct pages in the output document. Check the following:
1. Did the 1st page break right before the 'Page 2' section?
2. Did the natural page wrapping on Page 2 push text seamlessly to a third page if it ran long?
3. Did the explicit break before Page 3 (Tables) work correctly?
4. Are headers, footers, or margins cutting off any text?

### End of Master Test Document