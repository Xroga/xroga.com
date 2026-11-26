// Reading a document file on the device: the bytes are fetched here (with the browser's own cookies, as the person is signed in) and parsed by agent/file-format.
import { readFileContents, type FileReadOptions, type FileReadResult } from '@src/agent/file-format';

const MAX_FILE_BYTES = 80 * 1024 * 1024;

export async function readFileAt(url: string, options: Omit<FileReadOptions, 'name' | 'contentType'> = {}): Promise<FileReadResult> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`the address answered ${res.status}`);
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_FILE_BYTES) throw new Error('the file is larger than 80 MB');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) throw new Error('the file is larger than 80 MB');
  const disposition = res.headers.get('content-disposition') ?? '';
  const named = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(disposition)?.[1];
  let name = named ? decodeURIComponent(named) : '';
  if (!name) {
    try {
      name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    } catch {
      name = url;
    }
  }
  return readFileContents(bytes, { ...options, name, contentType: res.headers.get('content-type') ?? '' });
}
