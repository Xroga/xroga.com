import type { ArtifactDescriptor } from '../ai/universal/outputEnvelope.js';
import type { StorageService } from './storageService.js';
import { StorageError, type ObjectClass, type StorageActor } from './types.js';

/**
 * Durable sink for the Universal output envelope's artifacts.
 *
 * The envelope's `ArtifactWorkspace` writes to a local directory, which is NOT durable (a restart or a new machine loses it).
 * This returns a descriptor whose `uri` is `drive://{objectId}` only after Drive has verified the stored bytes (size + SHA-256 read
 * back). Anything short of READY throws: a caller can never receive a descriptor that points at an unverified or local file.
 *
 * No production code calls this yet: nothing in `main` persists envelope artifacts anywhere durable (see current-state.md, finding W3).
 */
export async function persistArtifactToDrive(
  drive: StorageService, actor: StorageActor,
  artifact: { id: string; name: string; mediaType: string; bytes: Uint8Array },
  ctx: { projectId?: string | null; objectClass?: ObjectClass } = {},
): Promise<ArtifactDescriptor> {
  const stored = await drive.putServerObject(actor, {
    projectId: ctx.projectId ?? null, objectClass: ctx.objectClass ?? 'artifact', filename: artifact.name,
    contentType: artifact.mediaType, body: Buffer.from(artifact.bytes),
  });
  if (stored.state !== 'READY' || stored.sha256 === null || stored.size === null) throw new StorageError('BAD_STATE', 'artifact was not durably stored');
  return {
    id: artifact.id, name: stored.filename, mediaType: stored.contentType, sizeBytes: stored.size, uri: `drive://${stored.id}`,
    validation: [{ validator: 'xroga-drive-sha256', status: 'passed', detail: stored.sha256 }],
  };
}

export const DRIVE_URI = /^drive:\/\/([0-9a-f-]{36})$/;
