// Text of four more kinds of file for read_file: Jupyter notebooks, email messages (.eml), calendar files (.ics) and subtitle files
// (.vtt, .srt). MarkItDown (MIT) reads notebooks and email; Docling (MIT) reads email, calendars and WebVTT. Written fresh, no code copied.
import { htmlToText, markdownTable } from './office-read';

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);

// ---------------------------------------------------------------- Jupyter notebook

interface Cell {
  cell_type?: string;
  source?: string | string[];
  outputs?: Array<{ output_type?: string; text?: string | string[]; name?: string; data?: Record<string, string | string[]>; ename?: string; evalue?: string }>;
}
const joined = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join('') : (v ?? ''));

export function readNotebook(text: string): string {
  const nb = JSON.parse(text) as { cells?: Cell[]; worksheets?: Array<{ cells?: Cell[] }>; metadata?: { kernelspec?: { language?: string; display_name?: string }; language_info?: { name?: string } } };
  const cells = nb.cells ?? nb.worksheets?.[0]?.cells ?? [];
  const lang = nb.metadata?.language_info?.name ?? nb.metadata?.kernelspec?.language ?? 'python';
  const out: string[] = [`Notebook: ${cells.length} cells (${nb.metadata?.kernelspec?.display_name ?? lang}).`];
  cells.forEach((cell, i) => {
    const src = joined(cell.source).replace(/\s+$/, '');
    if (cell.cell_type === 'markdown') {
      if (src) out.push(src);
    } else if (cell.cell_type === 'code') {
      out.push(`In [${i + 1}]:${NL}${'```'}${lang}${NL}${src}${NL}${'```'}`);
      for (const o of cell.outputs ?? []) {
        const textual = o.output_type === 'stream' ? joined(o.text) : o.output_type === 'error' ? `${o.ename}: ${o.evalue}` : joined(o.data?.['text/plain']);
        if (textual.trim()) out.push(`Output:${NL}${textual.trim().slice(0, 2000)}`);
        else if (o.data && Object.keys(o.data).some(k => k.startsWith('image/'))) out.push('Output: (a picture)');
      }
    } else if (src) out.push(src);
  });
  return out.join(NL + NL);
}

// ---------------------------------------------------------------- email

function unfold(raw: string): Map<string, string> {
  const headers = new Map<string, string>();
  const lines = raw.split(/\r?\n/);
  let name = '';
  for (const line of lines) {
    if (/^[ \t]/.test(line) && name) headers.set(name, `${headers.get(name)} ${line.trim()}`);
    else {
      const m = /^([!-9;-~]+):\s*(.*)$/.exec(line);
      if (!m) continue;
      name = m[1]!.toLowerCase();
      if (!headers.has(name)) headers.set(name, m[2]!);
      else name = '';
    }
  }
  return headers;
}

function splitMessage(raw: string): { head: string; body: string } {
  const m = /\r?\n\r?\n/.exec(raw);
  if (!m) return { head: raw, body: '' };
  return { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) };
}

function bytesFromBinaryString(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  const label = charset.toLowerCase().replace(/^us-ascii$/, 'utf-8');
  try {
    return new TextDecoder(label || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function quotedPrintable(s: string): Uint8Array {
  const cleaned = s.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]!;
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
      out.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(ch.charCodeAt(0) & 0xff);
  }
  return Uint8Array.from(out);
}

/** An encoded header word such as =?utf-8?B?...?= or =?iso-8859-1?Q?...?=. */
export function decodeHeader(value: string): string {
  // Whitespace between two encoded words is not part of the text.
  return value.replace(/(\?=)\s+(=\?)/g, '$1$2').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset: string, enc: string, data: string) => {
    try {
      if (enc.toLowerCase() === 'b') return decodeBytes(bytesFromBinaryString(atob(data)), charset);
      return decodeBytes(quotedPrintable(data.replace(/_/g, ' ')), charset);
    } catch {
      return data;
    }
  }).replace(/\?=\s+=\?/g, '');
}

interface Part {
  type: string;
  name?: string;
  size: number;
  text?: string;
  attachment: boolean;
}

function param(header: string, key: string): string | undefined {
  const m = new RegExp(`${key}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(header);
  return m ? (m[1] ?? m[2]) : undefined;
}

function walk(raw: string, parts: Part[], depth = 0): void {
  if (depth > 6) return;
  const { head, body } = splitMessage(raw);
  const h = unfold(head);
  const type = (h.get('content-type') ?? 'text/plain').split(';')[0]!.trim().toLowerCase();
  const typeHeader = h.get('content-type') ?? '';
  if (type.startsWith('multipart/')) {
    const boundary = param(typeHeader, 'boundary');
    if (!boundary) return;
    const pieces = body.split(`--${boundary}`).slice(1);
    for (const piece of pieces) {
      if (piece.startsWith('--')) break;
      walk(piece.replace(/^\r?\n/, ''), parts, depth + 1);
    }
    return;
  }
  const disposition = h.get('content-disposition') ?? '';
  const filename = decodeHeader(param(disposition, 'filename') ?? param(typeHeader, 'name') ?? '');
  const encoding = (h.get('content-transfer-encoding') ?? '7bit').trim().toLowerCase();
  let bytes: Uint8Array;
  try {
    bytes = encoding === 'base64' ? bytesFromBinaryString(atob(body.replace(/\s+/g, ''))) : encoding === 'quoted-printable' ? quotedPrintable(body) : bytesFromBinaryString(body);
  } catch {
    bytes = bytesFromBinaryString(body);
  }
  const attachment = /^attachment/i.test(disposition) || (!!filename && !type.startsWith('text/'));
  const part: Part = { type, size: bytes.length, attachment, ...(filename ? { name: filename } : {}) };
  if (!attachment && (type === 'text/plain' || type === 'text/html')) {
    const charset = param(typeHeader, 'charset') ?? 'utf-8';
    // 8-bit bodies arrive as a binary string; decode them with the declared charset.
    const text = decodeBytes(bytes, charset);
    part.text = type === 'text/html' ? htmlToText(text) : text;
  }
  parts.push(part);
}

export function readEmail(raw: string): string {
  const { head } = splitMessage(raw);
  const h = unfold(head);
  const parts: Part[] = [];
  walk(raw, parts);
  const lines: string[] = [];
  const get = (k: string) => decodeHeader(h.get(k) ?? '').trim();
  lines.push(`Email: ${get('subject') || '(no subject)'}`);
  for (const [label, key] of [['From', 'from'], ['To', 'to'], ['Cc', 'cc'], ['Date', 'date'], ['Reply-To', 'reply-to']] as const) if (get(key)) lines.push(`${label}: ${get(key)}`);
  const attachments = parts.filter(p => p.attachment);
  if (attachments.length) lines.push(`Attachments (${attachments.length}): ${attachments.map(a => `${a.name ?? '(unnamed)'} (${a.type}, ${a.size} bytes)`).join('; ')}`);
  const plain = parts.find(p => p.type === 'text/plain' && p.text?.trim());
  const body = (plain ?? parts.find(p => p.type === 'text/html' && p.text?.trim()))?.text ?? '';
  return `${lines.join(NL)}${NL}${NL}${body.split(CR).join('').trim()}`;
}

// ---------------------------------------------------------------- calendar

function icsDate(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/.exec(v.trim());
  if (!m) return v.trim();
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  return m[4] ? `${date} ${m[4]}:${m[5]}${m[7] ? ' UTC' : ''}` : date;
}
function icsUnescape(v: string): string {
  return v.split('\\n').join(' ').split('\\N').join(' ').replace(/\\([,;\\])/g, '$1').trim();
}

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location: string;
  description: string;
  rule: string;
  organizer: string;
  attendees: number;
}

export function parseCalendar(text: string): CalendarEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events: CalendarEvent[] = [];
  let current: CalendarEvent | undefined;
  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') current = { summary: '', start: '', end: '', location: '', description: '', rule: '', organizer: '', attendees: 0 };
    else if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = undefined;
    } else if (current) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0]!.toUpperCase();
      const value = line.slice(i + 1);
      if (key === 'SUMMARY') current.summary = icsUnescape(value);
      else if (key === 'DTSTART') current.start = icsDate(value);
      else if (key === 'DTEND') current.end = icsDate(value);
      else if (key === 'LOCATION') current.location = icsUnescape(value);
      else if (key === 'DESCRIPTION') current.description = icsUnescape(value);
      else if (key === 'RRULE') current.rule = value;
      else if (key === 'ORGANIZER') current.organizer = value.replace(/^mailto:/i, '');
      else if (key === 'ATTENDEE') current.attendees++;
    }
  }
  return events;
}

export function readCalendar(text: string, range: [number, number] = [1, 50]): string {
  const events = parseCalendar(text);
  if (!events.length) return 'Calendar: no events.';
  const dates = events.map(e => e.start).filter(Boolean).sort();
  const [from, to] = range;
  const shown = events.slice(from - 1, to);
  const rows = [['#', 'Start', 'End', 'Summary', 'Location', 'Repeats'], ...shown.map((e, i) => [String(from + i), e.start, e.end, e.summary, e.location, e.rule ? e.rule.slice(0, 40) : ''])];
  const more = events.length > to ? `${NL}${NL}Events ${from}-${Math.min(to, events.length)} shown; ask for others with rows "${to + 1}-${to + 50}", or use find with a word (a name, a month) to list only the matching events.` : '';
  return `Calendar: ${events.length} event${events.length === 1 ? '' : 's'}, from ${dates[0] ?? '?'} to ${dates[dates.length - 1] ?? '?'}.${NL}${NL}${markdownTable(rows)}${more}`;
}

// ---------------------------------------------------------------- subtitles

function clock(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function stamp(v: string): number {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(v.trim());
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0')) / 1000;
}

/** WebVTT or SRT as a transcript: one line per cue with its start time, tags and cue numbers removed. */
export function readSubtitles(text: string): string {
  const body = text.replace(/^\uFEFF/, '').split(CR).join('');
  const blocks = body.split(/\n{2,}/);
  const cues: Array<{ start: number; end: number; text: string }> = [];
  for (const block of blocks) {
    const lines = block.split(NL).filter(l => l.length);
    const at = lines.findIndex(l => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at]!.split('-->');
    const words = lines.slice(at + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (words) cues.push({ start: stamp(a ?? ''), end: stamp((b ?? '').trim().split(/\s+/)[0] ?? ''), text: words });
  }
  if (!cues.length) return 'Subtitles: no cues.';
  const last = cues[cues.length - 1]!;
  return `Subtitles: ${cues.length} cues, ${clock(last.end)} long.${NL}${NL}${cues.map(c => `[${clock(c.start)}] ${c.text}`).join(NL)}`;
}
