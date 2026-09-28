import {
  loadProviderToken,
  storeProviderToken,
} from './oauthPkceStore.js';

export type PluginPermissionMode =
  | 'always_ask'
  | 'read_only'
  | 'low_risk'
  | 'full_access';

const PROVIDER = 'xroga_plugin_permission_policy';
const DEFAULT_MODE: PluginPermissionMode = 'low_risk';

function isPluginPermissionMode(
  value: unknown,
): value is PluginPermissionMode {
  return (
    value === 'always_ask' ||
    value === 'read_only' ||
    value === 'low_risk' ||
    value === 'full_access'
  );
}

function cleanToolkitPermissionKey(
  toolkit?: string,
): string | null {
  const clean = toolkit
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 90);

  return clean || null;
}

function providerForToolkit(
  toolkit?: string,
): string {
  const clean = cleanToolkitPermissionKey(toolkit);
  return clean ? `${PROVIDER}__${clean}` : PROVIDER;
}

async function loadMode(
  userId: string,
  provider: string,
): Promise<PluginPermissionMode | null> {
  try {
    const stored = await loadProviderToken(
      userId,
      provider,
    );

    const metadataMode =
      stored?.metadata?.mode;

    if (
      isPluginPermissionMode(
        metadataMode,
      )
    ) {
      return metadataMode;
    }

    if (
      isPluginPermissionMode(
        stored?.access_token,
      )
    ) {
      return stored.access_token;
    }
  } catch (error) {
    console.warn(
      '[pluginPermissionPolicy] read:',
      error instanceof Error
        ? error.message
        : 'unknown error',
    );
  }

  return null;
}

/**
 * A toolkit-specific preference overrides the user's global Plugin default.
 * When there is no override, the existing global setting remains authoritative.
 */
export async function getUserPluginPermissionMode(
  userId: string,
  toolkit?: string,
): Promise<PluginPermissionMode> {
  const cleanToolkit = cleanToolkitPermissionKey(toolkit);

  if (cleanToolkit) {
    const specific = await loadMode(
      userId,
      providerForToolkit(cleanToolkit),
    );

    if (specific) return specific;
  }

  return (
    (await loadMode(
      userId,
      PROVIDER,
    )) ?? DEFAULT_MODE
  );
}

export async function setUserPluginPermissionMode(
  userId: string,
  mode: PluginPermissionMode,
  toolkit?: string,
): Promise<PluginPermissionMode> {
  const cleanToolkit = cleanToolkitPermissionKey(toolkit);
  const provider = providerForToolkit(cleanToolkit ?? undefined);

  await storeProviderToken(
    userId,
    provider,
    {
      /*
       * This row stores a preference, not a credential. oauthPkceStore is reused
       * because it already provides user-scoped DB + private Storage fallback.
       */
      access_token: mode,
      metadata: {
        type: 'plugin_permission_policy',
        mode,
        scope: cleanToolkit ? 'toolkit' : 'global',
        ...(cleanToolkit
          ? {
              toolkit: cleanToolkit,
            }
          : {}),
        updated_at: new Date().toISOString(),
      },
    },
  );

  return mode;
}
