// `parse_screen`: a screenshot turned into numbered regions with their text, the way OmniParser (microsoft/OmniParser, MIT, a pipeline of an interactable-region detector, text
// recognition and a rule that joins them) hands a vision model a screen as a list of things it can aim at. Xroga's pieces: the numbered marks drawn on the picture (edges and
// shapes, no model), the on-device text recognition, and OmniParser's joining rule: a recognised line that sits inside a region is that region's label; a region with no text is an
// icon; a line outside every region is plain text. The model then picks a NUMBER from the marked picture instead of estimating a pixel (the weakness of coordinate-clicking
// vision models such as UI-TARS), and reads the words from the list instead of guessing at small print. Pure; written fresh.
import type { AgentTool } from './tools';
import type { OcrLineBox } from './ocr-format';

export interface MarkBox {
  n: number;
  /** [x0, y0, x1, y1] as fractions of the picture. */
  box: [number, number, number, number];
}

export const PARSE_SCREEN_TOOL: AgentTool = {
  name: 'parse_screen',
  source: 'agent',
  group: 'working',
  description:
    'Turn the page picture into a list of numbered regions with their words: each region as «its text» or "icon" (no text), and the plain text outside any region. The marked picture is attached; act with canvas mark N. Use it on pages that paint their own interface (canvas, WebGL editors, images, charts) where the outline names nothing. region [x0, y0, x1, y1] parses only a part; language for non-English text.',
  parameters: {
    type: 'object',
    properties: {
      region: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
      language: { type: 'string', enum: ['english', 'arabic', 'urdu', 'hindi', 'spanish', 'french', 'german', 'portuguese', 'russian', 'chinese'] },
      tabId: { type: 'number' },
    },
    additionalProperties: false,
  },
};

export interface ScreenEntry {
  kind: 'mark' | 'text';
  /** The mark number, for a mark. */
  n?: number;
  /** The words: a mark's label, or a plain line. Empty for an icon. */
  text: string;
  /** Centre as fractions of the page. */
  at: [number, number];
}

const area = (b: [number, number, number, number]) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
function overlap(a: [number, number, number, number], b: [number, number, number, number]): number {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Joins the marks with the recognised lines. OmniParser's rule: a line inside a region (80% of the line within it) belongs to that region; the smallest such region wins. */
export function parseScreen(
  marks: MarkBox[],
  lines: OcrLineBox[],
  picture: { width: number; height: number },
  region: [number, number, number, number] = [0, 0, 1, 1],
): ScreenEntry[] {
  const toPage = (fx: number, fy: number): [number, number] => [region[0] + fx * (region[2] - region[0]), region[1] + fy * (region[3] - region[1])];
  const labels = new Map<number, Array<{ text: string; y: number; x: number }>>();
  const outside: ScreenEntry[] = [];
  const holder = (box: [number, number, number, number]): MarkBox | undefined => {
    let best: MarkBox | undefined;
    for (const m of marks) if (overlap(box, m.box) / Math.max(1e-9, area(box)) >= 0.8 && (!best || area(m.box) < area(best.box))) best = m;
    return best;
  };
  const frac = (b: { x0: number; y0: number; x1: number; y1: number }): [number, number, number, number] => [b.x0 / picture.width, b.y0 / picture.height, b.x1 / picture.width, b.y1 / picture.height];
  for (const l of lines) {
    if (!l.text.trim() || l.confidence < 30) continue;
    // A menu bar is one recognised line of many words, each in its own region: the join is made word by word, and the words that sit in no region stay one piece of plain text.
    const words = l.words.filter(w => w.text.trim() && w.confidence >= 30);
    const units = words.length ? words.map(w => ({ text: w.text.trim(), box: frac(w.bbox) })) : [{ text: l.text.trim(), box: frac(l.bbox) }];
    const rest: typeof units = [];
    for (const u of units) {
      const best = holder(u.box);
      if (best) {
        const list = labels.get(best.n) ?? [];
        list.push({ text: u.text, y: u.box[1], x: u.box[0] });
        labels.set(best.n, list);
      } else rest.push(u);
    }
    if (rest.length) {
      const x0 = Math.min(...rest.map(u => u.box[0])), y0 = Math.min(...rest.map(u => u.box[1])), x1 = Math.max(...rest.map(u => u.box[2])), y1 = Math.max(...rest.map(u => u.box[3]));
      outside.push({ kind: 'text', text: rest.map(u => u.text).join(' '), at: toPage((x0 + x1) / 2, (y0 + y1) / 2) });
    }
  }
  const entries: ScreenEntry[] = marks.map(m => ({
    kind: 'mark' as const,
    n: m.n,
    text: (labels.get(m.n) ?? []).sort((a, b) => Math.round(a.y * 100) - Math.round(b.y * 100) || a.x - b.x).map(x => x.text).join(' '),
    at: toPage((m.box[0] + m.box[2]) / 2, (m.box[1] + m.box[3]) / 2),
  }));
  const reading = (e: ScreenEntry) => Math.round(e.at[1] * 60) * 10 + e.at[0];
  return [...entries, ...outside].sort((a, b) => reading(a) - reading(b));
}

/** The list for the model: "mark 4 «Save draft» [0.18, 0.32]", "mark 7 icon [0.9, 0.03]", "text «Total 4,200» [0.5, 0.7]". */
export function describeScreen(entries: ScreenEntry[], limit = 120): string {
  if (!entries.length) return 'parse_screen: nothing was found in the picture (no regions, no text). The page may be blank or still loading: wait and try again, or take a screenshot.';
  const fmt = (e: ScreenEntry) => {
    const p = `[${e.at[0].toFixed(3)}, ${e.at[1].toFixed(3)}]`;
    return e.kind === 'mark' ? `mark ${e.n} ${e.text ? `«${e.text}»` : 'icon'} ${p}` : `text «${e.text}» ${p}`;
  };
  const marks = entries.filter(e => e.kind === 'mark');
  const withText = marks.filter(e => e.text).length;
  return [
    `parse_screen: ${marks.length} numbered region${marks.length === 1 ? '' : 's'} (${withText} with words, ${marks.length - withText} icons) and ${entries.length - marks.length} line${entries.length - marks.length === 1 ? '' : 's'} of plain text; centres are fractions of the page. Act on a region with canvas mark N; a region's words were read from the picture on this device, check numbers and names.`,
    ...entries.slice(0, limit).map(fmt),
    ...(entries.length > limit ? [`… ${entries.length - limit} more; parse a region.`] : []),
  ].join(String.fromCharCode(10));
}
