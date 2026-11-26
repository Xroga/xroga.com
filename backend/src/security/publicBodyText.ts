// Text of a direct public read (the browser agent's http_get). Two things the first version got wrong for pages that are not English UTF-8:
//   1. The body was always decoded as UTF-8, so a page served as Windows-1251, Shift_JIS, GBK or ISO-8859-1 came back as replacement characters.
//      The character set is taken from the header, then a byte-order mark, then a charset declared in the first 2 KB of an HTML or XML page, else UTF-8.
//   2. Everything past the first 40,000 characters was lost. A read can now continue from an offset.
// Idea: the charset and long-page handling of modelcontextprotocol/servers `fetch` (MIT), written fresh.

import { TextDecoder } from 'node:util';

export const PUBLIC_BODY_PAGE = 40_000;

const CHARSET_IN_HEADER = /charset\s*=\s*["']?([A-Za-z0-9._:-]{2,40})/i;
const CHARSET_IN_MARKUP = /<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9._:-]{2,40})|<\?xml[^>]+encoding\s*=\s*["']([A-Za-z0-9._:-]{2,40})["']/i;

function decoderFor(label: string | undefined): TextDecoder | undefined {
  if (!label) return undefined;
  try {
    return new TextDecoder(label.trim().toLowerCase(), { fatal: false });
  } catch {
    return undefined;
  }
}

/** The text of a response body in the character set it declares. */
export function decodePublicBody(bytes: Buffer, contentType: string): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const header = CHARSET_IN_HEADER.exec(contentType)?.[1];
  let decoder = decoderFor(header);
  if (!decoder && /html|xml/i.test(contentType)) {
    // Only the start of the page is searched, as bytes read one to one, so a multi-byte page cannot confuse the search.
    const head = bytes.subarray(0, 2048).toString('latin1');
    const m = CHARSET_IN_MARKUP.exec(head);
    decoder = decoderFor(m?.[1] ?? m?.[2]);
  }
  return (decoder ?? new TextDecoder('utf-8')).decode(bytes);
}

export interface BodyPage {
  body: string;
  truncated?: true;
  totalChars?: number;
  /** Where the next read continues, when the text goes on. */
  nextOffset?: number;
}

/** One page of the text, from `offset`. A text that fits has no extra fields. */
export function pageOfBody(text: string, offset = 0, size = PUBLIC_BODY_PAGE): BodyPage {
  const start = Math.min(Math.max(0, Math.floor(offset)), text.length);
  const end = Math.min(text.length, start + size);
  if (start === 0 && end === text.length) return { body: text };
  return { body: text.slice(start, end), truncated: true, totalChars: text.length, ...(end < text.length ? { nextOffset: end } : {}) };
}
