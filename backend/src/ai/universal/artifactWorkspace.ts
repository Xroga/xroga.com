import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactDescriptor } from './outputEnvelope.js';

export class ArtifactWorkspace {
  readonly #root: string;
  constructor(root: string) { this.#root = path.resolve(root); }

  async write(input: { id: string; name: string; mediaType: string; bytes: Uint8Array }): Promise<ArtifactDescriptor> {
    const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safeName || safeName === '.' || safeName === '..') throw new Error('Invalid artifact name.');
    const directory = path.resolve(this.#root, input.id.replace(/[^a-zA-Z0-9_-]/g, '_'));
    const target = path.resolve(directory, safeName);
    if (!target.startsWith(`${this.#root}${path.sep}`)) throw new Error('Artifact path escapes its workspace.');
    await mkdir(directory, { recursive: true });
    await writeFile(target, input.bytes, { flag: 'wx' });
    return {
      id: input.id, name: safeName, mediaType: input.mediaType,
      sizeBytes: input.bytes.byteLength, uri: target, validation: [],
    };
  }
}
