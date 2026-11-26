// A job that needs several kinds of ability in a row, on one page, the way a real task does: read a table, follow a link to a PDF, read the PDF on the device and compare its total
// with the table, then act on a board that is only pixels (no element for the card or the columns): find the card and the target column from the parsed screen and drag the card.
// The chain is run with the same tools and helpers the agent uses; it proves the parts work together, not that a model chooses them (that needs a model run).
import type { Result } from '@src/browser-control';
import { describePdf } from '@src/agent/pdf-format';
import { describeScreen, parseScreen, type MarkBox } from '@src/agent/screen-parse';
import { readPdfFile } from '../../extension/pdf';
import { recognizeImage } from '../../extension/ocr';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

type Shot = { base64?: string; mimeType?: string; width?: number; height?: number; marks?: MarkBox[] };

defineScenario({
  id: 'S4-complex-workflow',
  set: 'C',
  title: 'table, link, PDF and a pixel-only board in one job: verify the invoice total in the PDF, then approve the card by dragging it',
  covers: 'read links finds the file address; read_pdf finds the invoice total and it equals the table; parse_screen finds the card and the Approved column on the canvas; a drag approves; the page state says so',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/ops-console.html`);
    await ctx.call('navigate', { action: 'reload' });
    await sleep(600);
    // 1. the table says what INV-17 totals and where its file is
    const links = (await ctx.call('read', { format: 'links' })) as Result;
    const pdfUrl = /«invoice-17\.pdf»\s*→\s*(\S+)/.exec(links.text ?? '')?.[1];
    const page = (await ctx.call('read', { format: 'text' })) as Result;
    const tableTotal = /INV-17\s+Acme\s+([\d,]+)/.exec(page.text ?? '')?.[1];
    // 2. the PDF says what it totals
    const pdf = pdfUrl ? await readPdfFile(pdfUrl) : undefined;
    const pdfLine = pdf ? describePdf(pdf, { find: 'invoice total' }) : '';
    const pdfTotal = /Invoice total ([\d,]+)/.exec(pdfLine)?.[1];
    const matches = !!tableTotal && tableTotal === pdfTotal;
    // 3. only when they agree: find the card and the column on the pixel board and drag
    let dragged = false;
    let listing = '';
    if (matches) {
      // Parse the board only (a part of the page): its place as fractions of the page, from the page itself.
      const box = await evaluate<{ x0: number; y0: number; x1: number; y1: number }>(tabId, undefined, '(() => { const r = document.getElementById("board").getBoundingClientRect(); return { x0: r.left / innerWidth, y0: r.top / innerHeight, x1: r.right / innerWidth, y1: r.bottom / innerHeight }; })()');
      const region: [number, number, number, number] = [box.x0, box.y0, box.x1, box.y1];
      const marked = (await ctx.call('screenshot', { marks: true, region })) as Result;
      const plain = (await ctx.call('screenshot', { region })) as Result;
      const m = marked.data as Shot | undefined;
      const p = plain.data as Shot | undefined;
      const read = await recognizeImage(p!.base64!, p!.mimeType ?? 'image/png', 'eng');
      const entries = parseScreen(m?.marks ?? [], read.lines, { width: p!.width!, height: p!.height! }, region);
      listing = describeScreen(entries).slice(0, 400);
      // White words on a dark blue card are what text recognition reads worst, so the card is picked the way a model that sees the marked picture would: the numbered region in the Pending column below its heading.
      const heading = entries.find(e => /pending/i.test(e.text));
      const card = entries.find(e => e.kind === 'mark' && !/pending|approved/i.test(e.text) && e.at[0] < 0.4 && (heading ? e.at[1] > heading.at[1] + 0.06 : e.at[1] > 0.4));
      const column = entries.find(e => /approved/i.test(e.text));
      if (card && column) {
        const to: [number, number] = [column.at[0], card.at[1]];
        const drag = (await ctx.call('canvas', { action: 'drag', at: card.at, to, intent: 'move the invoice card into the Approved column' })) as Result;
        dragged = drag.ok;
      }
    }
    await sleep(300);
    const status = await evaluate<string>(tabId, undefined, "document.getElementById('status').textContent");
    return outcome(
      'the table and the PDF both say 9,990, so the card is found on the pixel board and dragged into Approved, and the page says approved INV-17',
      JSON.stringify({ pdfUrl, tableTotal, pdfTotal, matches, dragged, status, listing }),
      matches && dragged && status === 'status: approved INV-17',
    );
  },
});
