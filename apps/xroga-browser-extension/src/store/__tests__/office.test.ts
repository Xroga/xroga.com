import { crc32, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeXml, officeText, OfficeError, readDocx, readXlsx } from '../office';

/** A minimal ZIP writer for fixtures: stored or deflated entries, central directory, end record. */
function zip(files: Record<string, string>, method: 0 | 8 = 8): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc32(raw), 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, directory, end]));
}

const workbook = `<workbook xmlns:r="x"><sheets><sheet name="Leads &amp; Notes" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const rels = `<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="/xl/worksheets/sheet2.xml"/></Relationships>`;
const shared = `<sst><si><t>Name</t></si><si><t>Email</t></si><si><r><t>Ali </t></r><r><t>Khan</t></r></si><si><t>Quote, "x"</t></si></sst>`;
const sheet1 = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>City</t></is></c></row>
<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c><c r="D2" t="b"><v>1</v></c></row>
<row r="4"><c r="A4" t="s"><v>3</v></c><c r="C4"/></row>
</sheetData></worksheet>`;
const xlsx = (method: 0 | 8 = 8) => zip({
  'xl/workbook.xml': workbook, 'xl/_rels/workbook.xml.rels': rels, 'xl/sharedStrings.xml': shared,
  'xl/worksheets/sheet1.xml': sheet1, 'xl/worksheets/sheet2.xml': '<worksheet><sheetData/></worksheet>',
}, method);

describe('reading an .xlsx without a library', () => {
  it('keeps every value in its own column, in order, with gaps and quoting', async () => {
    const sheets = await readXlsx(xlsx());
    expect(sheets.map(s => s.name)).toEqual(['Leads & Notes', 'Empty']);
    expect(sheets[0].csv).toBe('Name,Email,City,\nAli Khan,42,,TRUE\n,,,\n"Quote, ""x""",,,');
    expect(sheets[0].rows).toBe(4);
    expect(sheets[0].columns).toBe(4);
  });

  it('also reads stored (uncompressed) parts and says what it is in the text it returns', async () => {
    const text = await officeText('leads.xlsx', new Blob([xlsx(0) as BlobPart]));
    expect(text).toContain('Spreadsheet «leads.xlsx»: 2 sheet(s)');
    expect(text).toContain('# sheet «Leads & Notes» · 4 rows × 4 columns');
    expect(text).toContain('Ali Khan,42,,TRUE');
  });

  it('refuses a file that is not a ZIP, and a workbook with no sheets', async () => {
    await expect(readXlsx(new Uint8Array(100))).rejects.toBeInstanceOf(OfficeError);
    await expect(readXlsx(zip({ 'xl/workbook.xml': '<workbook><sheets/></workbook>' }))).rejects.toThrow(/No sheets/);
  });

  it('stops a zip bomb: an entry that unpacks past the limit is refused', async () => {
    const bomb = zip({ 'xl/workbook.xml': workbook, 'xl/_rels/workbook.xml.rels': rels, 'xl/worksheets/sheet1.xml': 'A'.repeat(31 * 1024 * 1024) });
    await expect(readXlsx(bomb)).rejects.toThrow(/too large/);
  });
});

describe('reading a .docx without a library', () => {
  const body = `<w:document><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Launch plan</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Fish &amp; </w:t></w:r><w:r><w:t>chips</w:t></w:r><w:r><w:tab/><w:t>end</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>First item</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>City</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Ali</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Lahore</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:t>Done.</w:t></w:r></w:p>
</w:body></w:document>`;

  it('returns headings, text with tabs and entities, list items and tables in document order', async () => {
    const text = await readDocx(zip({ 'word/document.xml': body }));
    expect(text).toBe('# Launch plan\nFish & chips\tend\n- First item\n| Name | City |\n| Ali | Lahore |\n\nDone.');
  });

  it('refuses a ZIP that is not a Word document', async () => {
    await expect(readDocx(zip({ 'other.xml': '<a/>' }))).rejects.toThrow(/Word document/);
  });
});

describe('decodeXml', () => {
  it('decodes named and numeric entities and leaves unknown ones alone', () => {
    expect(decodeXml('a &lt; b &amp;&amp; c &#65;&#x42; &unknown;')).toBe('a < b && c AB &unknown;');
  });
});
