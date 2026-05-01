"""
Comprehensive reference.docx patcher for InkDown DOCX output.

Generates a fresh reference.docx from Pandoc's defaults, then patches it with:

  1. Table style        — borders (#E1E4E8), header shading, alternating rows
  2. Source Code style  — gray background, Consolas font, border
  3. Verbatim Char      — inline code with gray background + border
  4. TOCHeading style   — bold heading for Table of Contents
  5. Title style        — centered, large, with top spacing (cover page)
  6. Author style       — centered, gray, medium size
  7. Date style         — centered, italic, gray
  8. Default header     — TITLE field + bottom border line
  9. Default footer     — TITLE (left) + Page X / Y (right) + top border
 10. First-page header  — blank (cover page gets no header)
 11. First-page footer  — blank (cover page gets no footer)
 12. Page margins       — A4 matching PDF (20mm top, 18mm L/R, 22mm bottom)
 13. titlePg flag       — different first-page header/footer

Usage:
  python scripts/patch-reference-docx.py
"""

import zipfile, os, shutil, tempfile, subprocess, sys
from xml.etree import ElementTree as ET

# ── Namespace URIs ──────────────────────────────────────────
W_NS       = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R_NS       = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
CT_NS      = 'http://schemas.openxmlformats.org/package/2006/content-types'
PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'

W    = f'{{{W_NS}}}'
R    = f'{{{R_NS}}}'
CT   = f'{{{CT_NS}}}'
PREL = f'{{{PKG_REL_NS}}}'

HEADER_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header'
FOOTER_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer'

# Register XML namespaces so ET preserves prefixes during write
for prefix, uri in [
    ('w',   W_NS),
    ('r',   R_NS),
    ('mc',  'http://schemas.openxmlformats.org/markup-compatibility/2006'),
    ('o',   'urn:schemas-microsoft-com:office:office'),
    ('m',   'http://schemas.openxmlformats.org/officeDocument/2006/math'),
    ('v',   'urn:schemas-microsoft-com:vml'),
    ('wp',  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'),
    ('w10', 'urn:schemas-microsoft-com:office:word'),
    ('wne', 'http://schemas.microsoft.com/office/word/2006/wordml'),
    ('a',   'http://schemas.openxmlformats.org/drawingml/2006/main'),
    ('w14', 'http://schemas.microsoft.com/office/word/2010/wordml'),
    ('w15', 'http://schemas.microsoft.com/office/word/2012/wordml'),
]:
    ET.register_namespace(prefix, uri)

# ── Output path ─────────────────────────────────────────────
ref = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'reference.docx')
ref = os.path.abspath(ref)


# ═══════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════

def find_or_create_style(root, style_id, style_type, name):
    """Find existing style by styleId or create a new one."""
    for s in root.findall(f'{W}style'):
        if s.get(f'{W}styleId') == style_id:
            return s
    s = ET.SubElement(root, f'{W}style')
    s.set(f'{W}type', style_type)
    s.set(f'{W}styleId', style_id)
    n = ET.SubElement(s, f'{W}name')
    n.set(f'{W}val', name)
    return s


def clear_children(el, *tags):
    """Remove child elements whose local tag name is in tags."""
    for child in list(el):
        local = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if local in tags:
            el.remove(child)


def field_runs(field_name, default_text, rpr_xml):
    """Generate OpenXML w:r elements for a Word field code."""
    rpr = f'<w:rPr>{rpr_xml}</w:rPr>'
    return (
        f'<w:r>{rpr}<w:fldChar w:fldCharType="begin"/></w:r>'
        f'<w:r>{rpr}<w:instrText xml:space="preserve"> {field_name} </w:instrText></w:r>'
        f'<w:r>{rpr}<w:fldChar w:fldCharType="separate"/></w:r>'
        f'<w:r>{rpr}<w:t>{default_text}</w:t></w:r>'
        f'<w:r>{rpr}<w:fldChar w:fldCharType="end"/></w:r>'
    )


# ═══════════════════════════════════════════════════════════════
#  STEP 0 — Generate fresh reference.docx from Pandoc defaults
# ═══════════════════════════════════════════════════════════════
print('🔧 Generating fresh reference.docx from Pandoc defaults...')
with open(ref, 'wb') as f:
    result = subprocess.run(
        ['pandoc', '--print-default-data-file', 'reference.docx'],
        stdout=f, stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        print(f'  ✗ Pandoc error: {result.stderr.decode()}')
        sys.exit(1)
print('  ✓ Fresh reference.docx generated')

# ═══════════════════════════════════════════════════════════════
#  STEP 1 — Extract
# ═══════════════════════════════════════════════════════════════
tmpdir = tempfile.mkdtemp()
with zipfile.ZipFile(ref, 'r') as z:
    z.extractall(tmpdir)

word_dir = os.path.join(tmpdir, 'word')

# ═══════════════════════════════════════════════════════════════
#  STEP 2 — Patch styles.xml
# ═══════════════════════════════════════════════════════════════
print('\n📝 Patching styles...')
styles_path = os.path.join(word_dir, 'styles.xml')
tree = ET.parse(styles_path)
root = tree.getroot()

# ── 2a. Table style ────────────────────────────────────────
print('  • Table style (borders, header shading, alternating rows)')
for style in root.findall(f'{W}style'):
    if style.get(f'{W}styleId') != 'Table':
        continue

    clear_children(style, 'tblPr', 'tblStylePr')

    tblPr = ET.SubElement(style, f'{W}tblPr')
    tblW = ET.SubElement(tblPr, f'{W}tblW')
    tblW.set(f'{W}w', '5000')
    tblW.set(f'{W}type', 'pct')

    tblBorders = ET.SubElement(tblPr, f'{W}tblBorders')
    for bname in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
        b = ET.SubElement(tblBorders, f'{W}{bname}')
        b.set(f'{W}val', 'single')
        b.set(f'{W}sz', '4')
        b.set(f'{W}space', '0')
        b.set(f'{W}color', 'E1E4E8')

    tblCellMar = ET.SubElement(tblPr, f'{W}tblCellMar')
    for side in ['top', 'left', 'bottom', 'right']:
        m = ET.SubElement(tblCellMar, f'{W}{side}')
        m.set(f'{W}w', '100')
        m.set(f'{W}type', 'dxa')

    tblLook = ET.SubElement(tblPr, f'{W}tblLook')
    tblLook.set(f'{W}val', '04A0')
    tblLook.set(f'{W}firstRow', '1')
    tblLook.set(f'{W}lastRow', '0')
    tblLook.set(f'{W}firstColumn', '0')
    tblLook.set(f'{W}lastColumn', '0')
    tblLook.set(f'{W}noHBand', '0')
    tblLook.set(f'{W}noVBand', '1')

    # Header row: bold + shading + thicker bottom border
    hPr = ET.SubElement(style, f'{W}tblStylePr')
    hPr.set(f'{W}type', 'firstRow')
    hRpr = ET.SubElement(hPr, f'{W}rPr')
    ET.SubElement(hRpr, f'{W}b').set(f'{W}val', '1')
    hTcPr = ET.SubElement(hPr, f'{W}tcPr')
    hShd = ET.SubElement(hTcPr, f'{W}shd')
    hShd.set(f'{W}val', 'clear')
    hShd.set(f'{W}color', 'auto')
    hShd.set(f'{W}fill', 'F6F8FA')
    hBorders = ET.SubElement(hTcPr, f'{W}tcBorders')
    hBot = ET.SubElement(hBorders, f'{W}bottom')
    hBot.set(f'{W}val', 'single')
    hBot.set(f'{W}sz', '8')
    hBot.set(f'{W}space', '0')
    hBot.set(f'{W}color', 'E1E4E8')

    # Alternating rows (band1)
    b1 = ET.SubElement(style, f'{W}tblStylePr')
    b1.set(f'{W}type', 'band1Horz')
    b1TcPr = ET.SubElement(b1, f'{W}tcPr')
    b1Shd = ET.SubElement(b1TcPr, f'{W}shd')
    b1Shd.set(f'{W}val', 'clear')
    b1Shd.set(f'{W}color', 'auto')
    b1Shd.set(f'{W}fill', 'F9FAFB')
    break

# ── 2b. Source Code style (fenced code blocks) ─────────────
print('  • Source Code style (gray bg, Consolas, border)')
sc = find_or_create_style(root, 'SourceCode', 'paragraph', 'Source Code')
clear_children(sc, 'pPr', 'rPr')

sc_bo = sc.find(f'{W}basedOn')
if sc_bo is None:
    sc_bo = ET.SubElement(sc, f'{W}basedOn')
    sc_bo.set(f'{W}val', 'Normal')

sc_pPr = ET.SubElement(sc, f'{W}pPr')
shd = ET.SubElement(sc_pPr, f'{W}shd')
shd.set(f'{W}val', 'clear')
shd.set(f'{W}color', 'auto')
shd.set(f'{W}fill', 'F6F8FA')
bdr = ET.SubElement(sc_pPr, f'{W}pBdr')
for side in ['top', 'left', 'bottom', 'right']:
    b = ET.SubElement(bdr, f'{W}{side}')
    b.set(f'{W}val', 'single')
    b.set(f'{W}sz', '4')
    b.set(f'{W}space', '4')
    b.set(f'{W}color', 'E1E4E8')
sp = ET.SubElement(sc_pPr, f'{W}spacing')
sp.set(f'{W}before', '120')
sp.set(f'{W}after', '120')
sp.set(f'{W}line', '276')
sp.set(f'{W}lineRule', 'auto')
ET.SubElement(sc_pPr, f'{W}keepLines')

sc_rPr = ET.SubElement(sc, f'{W}rPr')
fonts = ET.SubElement(sc_rPr, f'{W}rFonts')
fonts.set(f'{W}ascii', 'Consolas')
fonts.set(f'{W}hAnsi', 'Consolas')
fonts.set(f'{W}cs', 'Courier New')
ET.SubElement(sc_rPr, f'{W}sz').set(f'{W}val', '20')
ET.SubElement(sc_rPr, f'{W}szCs').set(f'{W}val', '20')

# ── 2c. VerbatimChar style (inline code) ───────────────────
print('  • Verbatim Char style (inline code, gray bg)')
vc = find_or_create_style(root, 'VerbatimChar', 'character', 'Verbatim Char')
clear_children(vc, 'rPr')

vc_rPr = ET.SubElement(vc, f'{W}rPr')
vf = ET.SubElement(vc_rPr, f'{W}rFonts')
vf.set(f'{W}ascii', 'Consolas')
vf.set(f'{W}hAnsi', 'Consolas')
vf.set(f'{W}cs', 'Courier New')
ET.SubElement(vc_rPr, f'{W}sz').set(f'{W}val', '20')
ET.SubElement(vc_rPr, f'{W}szCs').set(f'{W}val', '20')
vs = ET.SubElement(vc_rPr, f'{W}shd')
vs.set(f'{W}val', 'clear')
vs.set(f'{W}color', 'auto')
vs.set(f'{W}fill', 'F6F8FA')
vbdr = ET.SubElement(vc_rPr, f'{W}bdr')
vbdr.set(f'{W}val', 'single')
vbdr.set(f'{W}sz', '4')
vbdr.set(f'{W}space', '1')
vbdr.set(f'{W}color', 'E1E4E8')

# ── 2d. TOCHeading style ───────────────────────────────────
print('  • TOC Heading style')
th = find_or_create_style(root, 'TOCHeading', 'paragraph', 'TOC Heading')
clear_children(th, 'pPr', 'rPr')
th_pPr = ET.SubElement(th, f'{W}pPr')
th_sp = ET.SubElement(th_pPr, f'{W}spacing')
th_sp.set(f'{W}before', '0')
th_sp.set(f'{W}after', '240')
th_rPr = ET.SubElement(th, f'{W}rPr')
ET.SubElement(th_rPr, f'{W}b')
ET.SubElement(th_rPr, f'{W}bCs')
ET.SubElement(th_rPr, f'{W}sz').set(f'{W}val', '32')
ET.SubElement(th_rPr, f'{W}szCs').set(f'{W}val', '32')
ET.SubElement(th_rPr, f'{W}color').set(f'{W}val', '24292E')

# ── 2e. Title style (cover page) ───────────────────────────
print('  • Title style (centered, large, cover page)')
ts = find_or_create_style(root, 'Title', 'paragraph', 'Title')
clear_children(ts, 'pPr', 'rPr')
ts_pPr = ET.SubElement(ts, f'{W}pPr')
ET.SubElement(ts_pPr, f'{W}jc').set(f'{W}val', 'center')
ts_sp = ET.SubElement(ts_pPr, f'{W}spacing')
ts_sp.set(f'{W}before', '4000')
ts_sp.set(f'{W}after', '200')
ts_bdr = ET.SubElement(ts_pPr, f'{W}pBdr')
tb = ET.SubElement(ts_bdr, f'{W}bottom')
tb.set(f'{W}val', 'single')
tb.set(f'{W}sz', '8')
tb.set(f'{W}space', '8')
tb.set(f'{W}color', 'E1E4E8')
ts_rPr = ET.SubElement(ts, f'{W}rPr')
ET.SubElement(ts_rPr, f'{W}b')
ET.SubElement(ts_rPr, f'{W}bCs')
ET.SubElement(ts_rPr, f'{W}sz').set(f'{W}val', '56')
ET.SubElement(ts_rPr, f'{W}szCs').set(f'{W}val', '56')
ET.SubElement(ts_rPr, f'{W}color').set(f'{W}val', '24292E')

# ── 2f. Author style ───────────────────────────────────────
print('  • Author style (centered, gray)')
au = find_or_create_style(root, 'Author', 'paragraph', 'Author')
clear_children(au, 'pPr', 'rPr')
au_pPr = ET.SubElement(au, f'{W}pPr')
ET.SubElement(au_pPr, f'{W}jc').set(f'{W}val', 'center')
au_sp = ET.SubElement(au_pPr, f'{W}spacing')
au_sp.set(f'{W}before', '200')
au_sp.set(f'{W}after', '100')
au_rPr = ET.SubElement(au, f'{W}rPr')
ET.SubElement(au_rPr, f'{W}sz').set(f'{W}val', '28')
ET.SubElement(au_rPr, f'{W}szCs').set(f'{W}val', '28')
ET.SubElement(au_rPr, f'{W}color').set(f'{W}val', '586069')

# ── 2g. Date style ─────────────────────────────────────────
print('  • Date style (centered, italic, gray)')
dt = find_or_create_style(root, 'Date', 'paragraph', 'Date')
clear_children(dt, 'pPr', 'rPr')
dt_pPr = ET.SubElement(dt, f'{W}pPr')
ET.SubElement(dt_pPr, f'{W}jc').set(f'{W}val', 'center')
dt_sp = ET.SubElement(dt_pPr, f'{W}spacing')
dt_sp.set(f'{W}before', '200')
dt_sp.set(f'{W}after', '100')
dt_rPr = ET.SubElement(dt, f'{W}rPr')
ET.SubElement(dt_rPr, f'{W}i')
ET.SubElement(dt_rPr, f'{W}iCs')
ET.SubElement(dt_rPr, f'{W}sz').set(f'{W}val', '24')
ET.SubElement(dt_rPr, f'{W}szCs').set(f'{W}val', '24')
ET.SubElement(dt_rPr, f'{W}color').set(f'{W}val', '6A737D')

# ── 2h. Block Text style (blockquotes) ─────────────────────
print('  • Block Text style (blockquote, left border)')
bq = find_or_create_style(root, 'BlockText', 'paragraph', 'Block Text')
clear_children(bq, 'pPr', 'rPr')
bq_pPr = ET.SubElement(bq, f'{W}pPr')
bq_bdr = ET.SubElement(bq_pPr, f'{W}pBdr')
bl = ET.SubElement(bq_bdr, f'{W}left')
bl.set(f'{W}val', 'single')
bl.set(f'{W}sz', '12')
bl.set(f'{W}space', '8')
bl.set(f'{W}color', 'DFE2E5')
ET.SubElement(bq_pPr, f'{W}ind').set(f'{W}left', '360')
bq_sp = ET.SubElement(bq_pPr, f'{W}spacing')
bq_sp.set(f'{W}before', '120')
bq_sp.set(f'{W}after', '120')
bq_rPr = ET.SubElement(bq, f'{W}rPr')
ET.SubElement(bq_rPr, f'{W}color').set(f'{W}val', '6A737D')

tree.write(styles_path, xml_declaration=True, encoding='UTF-8')
print('  ✓ All styles patched')

# ═══════════════════════════════════════════════════════════════
#  STEP 3 — Create header & footer XML files
# ═══════════════════════════════════════════════════════════════
print('\n📄 Creating header & footer files...')

HF_RPR = '<w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="6A737D"/>'

# Default header — TITLE field + bottom border
print('  • header1.xml (default: document title)')
with open(os.path.join(word_dir, 'header1.xml'), 'w', encoding='utf-8') as f:
    f.write(f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="{W_NS}" xmlns:r="{R_NS}">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Header"/>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="4" w:space="4" w:color="E1E4E8"/>
      </w:pBdr>
      <w:rPr>{HF_RPR}</w:rPr>
    </w:pPr>
    {field_runs('TITLE', 'Document', HF_RPR)}
  </w:p>
</w:hdr>''')

# Default footer — title (left) + Page X / Y (right)
print('  • footer1.xml (default: title + page numbers)')
with open(os.path.join(word_dir, 'footer1.xml'), 'w', encoding='utf-8') as f:
    f.write(f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="{W_NS}" xmlns:r="{R_NS}">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:pBdr>
        <w:top w:val="single" w:sz="4" w:space="4" w:color="E1E4E8"/>
      </w:pBdr>
      <w:tabs>
        <w:tab w:val="clear" w:pos="4680"/>
        <w:tab w:val="right" w:pos="9360"/>
      </w:tabs>
      <w:rPr>{HF_RPR}</w:rPr>
    </w:pPr>
    {field_runs('TITLE', 'Document', HF_RPR)}
    <w:r><w:rPr>{HF_RPR}</w:rPr><w:tab/></w:r>
    {field_runs('PAGE', '1', HF_RPR)}
    <w:r><w:rPr>{HF_RPR}</w:rPr><w:t xml:space="preserve"> / </w:t></w:r>
    {field_runs('NUMPAGES', '1', HF_RPR)}
  </w:p>
</w:ftr>''')

# First-page header (blank — for cover page)
print('  • header2.xml (first page: blank)')
with open(os.path.join(word_dir, 'header2.xml'), 'w', encoding='utf-8') as f:
    f.write(f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="{W_NS}">
  <w:p>
    <w:pPr><w:pStyle w:val="Header"/></w:pPr>
  </w:p>
</w:hdr>''')

# First-page footer (blank — for cover page)
print('  • footer2.xml (first page: blank)')
with open(os.path.join(word_dir, 'footer2.xml'), 'w', encoding='utf-8') as f:
    f.write(f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="{W_NS}">
  <w:p>
    <w:pPr><w:pStyle w:val="Footer"/></w:pPr>
  </w:p>
</w:ftr>''')

print('  ✓ Header & footer files created')

# ═══════════════════════════════════════════════════════════════
#  STEP 4 — Update word/_rels/document.xml.rels
# ═══════════════════════════════════════════════════════════════
print('\n🔗 Updating document relationships...')
rels_path = os.path.join(word_dir, '_rels', 'document.xml.rels')

ET.register_namespace('', PKG_REL_NS)
rels_tree = ET.parse(rels_path)
rels_root = rels_tree.getroot()

# Remove any existing header/footer relationships
for child in list(rels_root):
    rtype = child.get('Type', '')
    if 'header' in rtype or 'footer' in rtype:
        rels_root.remove(child)

# Add our header/footer relationships
for rid, target, rtype in [
    ('rIdHdr1', 'header1.xml', HEADER_TYPE),
    ('rIdHdr2', 'header2.xml', HEADER_TYPE),
    ('rIdFtr1', 'footer1.xml', FOOTER_TYPE),
    ('rIdFtr2', 'footer2.xml', FOOTER_TYPE),
]:
    rel = ET.SubElement(rels_root, f'{PREL}Relationship')
    rel.set('Id', rid)
    rel.set('Type', rtype)
    rel.set('Target', target)

rels_tree.write(rels_path, xml_declaration=True, encoding='UTF-8')
print('  ✓ Relationships updated')

# ═══════════════════════════════════════════════════════════════
#  STEP 5 — Update [Content_Types].xml
# ═══════════════════════════════════════════════════════════════
print('\n📋 Updating [Content_Types].xml...')
ct_path = os.path.join(tmpdir, '[Content_Types].xml')

ET.register_namespace('', CT_NS)
ct_tree = ET.parse(ct_path)
ct_root = ct_tree.getroot()

HDR_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'
FTR_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'

for part_name, content_type in [
    ('/word/header1.xml', HDR_CT),
    ('/word/header2.xml', HDR_CT),
    ('/word/footer1.xml', FTR_CT),
    ('/word/footer2.xml', FTR_CT),
]:
    already = any(child.get('PartName') == part_name for child in ct_root)
    if not already:
        ov = ET.SubElement(ct_root, f'{CT}Override')
        ov.set('PartName', part_name)
        ov.set('ContentType', content_type)

ct_tree.write(ct_path, xml_declaration=True, encoding='UTF-8')
print('  ✓ Content types updated')

# ═══════════════════════════════════════════════════════════════
#  STEP 6 — Update document.xml section properties
# ═══════════════════════════════════════════════════════════════
print('\n📐 Updating section properties (margins, header/footer refs)...')
doc_path = os.path.join(word_dir, 'document.xml')
doc_tree = ET.parse(doc_path)
doc_root = doc_tree.getroot()

body = doc_root.find(f'{W}body')
if body is None:
    print('  ✗ Could not find w:body — skipping')
else:
    sectPr = body.find(f'{W}sectPr')
    if sectPr is None:
        sectPr = ET.SubElement(body, f'{W}sectPr')

    # Remove old header/footer refs, pgSz, pgMar, titlePg
    for tag in ['headerReference', 'footerReference', 'pgSz', 'pgMar', 'titlePg']:
        for el in sectPr.findall(f'{W}{tag}'):
            sectPr.remove(el)

    # Insert header/footer references at the BEGINNING of sectPr
    for i, (tag, hf_type, rid) in enumerate([
        ('headerReference', 'default', 'rIdHdr1'),
        ('headerReference', 'first',   'rIdHdr2'),
        ('footerReference', 'default', 'rIdFtr1'),
        ('footerReference', 'first',   'rIdFtr2'),
    ]):
        el = ET.Element(f'{W}{tag}')
        el.set(f'{W}type', hf_type)
        el.set(f'{R}id', rid)
        sectPr.insert(i, el)

    # A4 page size: 210×297mm → 11906×16838 twips
    pgSz = ET.SubElement(sectPr, f'{W}pgSz')
    pgSz.set(f'{W}w', '11906')
    pgSz.set(f'{W}h', '16838')

    # Margins matching PDF: top 20mm, L/R 18mm, bottom 22mm
    pgMar = ET.SubElement(sectPr, f'{W}pgMar')
    pgMar.set(f'{W}top',    '1134')   # 20mm
    pgMar.set(f'{W}right',  '1020')   # 18mm
    pgMar.set(f'{W}bottom', '1247')   # 22mm
    pgMar.set(f'{W}left',   '1020')   # 18mm
    pgMar.set(f'{W}header', '720')    # 12.7mm
    pgMar.set(f'{W}footer', '720')    # 12.7mm
    pgMar.set(f'{W}gutter', '0')

    # Different first page (blank header/footer on cover page)
    ET.SubElement(sectPr, f'{W}titlePg')

    doc_tree.write(doc_path, xml_declaration=True, encoding='UTF-8')
    print('  ✓ Section properties updated')

# ═══════════════════════════════════════════════════════════════
#  STEP 7 — Re-package into reference.docx
# ═══════════════════════════════════════════════════════════════
print('\n📦 Re-packaging reference.docx...')
outpath = ref + '.tmp'
with zipfile.ZipFile(outpath, 'w', zipfile.ZIP_DEFLATED) as zout:
    for dirpath, dirs, files in os.walk(tmpdir):
        for fname in files:
            fpath = os.path.join(dirpath, fname)
            arcname = os.path.relpath(fpath, tmpdir)
            zout.write(fpath, arcname)

shutil.move(outpath, ref)
shutil.rmtree(tmpdir)

print('\n' + '═' * 60)
print('✅ reference.docx fully patched!')
print('═' * 60)
print('   • Table borders + header shading + alternating rows')
print('   • Code block styling (gray bg, Consolas, border)')
print('   • Inline code styling (gray bg, border)')
print('   • Cover page styles (Title, Author, Date)')
print('   • TOC Heading style')
print('   • Blockquote style (left border)')
print('   • Header (document title + border)')
print('   • Footer (title + Page X / Y + border)')
print('   • Blank first-page header/footer (cover page)')
print('   • A4 margins (20mm top, 18mm sides, 22mm bottom)')
