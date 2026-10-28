'use client';

import { ApiError, apiFetch } from '@/lib/api';

/**
 * Xroga Drive: client for /api/drive. Every value shown is what the backend recorded; the file bytes go straight to private object
 * storage through short-lived signed URLs, never through the API.
 */

/** Off until Drive is configured for this deployment (a separate activation: storage, quota and bucket CORS). */
export const DRIVE_ENABLED = process.env.NEXT_PUBLIC_XROGA_DRIVE === '1';

export type DriveObjectState = 'PENDING' | 'UPLOADING' | 'VERIFYING' | 'READY' | 'FAILED' | 'QUARANTINED' | 'CORRUPT' | 'DELETING' | 'DELETED';

export interface DriveObject {
  id: string;
  projectId: string | null;
  objectClass: string;
  filename: string;
  contentType: string;
  /** Verified size once the file has been admitted; null before that. */
  size: number | null;
  sha256: string | null;
  state: DriveObjectState;
  createdAt: string;
}

export interface SignedRequest {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export type InitiatedUpload =
  | { objectId: string; mode: 'single'; upload: SignedRequest }
  | { objectId: string; mode: 'multipart'; partSize: number; parts: number; expiresAt: string };

export interface SignedPart extends SignedRequest {
  partNumber: number;
  contentLength: number;
}

export interface DriveDownload {
  url: string;
  expiresAt: string;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
}

export const driveApi = {
  list: (input: { projectId?: string; limit?: number; after?: string } = {}) => {
    const query = new URLSearchParams();
    if (input.projectId) query.set('projectId', input.projectId);
    if (input.limit) query.set('limit', String(input.limit));
    if (input.after) query.set('after', input.after);
    const suffix = query.size ? `?${query.toString()}` : '';
    return apiFetch<{ objects: DriveObject[] }>(`/api/drive/objects${suffix}`);
  },
  meta: (objectId: string) => apiFetch<DriveObject>(`/api/drive/objects/${objectId}`),
  initiateUpload: (input: { projectId?: string | null; filename: string; contentType: string; size: number; sha256?: string | null }) =>
    apiFetch<InitiatedUpload>('/api/drive/uploads', { method: 'POST', body: JSON.stringify(input) }),
  signParts: (objectId: string, partNumbers: number[]) =>
    apiFetch<{ parts: SignedPart[] }>(`/api/drive/uploads/${objectId}/parts`, { method: 'POST', body: JSON.stringify({ partNumbers }) }),
  completeUpload: (objectId: string, parts?: Array<{ partNumber: number; etag: string }>) =>
    apiFetch<DriveObject>(`/api/drive/uploads/${objectId}/complete`, { method: 'POST', body: JSON.stringify(parts ? { parts } : {}) }),
  downloadUrl: (objectId: string, ttlSeconds?: number) =>
    apiFetch<DriveDownload>(`/api/drive/objects/${objectId}/download-url`, { method: 'POST', body: JSON.stringify(ttlSeconds ? { ttlSeconds } : {}) }),
  remove: (objectId: string) => apiFetch<unknown>(`/api/drive/objects/${objectId}`, { method: 'DELETE' }),
};

export type DriveApi = typeof driveApi;

/** What a person should read for a failure. Provider and database detail never reach this far (the backend does not send it). */
export function driveErrorMessage(error: unknown): string {
  const code = error instanceof ApiError ? String(error.data?.code ?? '') : '';
  switch (code) {
    case 'QUOTA_EXCEEDED': return 'Your Xroga Drive storage is full. Delete files you no longer need and try again.';
    case 'STORAGE_NOT_CONFIGURED': return 'Xroga Drive is not available on this deployment yet.';
    case 'POLICY_REJECTED': return 'This file type or size is not accepted by Xroga Drive.';
    case 'QUARANTINED': return 'This file was held back by Xroga’s safety checks and cannot be used.';
    case 'CORRUPT': return 'This file did not match what was uploaded and was not stored.';
    case 'CHECKSUM_MISMATCH': return 'The upload was damaged in transit and was not stored. Try again.';
    case 'SIZE_MISMATCH': return 'The upload did not match the file size and was not stored. Try again.';
    case 'EXPIRED': return 'The upload took too long and expired. Try again.';
    case 'PROVIDER_UNAVAILABLE': return 'Storage is temporarily unavailable. Try again in a moment.';
    case 'NOT_FOUND': return 'That file is no longer available.';
    case 'NETWORK_ERROR': return 'Cannot reach Xroga. Check your connection and try again.';
    default: return error instanceof ApiError && error.message ? error.message : 'The request could not be completed.';
  }
}
