export const GUEST_SESSION_ID_KEY = 'xroga_guest_session_id_v1';
export const GUEST_WORKSPACE_SNAPSHOT_KEY = 'xroga_guest_workspace_v1';
export const GUEST_AUTH_INTENT_KEY = 'xroga_guest_auth_intent_v1';
export const GUEST_MIGRATION_MARKER_KEY = 'xroga_guest_migration_v1';
export const GUEST_WORKSPACE_TTL_MS = 24 * 60 * 60_000;
export const GUEST_MIGRATION_MARKER_TTL_MS = 30 * 60_000;

type GuestMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
  agent?: string;
};

export interface GuestWorkspaceSnapshot {
  version: 1;
  guestSessionId: string;
  updatedAt: string;
  workspaceSession: {
    prompt: string;
    messages: GuestMessage[];
    sessionId?: string;
    updatedAt: string;
  };
}

export interface GuestAuthIntent {
  version: 1;
  guestSessionId: string;
  reason: string;
  createdAt: string;
}

export interface GuestMigrationMarker {
  version: 1;
  guestSessionId: string;
  reason?: string;
  migratedAt: string;
  restoredWorkspace: boolean;
}

function validUuid(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

export function setGuestSessionId(value: string) {
  if (typeof window === 'undefined' || !validUuid(value)) return;
  localStorage.setItem(GUEST_SESSION_ID_KEY, value);
}

export function getGuestSessionId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const existing = localStorage.getItem(GUEST_SESSION_ID_KEY);
  if (validUuid(existing)) return existing;

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    const created = crypto.randomUUID();
    localStorage.setItem(GUEST_SESSION_ID_KEY, created);
    return created;
  }

  return undefined;
}

export function rememberGuestAuthIntent(reason: string) {
  if (typeof window === 'undefined') return;
  const guestSessionId = getGuestSessionId();
  if (!guestSessionId) return;

  const intent: GuestAuthIntent = {
    version: 1,
    guestSessionId,
    reason: reason.slice(0, 48),
    createdAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(GUEST_AUTH_INTENT_KEY, JSON.stringify(intent));
  } catch {
    /* Auth still works if storage is unavailable. */
  }
}

export function loadGuestMigrationMarker(): GuestMigrationMarker | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GUEST_MIGRATION_MARKER_KEY);
    if (!raw) return null;
    const marker = JSON.parse(raw) as GuestMigrationMarker;
    const migratedAt = Date.parse(marker.migratedAt || '');
    if (
      marker.version !== 1 ||
      !validUuid(marker.guestSessionId) ||
      !Number.isFinite(migratedAt) ||
      Date.now() - migratedAt > GUEST_MIGRATION_MARKER_TTL_MS
    ) {
      localStorage.removeItem(GUEST_MIGRATION_MARKER_KEY);
      return null;
    }
    return marker;
  } catch {
    localStorage.removeItem(GUEST_MIGRATION_MARKER_KEY);
    return null;
  }
}

export function clearGuestMigrationMarker() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GUEST_MIGRATION_MARKER_KEY);
}

export function persistGuestWorkspaceSnapshotIfGuest(input: {
  prompt: string;
  messages: readonly unknown[];
  sessionId?: string;
  updatedAt?: string;
}) {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('xroga-cache-owner') !== 'v2:guest') return;

  const guestSessionId = getGuestSessionId();
  if (!guestSessionId) return;

  const updatedAt = input.updatedAt || new Date().toISOString();
  const messages: GuestMessage[] = input.messages
    .filter(
      (message): message is Record<string, unknown> =>
        Boolean(message && typeof message === 'object'),
    )
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-24)
    .map((message) => ({
      id:
        typeof message.id === 'string'
          ? message.id
          : crypto.randomUUID(),
      role: message.role as 'user' | 'assistant',
      content:
        typeof message.content === 'string'
          ? message.content.slice(0, 20_000)
          : '',
      ...(typeof message.createdAt === 'number'
        ? { createdAt: message.createdAt }
        : {}),
      ...(typeof message.agent === 'string'
        ? { agent: message.agent.slice(0, 80) }
        : {}),
    }));

  if (!messages.length && !input.prompt.trim()) return;

  const snapshot: GuestWorkspaceSnapshot = {
    version: 1,
    guestSessionId,
    updatedAt,
    workspaceSession: {
      prompt: input.prompt.slice(0, 8_000),
      messages,
      sessionId: input.sessionId,
      updatedAt,
    },
  };

  try {
    localStorage.setItem(
      GUEST_WORKSPACE_SNAPSHOT_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    /* Guest chat remains usable if storage is unavailable. */
  }
}

export function loadGuestWorkspaceSnapshot(): GuestWorkspaceSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GUEST_WORKSPACE_SNAPSHOT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as GuestWorkspaceSnapshot;
    const updated = Date.parse(parsed.updatedAt || '');
    if (
      parsed.version !== 1 ||
      !validUuid(parsed.guestSessionId) ||
      !Array.isArray(parsed.workspaceSession?.messages) ||
      !Number.isFinite(updated) ||
      Date.now() - updated > GUEST_WORKSPACE_TTL_MS
    ) {
      localStorage.removeItem(GUEST_WORKSPACE_SNAPSHOT_KEY);
      return null;
    }

    return parsed;
  } catch {
    localStorage.removeItem(GUEST_WORKSPACE_SNAPSHOT_KEY);
    return null;
  }
}
