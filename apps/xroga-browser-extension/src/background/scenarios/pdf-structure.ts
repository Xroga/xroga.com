// read_pdf with structure on a real two-column paper from the internet: headings in reading order, columns read one after the other.
import { readPdfFile } from '../../extension/pdf';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S4-pdf-structure',
  set: 'C',
  title: 'a real two-column paper is read as Markdown with headings, in column order',
  covers: 'structure true returns headings as # lines, the first column before the second, and the outline when the file has one',
  async run() {
    const url = 'https://arxiv.org/pdf/1512.03385';
    const plain = await readPdfFile(url, { pages: '1' });
    const structured = await readPdfFile(url, { pages: '1-2', structure: true });
    const text = structured.pages.map(p => p.text).join('\n');
    const headings = text.split('\n').filter(l => /^#{1,4} /.test(l));
    const checks: Record<string, boolean> = {
      plainHasText: plain.pages[0]!.text.length > 500,
      hasHeadings: headings.length >= 2,
      introductionIsAHeading: headings.some(h => /Introduction/i.test(h)),
      // Reading order: the abstract (top of the left column) comes before the introduction.
      orderOk: text.search(/Abstract/i) >= 0 && text.search(/Abstract/i) < text.search(/Introduction/i),
    };
    return outcome(
      'headings appear as Markdown lines and the text keeps reading order',
      JSON.stringify({ checks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), headings: headings.slice(0, 12), outline: (structured.outline ?? []).slice(0, 6), sample: text.slice(0, 900) }),
      Object.values(checks).every(Boolean),
    );
  },
});
