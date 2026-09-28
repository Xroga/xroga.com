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

export async function getUserPluginPermissionMode(
  userId: string,
): Promise<PluginPermissionMode> {
  try {
    const stored = await loadProviderToken(
      userId,
      PROVIDER,
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

  return DEFAULT_MODE;
}

export async function setUserPluginPermissionMode(
  userId: string,
  mode: PluginPermissionMode,
): Promise<PluginPermissionMode> {
  await storeProviderToken(
    userId,
    PROVIDER,
    {
      /*
       * This row stores a preference, not a credential. oauthPkceStore is reused
       * because it already provides user-scoped DB + private Storage fallback.
       */
      access_token: mode,
      metadata: {
        type: 'plugin_permission_policy',
        mode,
        updated_at: new Date().toISOString(),
      },
    },
  );

  return mode;
}