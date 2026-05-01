-- ══════════════════════════════════════════════════════════════
-- docx-enhancements.lua — Pandoc Lua filter for InkDown DOCX
-- ══════════════════════════════════════════════════════════════
--
-- Features:
--   1. Native Word TOC field — users can right-click → Update Field
--      to populate a real, clickable Table of Contents.
--      Activated by metadata:  native-toc: true
--
-- Usage (applied automatically by docxConverter.js):
--   pandoc in.md -t docx --lua-filter=src/docx-enhancements.lua \
--         --metadata=native-toc:true --metadata=toc-depth:4
-- ══════════════════════════════════════════════════════════════

function Pandoc(doc)
  -- ── Guard: only run when native-toc is requested ─────────
  if not doc.meta['native-toc'] then
    return doc
  end

  -- ── Read TOC depth (default 4) ───────────────────────────
  local depth = "4"
  if doc.meta['toc-depth'] then
    depth = pandoc.utils.stringify(doc.meta['toc-depth'])
  end

  -- ── Build the native Word TOC as a Structured Document Tag
  --    This produces a real <w:sdt> TOC field that Word can
  --    update, with clickable hyperlinks to every heading.
  local rpr = '<w:rPr>'
             .. '<w:i/><w:iCs/>'
             .. '<w:color w:val="808080"/>'
             .. '<w:sz w:val="20"/><w:szCs w:val="20"/>'
             .. '</w:rPr>'

  local toc_xml =
    '<w:sdt>'
    .. '<w:sdtPr>'
    ..   '<w:docPartObj>'
    ..     '<w:docPartGallery w:val="Table of Contents"/>'
    ..     '<w:docPartUnique/>'
    ..   '</w:docPartObj>'
    .. '</w:sdtPr>'
    .. '<w:sdtContent>'

    -- Heading
    ..   '<w:p>'
    ..     '<w:pPr>'
    ..       '<w:pStyle w:val="TOCHeading"/>'
    ..       '<w:spacing w:before="0" w:after="240"/>'
    ..     '</w:pPr>'
    ..     '<w:r>'
    ..       '<w:rPr><w:b/><w:bCs/>'
    ..       '<w:sz w:val="32"/><w:szCs w:val="32"/>'
    ..       '<w:color w:val="24292E"/>'
    ..       '</w:rPr>'
    ..       '<w:t>Table of Contents</w:t>'
    ..     '</w:r>'
    ..   '</w:p>'

    -- Separator line
    ..   '<w:p>'
    ..     '<w:pPr>'
    ..       '<w:pBdr>'
    ..         '<w:bottom w:val="single" w:sz="4" w:space="1" w:color="E1E4E8"/>'
    ..       '</w:pBdr>'
    ..       '<w:spacing w:after="200"/>'
    ..     '</w:pPr>'
    ..   '</w:p>'

    -- TOC field code
    ..   '<w:p>'
    ..     '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
    ..     '<w:r>'
    ..       '<w:instrText xml:space="preserve">'
    ..       ' TOC \\o "1-' .. depth .. '" \\h \\z \\u '
    ..       '</w:instrText>'
    ..     '</w:r>'
    ..     '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
    ..     '<w:r>' .. rpr
    ..       '<w:t>Right-click here and select &#x201C;Update Field&#x201D; to populate the Table of Contents.</w:t>'
    ..     '</w:r>'
    ..     '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
    ..   '</w:p>'

    -- Page break after TOC
    ..   '<w:p>'
    ..     '<w:r><w:br w:type="page"/></w:r>'
    ..   '</w:p>'

    .. '</w:sdtContent>'
    .. '</w:sdt>'

  -- ── Find the first heading to insert TOC before it ───────
  --    This way the TOC comes after the cover page (title /
  --    author / date / \newpage) but before document content.
  local insert_at = 1
  for i, block in ipairs(doc.blocks) do
    if block.t == 'Header' then
      insert_at = i
      break
    end
  end

  table.insert(doc.blocks, insert_at, pandoc.RawBlock('openxml', toc_xml))

  -- ── Clean up custom metadata so Pandoc ignores it ────────
  doc.meta['native-toc'] = nil

  return doc
end
