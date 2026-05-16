--[[
  docx-table-style.lua — Pandoc Lua filter for DOCX table styling

  Applies "Table Grid" style with borders, header shading, and
  alternating row colors to match the PDF output styling.
]]

-- Table styling is handled via reference.docx template.
-- Direct OpenXML injection was removed because inserting a bare
-- <w:tblPr> outside of <w:tbl> produces invalid OOXML that
-- Word for Mac refuses to open.
function Table(tbl)
  return tbl
end
