--[[
  docx-table-style.lua — Pandoc Lua filter for DOCX table styling

  Applies "Table Grid" style with borders, header shading, and
  alternating row colors to match the PDF output styling.
]]

function Table(tbl)
  -- Inject raw OpenXML table properties to use the Table Grid style
  local raw_open = pandoc.RawBlock('openxml',
    '<w:tblPr>' ..
    '<w:tblStyle w:val="TableGrid"/>' ..
    '<w:tblW w:w="5000" w:type="pct"/>' ..
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' ..
    '</w:tblPr>')

  return { raw_open, tbl }
end
