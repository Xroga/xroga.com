import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

const HEX64 = /^[0-9a-f]{64}$/;

export function isSha256Hex(v: unknown): v is string {
  return typeof v === 'string' && HEX64.test(v);
}

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** S3 `ChecksumSHA256` is base64 of the raw digest. */
export function hexToBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

/** Stream a body through SHA-256 without buffering it. */
export async function hashStream(body: AsyncIterable<Uint8Array> | Readable): Promise<{ sha256: string; size: number }> {
  const h = createHash('sha256');
  let size = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    h.update(chunk);
    size += chunk.byteLength;
  }
  return { sha256: h.digest('hex'), size };
}
