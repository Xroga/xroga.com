// `ocr`: the words in a picture of the page, with where they are. The model route reads text, not pixels, so text inside an image, a canvas, a WebGL editor, a chart,
// a scanned page or a video frame has no element and no painted-text record; recognising it on the device gives it exact words and positions, as fractions of the
// picture that `canvas at` accepts. Idea: the OCR search and extract commands of Ui.Vision RPA (AGPL, idea only) and the text boxes of OmniParser (MIT); written fresh, engine vendored.
import type { AgentTool } from './tools';

export interface OcrWordBox {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
export interface OcrLineBox extends OcrWordBox {
  words: OcrWordBox[];
}
export interface OcrResult {
  text: string;
  lines: OcrLineBox[];
}

export const OCR_TOOL: AgentTool = {
  name: 'ocr',
  source: 'agent',
  group: 'working',
  description:
    'Read the text that is only in a picture (an image, a canvas, a chart, a painted or WebGL editor, a scanned page) with on-device text recognition, and say where each line is, as fractions that canvas at accepts. ' +
    'Optional region [x0, y0, x1, y1] (fractions of the page) reads only that part, larger and clearer; find returns just the lines that contain that text. A word read with low confidence is marked with ?. English text. Nothing leaves the browser. ' +
    'Use it when the page outline and the painted text a screenshot lists do not name what you need; read normal page text with read.',
  parameters: {
    type: 'object',
    properties: {
      region: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
      find: { type: 'string', maxLength: 120 },
      tabId: { type: 'number' },
    },
    additionalProperties: false,
  },
};

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** The lines as text with positions. `region` is the part of the page the picture shows (so the positions are still fractions of the whole page). */
export function describeOcr(result: OcrResult, picture: { width: number; height: number }, options: { find?: string; region?: [number, number, number, number]; limit?: number } = {}): string {
  const [rx0, ry0, rx1, ry1] = options.region ?? [0, 0, 1, 1];
  const fx = (x: number) => rx0 + (x / Math.max(1, picture.width)) * (rx1 - rx0);
  const fy = (y: number) => ry0 + (y / Math.max(1, picture.height)) * (ry1 - ry0);
  const want = options.find ? norm(options.find) : '';
  const lines = result.lines.filter(l => l.text.length > 0 && l.confidence >= 30);
  const kept = want ? lines.filter(l => norm(l.text).includes(want)) : lines;
  if (!kept.length) {
    return want
      ? `ocr: no line contains "${options.find}". ${lines.length ? `The picture has ${lines.length} other line${lines.length === 1 ? '' : 's'} of text; call ocr without find to see them.` : 'No text was recognised in the picture (it may hold no text, or only text too small or too faint to read; try a region).'}`
      : 'ocr: no text was recognised in the picture (it may hold no text, or only text too small or too faint to read; try a smaller region).';
  }
  const limit = options.limit ?? 60;
  const shown = kept.slice(0, limit).map(l => {
    const cx = (fx(l.bbox.x0) + fx(l.bbox.x1)) / 2;
    const cy = (fy(l.bbox.y0) + fy(l.bbox.y1)) / 2;
    const words = l.words.length ? l.words.map(w => (w.confidence < 60 ? `${w.text}?` : w.text)).join(' ') : l.text;
    return `«${words}» [${cx.toFixed(3)}, ${cy.toFixed(3)}]`;
  });
  return [
    `ocr: ${kept.length} line${kept.length === 1 ? '' : 's'}${want ? ` containing "${options.find}"` : ''} (recognised on this device from a picture; positions are the line centres as fractions of the page, usable with canvas at; a word marked ? was read with low confidence):`,
    ...shown,
    ...(kept.length > limit ? [`… ${kept.length - limit} more lines; use find or a region.`] : []),
  ].join(String.fromCharCode(10));
}
