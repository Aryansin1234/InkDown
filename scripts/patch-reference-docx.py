"""Patch reference.docx with proper table styling for InkDown DOCX output."""
import zipfile, os, shutil, tempfile
from xml.etree import ElementTree as ET

ref = 'reference.docx'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

namespaces = [
    ('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'),
    ('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'),
    ('mc', 'http://schemas.openxmlformats.org/markup-compatibility/2006'),
    ('o', 'urn:schemas-microsoft-com:office:office'),
    ('m', 'http://schemas.openxmlformats.org/officeDocument/2006/math'),
    ('v', 'urn:schemas-microsoft-com:vml'),
    ('wp', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'),
    ('w10', 'urn:schemas-microsoft-com:office:word'),
    ('wne', 'http://schemas.microsoft.com/office/word/2006/wordml'),
    ('a', 'http://schemas.openxmlformats.org/drawingml/2006/main'),
    ('w14', 'http://schemas.microsoft.com/office/word/2010/wordml'),
    ('w15', 'http://schemas.microsoft.com/office/word/2012/wordml'),
]
for prefix, uri in namespaces:
    ET.register_namespace(prefix, uri)

tmpdir = tempfile.mkdtemp()
with zipfile.ZipFile(ref, 'r') as z:
    z.extractall(tmpdir)

styles_path = os.path.join(tmpdir, 'word', 'styles.xml')
tree = ET.parse(styles_path)
root = tree.getroot()

for style in root.findall(f'{W}style'):
    sid = style.get(f'{W}styleId')
    if sid == 'Table':
        for old in style.findall(f'{W}tblPr'):
            style.remove(old)

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

        for old in style.findall(f'{W}tblStylePr'):
            style.remove(old)

        # Header row: bold + shading + thicker bottom border
        headerPr = ET.SubElement(style, f'{W}tblStylePr')
        headerPr.set(f'{W}type', 'firstRow')
        hRpr = ET.SubElement(headerPr, f'{W}rPr')
        hB = ET.SubElement(hRpr, f'{W}b')
        hB.set(f'{W}val', '1')
        hTcPr = ET.SubElement(headerPr, f'{W}tcPr')
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

        # Alternating rows
        band1 = ET.SubElement(style, f'{W}tblStylePr')
        band1.set(f'{W}type', 'band1Horz')
        b1TcPr = ET.SubElement(band1, f'{W}tcPr')
        b1Shd = ET.SubElement(b1TcPr, f'{W}shd')
        b1Shd.set(f'{W}val', 'clear')
        b1Shd.set(f'{W}color', 'auto')
        b1Shd.set(f'{W}fill', 'F9FAFB')

        print(f'Patched "Table" style with borders, header shading, alternating rows')
        break

tree.write(styles_path, xml_declaration=True, encoding='UTF-8')

outpath = ref + '.tmp'
with zipfile.ZipFile(outpath, 'w', zipfile.ZIP_DEFLATED) as zout:
    for dirpath, dirs, files in os.walk(tmpdir):
        for f in files:
            fpath = os.path.join(dirpath, f)
            arcname = os.path.relpath(fpath, tmpdir)
            zout.write(fpath, arcname)

shutil.move(outpath, ref)
shutil.rmtree(tmpdir)
print('Done — reference.docx updated')
