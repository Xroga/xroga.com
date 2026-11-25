// Writes the document fixtures (docx, xlsx, pptx, epub, csv, zip) the read_file tests and scenario use. Run once; the output is committed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeZip } from './zip-writer.mjs';

const out = new URL('./pages/docs/', import.meta.url);
mkdirSync(out, { recursive: true });
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const P = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const LI = (text, num, lvl = 0) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${num}"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const cellX = t => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const rowX = cs => `<w:tr>${cs.map(cellX).join('')}</w:tr>`;
const docx = makeZip({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${P('Supplier Agreement 2027', 'Title')}${P('Scope of supply', 'Heading1')}${P('The supplier delivers 1,200 pallets per quarter to the Rotterdam depot. Payment is due 45 days after the invoice date.')}${P('Delivery terms', 'Heading2')}${LI('Pallets are delivered between 06:00 and 14:00', 1)}${LI('Damaged goods are credited within 10 days', 1)}${P('Order of escalation', 'Heading2')}${LI('Depot manager', 2)}${LI('Regional director', 2)}${LI('Managing board', 2)}<w:tbl>${rowX(['Tier', 'Price per pallet', 'Minimum'])}${rowX(['Standard', '14.20 EUR', '100'])}${rowX(['Express', '19.80 EUR', '20'])}</w:tbl>${P('Signed in Rotterdam on 3 March 2027.')}</w:body></w:document>`,
  'word/styles.xml': `<?xml version="1.0"?><w:styles ${W}><w:style w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`,
  'word/numbering.xml': `<?xml version="1.0"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
});
writeFileSync(new URL('agreement.docx', out), docx);

const sheet1 = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" s="1"><v>46023</v></c><c r="C2"><v>1250.5</v></c><c r="D2" t="b"><v>1</v></c></row>
<row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3" s="1"><v>46054</v></c><c r="C3"><v>980</v></c><c r="D3" t="b"><v>0</v></c></row>
<row r="4"><c r="A4" t="s"><v>6</v></c><c r="B4" s="1"><v>46082</v></c><c r="C4"><f>C2+C3</f></c><c r="D4" t="b"><v>1</v></c></row>
<row r="7"><c r="A7" t="s"><v>7</v></c><c r="C7"><v>2230.5</v></c></row></sheetData></worksheet>`;
const sheet2 = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Region</t></is></c><c r="B1" t="inlineStr"><is><t>Target</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>North</t></is></c><c r="B2"><v>5000</v></c></row></sheetData></worksheet>`;
const xlsx = makeZip({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Orders" sheetId="1" r:id="rId1"/><sheet name="Targets" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Customer</t></si><si><t>Ordered</t></si><si><t>Amount</t></si><si><t>Paid</t></si><si><t>Acme Corp</t></si><si><t>Bolt &amp; Nut Ltd</t></si><si><r><t>Cargo</t></r><r><t> Partners</t></r></si><si><t>Total</t></si></sst>',
  'xl/styles.xml': '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
  'xl/worksheets/sheet1.xml': sheet1,
  'xl/worksheets/sheet2.xml': sheet2,
});
writeFileSync(new URL('orders.xlsx', out), xlsx);

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const slide = (title, lines) => `<?xml version="1.0"?><p:sld ${A}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody>${lines.map(l => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
const pptx = makeZip({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation ${A}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
  'ppt/_rels/presentation.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
  'ppt/slides/slide1.xml': slide('Roadmap review', ['Moved launch to Q3', 'Hiring plan approved']),
  'ppt/slides/slide2.xml': slide('Q4 results', ['Revenue 4.2M, up 11 percent', 'Churn fell to 2.1 percent']),
});
writeFileSync(new URL('deck.pptx', out), pptx);

const chapter = (h, p) => `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body><h1>${h}</h1><p>${p}</p></body></html>`;
const epub = makeZip({
  mimetype: 'application/epub+zip',
  'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  'OEBPS/content.opf': '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The Lighthouse Log</dc:title><dc:creator>E. Marsh</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',
  'OEBPS/ch1.xhtml': chapter('The Keeper Arrives', 'In March the new keeper reached the rock by supply boat and found the lamp already lit.'),
  'OEBPS/ch2.xhtml': chapter('The Storm of April', 'On 14 April the barometer fell to 951 millibars and the keeper doubled the oil reserve.'),
}, { store: ['mimetype'] });
writeFileSync(new URL('lighthouse.epub', out), epub);

writeFileSync(new URL('sales.csv', out), 'region;units;price;sold_on\nNorth;120;4.5;2027-01-04\nSouth;98;4.5;2027-01-05\nEast;143;4.9;2027-01-05\nWest;77;5.1;2027-01-07\nNorth;131;4.5;2027-01-11\nSouth;64;5.1;2027-01-12\nEast;152;4.9;2027-01-14\n');
writeFileSync(new URL('bundle.zip', out), makeZip({ 'readme.txt': 'Bundle for the audit.\nContact: audit@example.test', 'data/sales.csv': 'a,b\n1,2\n3,4\n' }));
console.log('fixtures written');
