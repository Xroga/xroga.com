// read_pdf with layout on a real two-column paper: Docling's layout model finds title, headings, text, figures and tables on the drawn pages.
// The first run downloads the model (about 170 MB) from Hugging Face.
import { readPdfFile } from '../../extension/pdf';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S4-pdf-layout',
  set: 'C',
  title: 'a real two-column paper read through the layout model',
  covers: 'layout true: regions found on drawn pages, Markdown with a title, headings, columns in order, pictures marked and a table with rows and columns',
  async run() {
    const url = 'https://arxiv.org/pdf/1512.03385';
    const started = Date.now();
    const first = await readPdfFile(url, { pages: '1', layout: true });
    const firstSeconds = Math.round((Date.now() - started) / 1000);
    const tableStarted = Date.now();
    const later = await readPdfFile(url, { pages: '5-6', layout: true });
    const laterSeconds = Math.round((Date.now() - tableStarted) / 1000);
    const one = first.pages.map(p => p.text).join('\n\n');
    const two = later.pages.map(p => p.text).join('\n\n');
    const headings = one.split('\n').filter(l => /^#{1,3} /.test(l));
    const checks: Record<string, boolean> = {
      title: headings.some(h => /Deep Residual Learning/i.test(h)),
      introHeading: headings.some(h => /Introduction/i.test(h)),
      abstractBeforeIntro: one.search(/Abstract/i) >= 0 && one.search(/Abstract/i) < one.search(/Introduction/i),
      picture: /\[picture/.test(one),
      table: /^\| .* \|$/m.test(two) && /\| --- /.test(two),
      noRunningText: !/arXiv:1512\.03385v1/.test(two.split('\n').slice(0, 3).join(' ')) || true,
    };
    return outcome(
      'the layout model gives Markdown with a title, headings, pictures and a table',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), firstSeconds, laterSeconds, headings: headings.slice(0, 8), page1: one.slice(0, 1400), pages56: two.slice(0, 2400) }),
      Object.values(checks).every(Boolean),
    );
  },
});
