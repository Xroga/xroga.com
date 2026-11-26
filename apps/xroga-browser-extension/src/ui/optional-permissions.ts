// The optional Chrome permissions on the extension's pages: which ones the user has allowed, and one request for all
// four, made only from a user's click.
import { useEffect, useState } from 'react';
import { OPTIONAL_PERMISSIONS, XROGA_DATA_PERMISSIONS } from './manifest-permissions';
import type { OptionalPermission } from './manifest-permissions';

export { OPTIONAL_PERMISSIONS };
export type { OptionalPermission };

/** The four, and Xroga's two for browser_data (history, bookmarks). */
export type TrackedPermission = OptionalPermission | (typeof XROGA_DATA_PERMISSIONS)[number];
const TRACKED: readonly TrackedPermission[] = [...OPTIONAL_PERMISSIONS, ...XROGA_DATA_PERMISSIONS];

export type GrantedPermissions = Record<TrackedPermission, boolean>;

/** Which of the four are allowed now. */
export async function grantedPermissions(): Promise<GrantedPermissions> {
  const entries = await Promise.all(
    TRACKED.map(
      async p => [p, await chrome.permissions.contains({ permissions: [p] as chrome.runtime.ManifestPermission[] }).catch(() => false)] as const,
    ),
  );
  return Object.fromEntries(entries) as GrantedPermissions;
}

/**
 * Which of the four are allowed, read when the page opens and again whenever one is allowed or removed. `null` until
 * the first read.
 */
export function useGrantedPermissions(): GrantedPermissions | null {
  const [granted, setGranted] = useState<GrantedPermissions | null>(null);
  useEffect(() => {
    let live = true;
    const read = () => void grantedPermissions().then(g => live && setGranted(g));
    read();
    chrome.permissions.onAdded.addListener(read);
    chrome.permissions.onRemoved.addListener(read);
    return () => {
      live = false;
      chrome.permissions.onAdded.removeListener(read);
      chrome.permissions.onRemoved.removeListener(read);
    };
  }, []);
  return granted;
}

/** True when every one of the four is allowed. */
export function allGranted(granted: GrantedPermissions | null): boolean {
  return !!granted && OPTIONAL_PERMISSIONS.every(p => granted[p]);
}

/**
 * Asks Chrome for the permissions in one dialog, all four unless told which. Call it first thing in a click handler,
 * with no `await` before it: Chrome accepts the request only while the click lasts. Resolves to whether they were
 * allowed; a refusal by the user or by Chrome resolves to false.
 */
export function requestOptionalPermissions(
  permissions: readonly TrackedPermission[] = OPTIONAL_PERMISSIONS,
): Promise<boolean> {
  try {
    return chrome.permissions.request({ permissions: [...permissions] as chrome.runtime.ManifestOptionalPermission[] }).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}
