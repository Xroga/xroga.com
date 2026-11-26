// read_pdf with layout on real papers and reports: Docling's layout model finds title, headings, text, figures and tables on the drawn pages, and the Table Transformer
// model finds the rows and columns inside each table. The first run downloads the models (about 200 MB) from Hugging Face.
import { readPdfFile } from '../../extension/pdf';
import { defineScenario, outcome } from './registry';

const RESNET = 'https://arxiv.org/pdf/1512.03385';
const FOMC = 'https://www.federalreserve.gov/monetarypolicy/files/fomcprojtabl20240320.pdf';

defineScenario({
  id: 'S4-pdf-layout',
  set: 'C',
  title: 'a real two-column paper and a real page stored sideways, read through the layout and table models',
  covers: 'layout true: Markdown with a title, headings, columns in order, pictures marked, a table with its rows and columns from the table model, and a page with a 90 degree rotation read as it looks',
  async run() {
    const started = Date.now();
    const first = await readPdfFile(RESNET, { pages: '1', layout: true });
    const firstSeconds = Math.round((Date.now() - started) / 1000);
    const later = await readPdfFile(RESNET, { pages: '5-6', layout: true });
    const rotated = await readPdfFile(FOMC, { pages: '2', layout: true });
    const one = first.pages.map(p => p.text).join('\n\n');
    const two = later.pages.map(p => p.text).join('\n\n');
    const sideways = rotated.pages.map(p => p.text).join('\n\n');
    const headings = one.split('\n').filter(l => /^#{1,3} /.test(l));
    const table1 = two.split('\n').filter(l => /^\| conv\d/.test(l));
    const sidewaysRows = sideways.split('\n').filter(l => /^\|/.test(l));
    const checks: Record<string, boolean> = {
      title: headings.some(h => /Deep Residual Learning/i.test(h)),
      introHeading: headings.some(h => /Introduction/i.test(h)),
      abstractBeforeIntro: one.search(/Abstract/i) >= 0 && one.search(/Abstract/i) < one.search(/Introduction/i),
      picture: /\[picture/.test(one),
      table2: /\| 18 layers \| 27\.94 \| 27\.88 \|/.test(two),
      // Table 1: the table model gives one row per stage with the stage, its output size and each network's blocks in separate cells (the conv1 label lands in the header row: said in the record)
      table1OneRowPerStage: table1.length >= 4 && /\| conv2 x \| 56×56 \|/.test(two) && /\| conv5 x \| 7×7 \|/.test(two),
      sidewaysIsReadable: /GDP/i.test(sideways) && sidewaysRows.length >= 6,
    };
    return outcome(
      'the layout and table models give Markdown with a title, headings, pictures, tables with the right rows, and a sideways page read upright',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), firstSeconds, headings: headings.slice(0, 8), table1, notes: [...(first.notes ?? []), ...(later.notes ?? []), ...(rotated.notes ?? [])], page1: one.slice(0, 600), table2: two.slice(0, 2600), sideways: sideways.slice(0, 1800) }),
      Object.values(checks).every(Boolean),
    );
  },
});

defineScenario({
  id: 'S4-pdf-layout-long',
  set: 'C',
  title: 'layout reading is not capped at a few pages',
  covers: 'layout true over ten pages in one call: every page comes back as Markdown',
  async run() {
    const started = Date.now();
    const result = await readPdfFile(RESNET, { pages: '1-10', layout: true });
    const seconds = Math.round((Date.now() - started) / 1000);
    const withText = result.pages.filter(p => p.text.length > 200).length;
    return outcome(
      'ten pages are read through the layout model in one call',
      JSON.stringify({ pages: result.pages.length, withText, seconds, markdownPages: result.pages.filter(p => /^#{1,3} /m.test(p.text)).length }),
      result.pages.length === 10 && withText >= 9,
    );
  },
});
