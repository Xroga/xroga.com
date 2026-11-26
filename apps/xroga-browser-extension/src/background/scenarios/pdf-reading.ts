// A PDF is read on the device: its text page by page, a chosen page, a search, and a page read as a picture with text recognition. The viewer's tab has an empty outline, so this is
// the only way in. The file is a small two-page report made for this test.
import { describePdf, parsePages } from '@src/agent/pdf-format';
import { readPdfFile } from '../../extension/pdf';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S4-read-pdf',
  set: 'C',
  title: 'read_pdf reads a PDF page by page, finds a line, and reads a page as a picture',
  covers: 'pdf.js in the offscreen document gives the text of both pages and the title; a search returns the matching line with its page; ocr reads page 2 from its picture',
  async run(ctx) {
    // A real run always has a page open; the reader is used from one.
    await ctx.open(`${FIXTURE_ORIGIN}/c-text.html`);
    const url = `${FIXTURE_ORIGIN}/sample-report.pdf`;
    const text = await readPdfFile(url);
    const shown = describePdf(text);
    const found = describePdf(text, { find: 'invoice' });
    const second = await readPdfFile(url, { pages: '2' });
    const picture = await readPdfFile(url, { pages: '2', picture: true });
    const pictureText = picture.pages[0]?.text ?? '';
    const bad = await readPdfFile(`${FIXTURE_ORIGIN}/c-text.html`).then(() => 'read', e => String(e));
    return outcome(
      'two pages and the title; page 1 holds Revenue 4,200; find gives p2 with the invoice line; page 2 alone has 1 page read; the picture read still finds "Invoice total"; a page that is not a PDF is refused',
      JSON.stringify({ pageCount: text.pageCount, title: text.title, p1: text.pages[0]?.text.slice(0, 80), found: found.slice(0, 160), secondPages: second.pages.map(p => p.page), pictureSource: picture.pages[0]?.source, pictureText: pictureText.slice(0, 80), bad: bad.slice(0, 80), parse: parsePages('2', 2), shown: shown.slice(0, 60) }),
      text.pageCount === 2 && text.title === 'Sample report' && /Revenue 4,200/.test(text.pages[0]?.text ?? '') && /p2: Invoice total 9,990/.test(found) && second.pages.length === 1 && second.pages[0]!.page === 2 && picture.pages[0]?.source === 'picture' && /Invoice total/i.test(pictureText) && /did not return a PDF/.test(bad),
    );
  },
});
