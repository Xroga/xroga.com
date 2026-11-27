// make_document on real data in the real extension: rows of a live Wikipedia API answer become a spreadsheet, a Word document and a slide deck made in the service worker (the browser's own
// CompressionStream packs them), each read back with the extension's own readers, and the spreadsheet is saved through Chrome's downloads and found again with the size that was made.
import { bytesToBase64, makeDocumentBytes, normalizeDocument } from '../../agent/document-tool';
import { readDocx, readPptx, readXlsx } from '../../agent/office-read';
import { ZipFile } from '../../agent/zip-read';
import { saveText } from '../../extension/downloads';
import { defineScenario, outcome } from './registry';

const API = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=domestic+cat&srlimit=12&format=json&origin=*';

defineScenario({
  id: 'S6-make-document',
  set: 'C',
  title: 'a real spreadsheet, Word document and slide deck made from live data, read back, and the spreadsheet saved to Downloads',
  covers: 'make_document: xlsx, docx and pptx written on the device, packed with CompressionStream, read back with office-read, saved with chrome.downloads',
  async run() {
    const answer = (await (await fetch(API)).json()) as { query: { search: Array<{ title: string; wordcount: number; size: number; snippet: string }> } };
    const found = answer.query.search;
    const rows = found.map(r => [r.title, r.wordcount, r.size, r.snippet.replace(/<[^>]+>/g, '')]);
    const sheet = normalizeDocument({ format: 'xlsx', title: 'Cat articles', sheets: [{ name: 'Search', columns: ['Title', 'Words', 'Bytes', 'Snippet'], rows, formats: { 1: 'integer', 2: 'integer' } }] });
    const doc = normalizeDocument({ format: 'docx', title: 'Cat articles', markdown: `# Cat articles\n\nThe top ${found.length} results for **domestic cat**.\n\n## Results\n${found.map(r => `- ${r.title}`).join('\n')}\n\n| Title | Words |\n|---|---|\n${found.map(r => `| ${r.title} | ${r.wordcount} |`).join('\n')}` });
    const deck = normalizeDocument({ format: 'pptx', title: 'Cat articles', slides: [{ title: 'Cat articles', subtitle: 'From the Wikipedia search API', background: '1F3864' }, { title: 'Top results', bullets: found.slice(0, 6).map(r => r.title) }, { title: 'Sizes', table: { header: ['Title', 'Words'], rows: found.slice(0, 8).map(r => [r.title, r.wordcount]) } }] });
    if (!sheet.ok || !doc.ok || !deck.ok) throw new Error('the requests were not accepted');
    const xlsx = await makeDocumentBytes(sheet.request);
    const docx = await makeDocumentBytes(doc.request);
    const pptx = await makeDocumentBytes(deck.request);

    const sheets = await readXlsx(new ZipFile(xlsx));
    const text = await readDocx(new ZipFile(docx));
    const slides = await readPptx(new ZipFile(pptx));

    let saved: { name: string; state: string; size: number; error?: string } = { name: '', state: 'skipped', size: 0 };
    if (await chrome.permissions.contains({ permissions: ['downloads'] }).catch(() => false)) {
      const s = await saveText({ filename: 'xroga-test-cats.xlsx', content: bytesToBase64(xlsx), mimeType: sheet.request.format ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : '', base64: true }, false);
      const [item] = await chrome.downloads.search({ id: s.downloadId });
      saved = { name: s.name, state: s.state, size: item?.fileSize ?? 0, error: s.error };
      // the test file is removed from the disk and the list so nothing is left behind
      await chrome.downloads.removeFile(s.downloadId).catch(() => undefined);
      await chrome.downloads.erase({ id: s.downloadId }).catch(() => undefined);
    }
    const first = found[0]!.title;
    const checks: Record<string, boolean> = {
      rows: found.length >= 5,
      xlsx: sheets.length === 1 && sheets[0]!.rows.length === found.length + 1 && sheets[0]!.rows[1]!.cells[0] === first && sheets[0]!.rows[0]!.cells[0] === 'Title',
      docx: text.includes('Cat articles') && text.includes(first) && text.includes('Words'),
      pptx: slides.length === 3 && slides[1]!.paragraphs.join(' ').includes(found[0]!.title) && slides[2]!.tables.join('\n').includes('Title'),
      smaller: xlsx.length < 60000 && xlsx[0] === 0x50 && xlsx[1] === 0x4b,
      saved: saved.state === 'skipped' || (saved.state === 'complete' && Math.abs(saved.size - xlsx.length) < 8),
    };
    return outcome(
      'a real spreadsheet, document and deck are made from live data and read back',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), results: found.length, sizes: [xlsx.length, docx.length, pptx.length], saved, firstSheetRow: sheets[0]?.rows[1]?.cells.slice(0, 3) }),
      Object.values(checks).every(Boolean),
    );
  },
});
