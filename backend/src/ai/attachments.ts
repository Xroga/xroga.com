/**
 * Chat attachments — images (Grok vision) and docs (extract text → LLM).
 */

import { createRequire } from 'module';
import type { ModelId } from './models.js';

// Import implementation directly — package root runs demo code on load in ESM
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  data: Buffer,
) => Promise<{ text?: string }>;

export interface ChatAttachment {
  url: string;
  mimeType?: string;
  name?: string;
}

export interface PreparedAttachments {
  images: Array<{ url: string; mimeType: string; name: string }>;
  documents: Array<{ name: string; mimeType: string; text: string; chars: number }>;
  /** Concatenated doc text for prompts */
  documentBlock: string;
  hasImages: boolean;
  hasDocuments: boolean;
}

const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif)$/i;
const HARD_VISION_RE =
  /\b(design|critique|redesign|ui\/ux|ux|pixel|layout critique|compare|why.*(broken|fail|error)|debug.*(screen|ui|error)|production error|stack\s*trace)\b/i;

function guessMime(att: ChatAttachment): string {
  if (att.mimeType?.trim()) return att.mimeType.trim();
  const name = (att.name || att.url.split('/').pop() || '').toLowerCase();
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.gif$/i.test(name)) return 'image/gif';
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.docx$/i.test(name)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (/\.md$/i.test(name)) return 'text/markdown';
  if (/\.csv$/i.test(name)) return 'text/csv';
  if (/\.json$/i.test(name)) return 'application/json';
  if (/\.txt$/i.test(name)) return 'text/plain';
  if (att.url.startsWith('data:')) {
    const m = att.url.match(/^data:([^;,]+)/);
    if (m) return m[1];
  }
  return 'application/octet-stream';
}

function isImageMime(mime: string): boolean {
  return IMAGE_MIME.test(mime) || mime === 'image/jpg';
}

function isTextishMime(mime: string, name: string): boolean {
  if (/^text\//i.test(mime)) return true;
  if (/json|markdown|csv|xml/i.test(mime)) return true;
  if (/\.(txt|md|csv|json|ts|tsx|js|jsx|css|html|log|yml|yaml)$/i.test(name)) return true;
  return false;
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    if (comma < 0) throw new Error('Invalid data URL');
    const meta = url.slice(0, comma);
    const data = url.slice(comma + 1);
    if (/;base64/i.test(meta)) return Buffer.from(data, 'base64');
    return Buffer.from(decodeURIComponent(data), 'utf8');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch attachment failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function extractPdfText(buf: Buffer): Promise<string> {
  try {
    const parsed = await pdfParse(buf);
    return (parsed.text || '').trim();
  } catch (err) {
    console.warn('[attachments] pdf-parse failed:', (err as Error).message);
    return '';
  }
}

async function extractDocxText(buf: Buffer): Promise<string> {
  // Minimal DOCX: word/document.xml inside zip — avoid heavy deps
  const zip = buf.toString('binary');
  // Prefer utf8 scan for <w:t> if buffer was unzipped elsewhere; try inflate via unzip pattern
  try {
    // Dynamic import of node zlib + manual OOXML is brittle; use regex on inflated-like raw
    const asUtf8 = buf.toString('utf8');
    if (asUtf8.includes('<w:t')) {
      const parts = [...asUtf8.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
      if (parts.length) return parts.join(' ');
    }
  } catch {
    /* ignore */
  }
  // Try unzip using undici-less approach: look for document.xml uncompressed (rare)
  void zip;
  return '';
}

export async function prepareAttachments(
  raw: unknown,
  opts?: { maxImages?: number; maxDocs?: number; maxDocChars?: number },
): Promise<PreparedAttachments> {
  const maxImages = opts?.maxImages ?? 4;
  const maxDocs = opts?.maxDocs ?? 4;
  const maxDocChars = opts?.maxDocChars ?? 80_000;

  const list = Array.isArray(raw) ? raw : [];
  const images: PreparedAttachments['images'] = [];
  const documents: PreparedAttachments['documents'] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const att = item as ChatAttachment;
    if (typeof att.url !== 'string' || !att.url.trim()) continue;
    const name = typeof att.name === 'string' ? att.name : 'attachment';
    const mime = guessMime({ ...att, name });

    if (isImageMime(mime) && images.length < maxImages) {
      images.push({ url: att.url, mimeType: mime, name });
      continue;
    }

    if (documents.length >= maxDocs) continue;

    try {
      if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
        const buf = await fetchAsBuffer(att.url);
        const text = await extractPdfText(buf);
        documents.push({
          name,
          mimeType: 'application/pdf',
          text: text.slice(0, maxDocChars),
          chars: text.length,
        });
      } else if (
        mime.includes('wordprocessingml') ||
        /\.docx$/i.test(name)
      ) {
        const buf = await fetchAsBuffer(att.url);
        let text = await extractDocxText(buf);
        if (!text.trim()) {
          text = '[DOCX received — could not extract text. Ask user to paste text or upload PDF/TXT.]';
        }
        documents.push({
          name,
          mimeType: mime,
          text: text.slice(0, maxDocChars),
          chars: text.length,
        });
      } else if (isTextishMime(mime, name)) {
        const buf = await fetchAsBuffer(att.url);
        const text = buf.toString('utf8');
        documents.push({
          name,
          mimeType: mime,
          text: text.slice(0, maxDocChars),
          chars: text.length,
        });
      }
    } catch (err) {
      console.warn('[attachments] extract failed:', name, (err as Error).message);
      documents.push({
        name,
        mimeType: mime,
        text: `[Could not read attachment: ${(err as Error).message}]`,
        chars: 0,
      });
    }
  }

  const documentBlock = documents
    .map(
      (d) =>
        `--- FILE: ${d.name} (${d.mimeType}, ${d.chars} chars) ---\n${d.text || '(empty / scanned PDF with no extractable text)'}`,
    )
    .join('\n\n')
    .slice(0, maxDocChars);

  return {
    images,
    documents,
    documentBlock,
    hasImages: images.length > 0,
    hasDocuments: documents.length > 0,
  };
}

/** Pick vision / doc model per product rules. */
export function pickAttachmentModel(
  prompt: string,
  prepared: PreparedAttachments,
): { modelId: ModelId; reason: string; kind: 'vision' | 'document' | 'mixed' } {
  if (prepared.hasImages && !prepared.hasDocuments) {
    const hard = HARD_VISION_RE.test(prompt);
    return {
      modelId: hard ? 'grok_4_5' : 'grok_4_3',
      reason: hard
        ? 'Hard image analyze → Grok 4.5 vision'
        : 'Image analyze → Grok 4.3 vision',
      kind: 'vision',
    };
  }

  if (prepared.hasDocuments && !prepared.hasImages) {
    const chars = prepared.documents.reduce((n, d) => n + d.chars, 0);
    if (chars > 60_000 || /\b(long|entire|full)\b.*\b(doc|document|pdf|report)\b/i.test(prompt)) {
      return {
        modelId: 'glm_5_2',
        reason: 'Long document → GLM-5.2',
        kind: 'document',
      };
    }
    if (
      chars < 8_000 &&
      !/\b(analyze|analyse|review|critique|summarize in depth|deep)\b/i.test(prompt)
    ) {
      return {
        modelId: 'deepseek_v4_flash',
        reason: 'Short doc → DeepSeek Flash',
        kind: 'document',
      };
    }
    return {
      modelId: 'grok_4_3',
      reason: 'Document analyze → Grok 4.3',
      kind: 'document',
    };
  }

  // Mixed: images win for vision model; docs appended as text
  return {
    modelId: HARD_VISION_RE.test(prompt) ? 'grok_4_5' : 'grok_4_3',
    reason: 'Mixed image + docs → Grok vision (+ extracted text)',
    kind: 'mixed',
  };
}

export function defaultAttachmentPrompt(prepared: PreparedAttachments, prompt: string): string {
  if (prompt.trim()) return prompt.trim();
  if (prepared.hasImages && prepared.hasDocuments) {
    return 'Analyze the attached image(s) and document(s). Summarize what you see, extract key text, and call out issues or next steps.';
  }
  if (prepared.hasImages) {
    return 'Analyze this screenshot/image. Describe what you see, extract any error or UI text, and suggest concrete fixes or design improvements.';
  }
  return 'Analyze the attached document(s). Summarize key points, structure, and actionable takeaways.';
}
