// read_file in the real browser: the bytes are fetched by the extension and every container format is opened with the built-in decompression.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { readFileAt } from '../../extension/file-read';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S4-read-file',
  set: 'C',
  title: 'Word, Excel, PowerPoint, EPUB, CSV and zip files are read as text on the device',
  covers: 'docx headings, lists and table; xlsx sheets with real row numbers, dates and a named second sheet; pptx slides in presentation order; epub chapter; csv profile and row paging; a member of a zip; a missing file and a PDF are said plainly',
  async run() {
    const at = (name: string) => `${FIXTURE_ORIGIN}/docs/${name}`;
    const docx = await readFileAt(at('agreement.docx'));
    const xlsx = await readFileAt(at('orders.xlsx'));
    const targets = await readFileAt(at('orders.xlsx'), { sheet: 'Targets' });
    const pptx = await readFileAt(at('deck.pptx'));
    const epub = await readFileAt(at('lighthouse.epub'), { chapter: 2 });
    const csv = await readFileAt(at('sales.csv'), { rows: '5-6' });
    const member = await readFileAt(at('bundle.zip'), { member: 'data/sales.csv' });
    const pdf = await readFileAt(`${FIXTURE_ORIGIN}/sample-report.pdf`);
    const missing = await readFileAt(at('nope.docx')).then(() => 'read', e => String(e));
    const checks: Record<string, boolean> = {
      docxTitle: /# Supplier Agreement 2027/.test(docx.text),
      docxList: /1\. Depot manager/.test(docx.text),
      docxTable: /\| Express \| 19\.80 EUR \| 20 \|/.test(docx.text),
      xlsxRow: /\| 2 \| Acme Corp \| 2026-01-01 \| 1250\.5 \| TRUE \|/.test(xlsx.text),
      xlsxTotal: /\| 7 \| Total \|/.test(xlsx.text),
      targets: /\| 2 \| North \| 5000 \|/.test(targets.text),
      pptxOrder: pptx.text.indexOf('Q4 results') < pptx.text.indexOf('Roadmap review'),
      epub: /951 millibars/.test(epub.text) && !/supply boat/.test(epub.text),
      csvProfile: /units: number, 64 to 152, sum 785/.test(csv.text),
      csvRows: /\| 6 \| North \| 131 \|/.test(csv.text) && !/\| 2 \| North \| 120 \|/.test(csv.text),
      member: /\| 2 \| 1 \| 2 \|/.test(member.text),
      pdf: /read_pdf/.test(pdf.text),
      missing: /404/.test(missing),
    };
    const ok = Object.values(checks).every(Boolean);
    return outcome(
      'every format reads as text with its structure; the missing file and the PDF are named plainly',
      JSON.stringify({ checks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), docx: docx.text.slice(0, 300), xlsx: xlsx.text.slice(0, 500), targets: targets.text.slice(-200), pptx: pptx.text.slice(0, 300), epub: epub.text.slice(0, 200), csv: csv.text.slice(0, 600), member: member.text.slice(0, 200), pdf: pdf.text.slice(0, 100), missing }),
      ok,
    );
  },
});
