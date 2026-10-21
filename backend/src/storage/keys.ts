import { createHash, randomUUID } from 'node:crypto';
import { StorageError, type ObjectClass } from './types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

export const MAX_FILENAME_LENGTH = 120;

/** Stable id for a legacy source object: retries and concurrent jobs converge on the same destination row. */
export function deterministicObjectId(sourceProvider: string, sourceId: string): string {
  const h = createHash('sha256').update(`xroga-drive-migration-v1|${sourceProvider}|${sourceId}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5-shaped
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Server-generated, collision-resistant, unguessable object id (UUIDv4). */
export function newObjectId(): string {
  return randomUUID();
}

/**
 * Reduce a user-supplied name to a safe display/key segment. The result is never used for identity:
 * the object id is. Strips path parts, control and bidi characters, leading dots, reserved names.
 */
export function sanitizeFilename(input: string): string {
  let name = String(input ?? '').normalize('NFKC');
  name = name.split(/[\\/]/).pop() ?? '';
  name = name.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, '');
  name = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_{2,}/g, '_').replace(/_+\./g, '.').replace(/^[._-]+/, '').replace(/[._-]+$/, '');
  if (!name || WINDOWS_RESERVED.test(name)) name = `file${name ? `_${name}` : ''}`;
  if (name.length > MAX_FILENAME_LENGTH) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : '';
    name = name.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
  }
  return name;
}

export interface KeyParts {
  tenantId: string;
  projectId: string | null;
  objectClass: ObjectClass;
  objectId: string;
  safeFilename: string;
}

/** `v1/tenants/{tenantId}/projects/{projectId|_none}/{class}/{objectId}/{safeFilename}` */
export function buildObjectKey(p: KeyParts): string {
  if (!isUuid(p.tenantId)) throw new StorageError('INVALID_REQUEST', 'tenant id must be a UUID');
  if (p.projectId !== null && !isUuid(p.projectId)) throw new StorageError('INVALID_REQUEST', 'project id must be a UUID');
  if (!isUuid(p.objectId)) throw new StorageError('INVALID_REQUEST', 'object id must be a UUID');
  const file = sanitizeFilename(p.safeFilename);
  return `v1/tenants/${p.tenantId}/projects/${p.projectId ?? '_none'}/${p.objectClass}/${p.objectId}/${file}`;
}

const KEY_RE =
  /^v1\/tenants\/([0-9a-f-]{36})\/projects\/(_none|[0-9a-f-]{36})\/([a-z_]+)\/([0-9a-f-]{36})\/([A-Za-z0-9._-]{1,120})$/;

export function parseObjectKey(key: string): KeyParts | null {
  if (key.includes('..') || key.includes('//') || key.includes('\0')) return null;
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const [, tenantId, project, objectClass, objectId, safeFilename] = m;
  if (!isUuid(tenantId) || !isUuid(objectId) || (project !== '_none' && !isUuid(project))) return null;
  return { tenantId, projectId: project === '_none' ? null : project, objectClass: objectClass as ObjectClass, objectId, safeFilename };
}

/**
 * Defence in depth: the stored key must be exactly what the stored identity implies. The key is
 * never the authority (the metadata row is), but a row whose key disagrees with its own identity is rejected.
 */
export function assertKeyMatchesIdentity(obj: { objectKey: string; tenantId: string; id: string }): void {
  const parts = parseObjectKey(obj.objectKey);
  if (!parts || parts.tenantId !== obj.tenantId || parts.objectId !== obj.id) {
    throw new StorageError('CONFLICT', 'object key does not match object identity');
  }
}
