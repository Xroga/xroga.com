/** Validate media buffers before serving to users */

export function isValidMp4Buffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer.toString('utf8', 0, 1) === '{') return false;
  const box = buffer.toString('ascii', 4, 8);
  return box === 'ftyp' || buffer.includes(Buffer.from('ftyp'));
}

export function isHttpMediaUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://');
}

export function isStubJsonBuffer(buffer: Buffer): boolean {
  try {
    const head = buffer.toString('utf8', 0, 200);
    return head.trimStart().startsWith('{') && head.includes('assembled');
  } catch {
    return false;
  }
}
