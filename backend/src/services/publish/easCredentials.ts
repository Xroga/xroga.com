/**
 * Push user vault store credentials into Expo/EAS (real GraphQL),
 * poll finished builds for install/artifact URLs, and drive submit workflows.
 */

import {
  getUserProviderKey,
  saveUserProviderKey,
} from '../integrations/userProviderKeys.js';
import { resolveExpoProjectId } from './easPublish.js';

const EXPO_API = 'https://api.expo.dev';

async function expoFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(`${EXPO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text };
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function expoGraphql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await expoFetch(token, '/graphql', {
    method: 'POST',
    body: JSON.stringify({ query, variables }),
  });
  const body = res.json as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || body.errors?.length) {
    throw new Error(body.errors?.[0]?.message || `Expo GraphQL ${res.status}`);
  }
  if (!body.data) throw new Error('Expo GraphQL returned no data');
  return body.data;
}

/** Upload Google Play service-account JSON into Expo and attach for submissions. */
export async function syncGooglePlayCredentialsToExpo(opts: {
  userId: string;
  applicationIdentifier?: string;
}): Promise<{ ok: boolean; message: string; error?: string }> {
  const token = await getUserProviderKey(opts.userId, 'expo');
  if (!token) {
    return { ok: false, message: 'Connect Expo first', error: 'NO_EXPO_TOKEN' };
  }
  const googleJson = await getUserProviderKey(opts.userId, 'google_play');
  if (!googleJson) {
    return {
      ok: false,
      message: 'Save Google Play service account JSON in Publish first',
      error: 'NO_GOOGLE',
    };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(googleJson) as Record<string, unknown>;
  } catch {
    return { ok: false, message: 'Google Play JSON is invalid', error: 'BAD_JSON' };
  }

  const projectId = await resolveExpoProjectId(opts.userId);
  if (!projectId) {
    return { ok: false, message: 'Link an EAS project first', error: 'NO_PROJECT' };
  }

  try {
    // Resolve account + android credentials for this app
    const meta = await expoGraphql<{
      app?: {
        id: string;
        ownerAccount?: { id: string; name?: string };
        androidAppCredentialsList?: Array<{
          id: string;
          applicationIdentifier?: string | null;
        }>;
      };
    }>(
      token,
      `query XrogaAppCreds($appId: String!) {
        app {
          byId(appId: $appId) {
            id
            ownerAccount { id name }
            androidAppCredentialsList {
              id
              applicationIdentifier
            }
          }
        }
      }`,
      { appId: projectId },
    ).catch(async () => {
      // Fallback shape used by some Expo schema versions
      return expoGraphql<{
        app?: {
          byId?: {
            id: string;
            ownerAccount?: { id: string };
            androidAppCredentialsList?: Array<{
              id: string;
              applicationIdentifier?: string | null;
            }>;
          };
        };
      }>(
        token,
        `query($appId: String!) {
          app { byId(appId: $appId) {
            id
            ownerAccount { id }
            androidAppCredentialsList { id applicationIdentifier }
          }}
        }`,
        { appId: projectId },
      ).then((d) => ({ app: d.app?.byId }));
    });

    const app = (meta as { app?: {
      id: string;
      ownerAccount?: { id: string };
      androidAppCredentialsList?: Array<{ id: string; applicationIdentifier?: string | null }>;
    } }).app;
    const accountId = app?.ownerAccount?.id;
    if (!accountId) {
      return {
        ok: false,
        message: 'Could not resolve Expo account for this project',
        error: 'NO_ACCOUNT',
      };
    }

    const created = await expoGraphql<{
      googleServiceAccountKey?: {
        createGoogleServiceAccountKey?: { id: string };
      };
    }>(
      token,
      `mutation($accountId: ID!, $jsonKey: JSONObject!) {
        googleServiceAccountKey {
          createGoogleServiceAccountKey(
            accountId: $accountId
            googleServiceAccountKey: { jsonKey: $jsonKey }
          ) { id }
        }
      }`,
      { accountId, jsonKey: parsed },
    );

    const keyId = created.googleServiceAccountKey?.createGoogleServiceAccountKey?.id;
    if (!keyId) {
      return {
        ok: false,
        message: 'Expo did not return a Google service account key id',
        error: 'CREATE_KEY_FAILED',
      };
    }

    let androidCredsId =
      app?.androidAppCredentialsList?.find(
        (c) =>
          !opts.applicationIdentifier ||
          c.applicationIdentifier === opts.applicationIdentifier,
      )?.id || app?.androidAppCredentialsList?.[0]?.id;

    if (!androidCredsId) {
      // Create empty android credentials for default application id
      const createdCreds = await expoGraphql<{
        androidAppCredentials?: {
          createAndroidAppCredentials?: { id: string };
        };
      }>(
        token,
        `mutation($appId: ID!, $applicationIdentifier: String!) {
          androidAppCredentials {
            createAndroidAppCredentials(
              appId: $appId
              androidAppCredentialsInput: { applicationIdentifier: $applicationIdentifier }
            ) { id }
          }
        }`,
        {
          appId: projectId,
          applicationIdentifier: opts.applicationIdentifier || 'com.xroga.app',
        },
      ).catch(() => null);
      androidCredsId =
        createdCreds?.androidAppCredentials?.createAndroidAppCredentials?.id;
    }

    if (androidCredsId) {
      await expoGraphql(
        token,
        `mutation($id: ID!, $googleServiceAccountKeyId: ID!) {
          androidAppCredentials {
            setGoogleServiceAccountKeyForSubmissions(
              id: $id
              googleServiceAccountKeyId: $googleServiceAccountKeyId
            ) { id }
          }
        }`,
        { id: androidCredsId, googleServiceAccountKeyId: keyId },
      );
    }

    await saveUserProviderKey(opts.userId, 'google_play', googleJson).catch(() => undefined);

    return {
      ok: true,
      message:
        'Google Play service account uploaded to Expo/EAS for submissions. First Play listing still needs a one-time manual create in Play Console.',
    };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message,
      error: 'SYNC_FAILED',
    };
  }
}

function parseAppleAscJson(raw: string): {
  keyId: string;
  issuerId: string;
  keyP8: string;
  teamId?: string;
} | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const keyId = String(
      parsed.keyId || parsed.key_id || parsed.keyIdentifier || '',
    ).trim();
    const issuerId = String(
      parsed.issuerId || parsed.issuer_id || parsed.issuerIdentifier || '',
    ).trim();
    let keyP8 = String(
      parsed.keyP8 || parsed.key_p8 || parsed.privateKey || parsed.private_key || '',
    ).trim();
    if (keyP8.includes('\\n') && !keyP8.includes('\n')) {
      keyP8 = keyP8.replace(/\\n/g, '\n');
    }
    if (!keyId || !issuerId || !keyP8.includes('BEGIN PRIVATE KEY')) return null;
    const teamId = String(
      parsed.teamId || parsed.team_id || parsed.appleTeamId || '',
    ).trim();
    return { keyId, issuerId, keyP8, ...(teamId ? { teamId } : {}) };
  } catch {
    return null;
  }
}

/**
 * Upload App Store Connect API key to Expo and attach for iOS submissions
 * (same GraphQL path as `eas credentials` / eas-cli).
 */
export async function syncAppleAscApiKeyToExpo(opts: {
  userId: string;
  bundleIdentifier?: string;
}): Promise<{ ok: boolean; message: string; error?: string; keyId?: string }> {
  const token = await getUserProviderKey(opts.userId, 'expo');
  if (!token) {
    return { ok: false, message: 'Connect Expo first', error: 'NO_EXPO_TOKEN' };
  }
  const appleJson = await getUserProviderKey(opts.userId, 'apple_asc_api');
  if (!appleJson) {
    return {
      ok: false,
      message:
        'Save App Store Connect API key JSON in Publish first ({ keyId, issuerId, keyP8 })',
      error: 'NO_APPLE_ASC',
    };
  }
  const creds = parseAppleAscJson(appleJson);
  if (!creds) {
    return {
      ok: false,
      message:
        'Invalid Apple ASC JSON. Need { keyId, issuerId, keyP8 } (P8 private key contents).',
      error: 'BAD_JSON',
    };
  }

  const projectId = await resolveExpoProjectId(opts.userId);
  if (!projectId) {
    return { ok: false, message: 'Link an EAS project first', error: 'NO_PROJECT' };
  }

  try {
    const meta = await expoGraphql<{
      app?: {
        byId?: {
          id: string;
          ownerAccount?: { id: string };
          iosAppCredentialsList?: Array<{
            id: string;
            appleAppIdentifier?: { id?: string; bundleIdentifier?: string | null } | null;
            appStoreConnectApiKeyForSubmissions?: {
              id: string;
              keyIdentifier?: string;
            } | null;
          }>;
        };
      };
    }>(
      token,
      `query($appId: String!) {
        app {
          byId(appId: $appId) {
            id
            ownerAccount { id }
            iosAppCredentialsList {
              id
              appleAppIdentifier { id bundleIdentifier }
              appStoreConnectApiKeyForSubmissions { id keyIdentifier }
            }
          }
        }
      }`,
      { appId: projectId },
    );

    const app = meta.app?.byId;
    const accountId = app?.ownerAccount?.id;
    if (!accountId) {
      return {
        ok: false,
        message: 'Could not resolve Expo account for this project',
        error: 'NO_ACCOUNT',
      };
    }

    const existingList = app?.iosAppCredentialsList ?? [];
    const alreadyAttached = existingList.find(
      (c) => c.appStoreConnectApiKeyForSubmissions?.keyIdentifier === creds.keyId,
    );
    if (alreadyAttached?.appStoreConnectApiKeyForSubmissions?.id) {
      return {
        ok: true,
        keyId: alreadyAttached.appStoreConnectApiKeyForSubmissions.id,
        message:
          'App Store Connect API key already attached on Expo for iOS submissions. Store approval is still Apple’s.',
      };
    }

    const created = await expoGraphql<{
      appStoreConnectApiKey?: {
        createAppStoreConnectApiKey?: { id: string; keyIdentifier?: string };
      };
    }>(
      token,
      `mutation($accountId: ID!, $appStoreConnectApiKeyInput: AppStoreConnectApiKeyInput!) {
        appStoreConnectApiKey {
          createAppStoreConnectApiKey(
            accountId: $accountId
            appStoreConnectApiKeyInput: $appStoreConnectApiKeyInput
          ) {
            id
            keyIdentifier
          }
        }
      }`,
      {
        accountId,
        appStoreConnectApiKeyInput: {
          keyIdentifier: creds.keyId,
          issuerIdentifier: creds.issuerId,
          keyP8: creds.keyP8,
          name: `Xroga ASC ${creds.keyId}`,
          ...(creds.teamId ? { appleTeamId: creds.teamId } : {}),
        },
      },
    );

    const keyId = created.appStoreConnectApiKey?.createAppStoreConnectApiKey?.id;
    if (!keyId) {
      return {
        ok: false,
        message: 'Expo did not return an App Store Connect API key id',
        error: 'CREATE_KEY_FAILED',
      };
    }

    let iosCredsId =
      existingList.find(
        (c) =>
          !opts.bundleIdentifier ||
          c.appleAppIdentifier?.bundleIdentifier === opts.bundleIdentifier,
      )?.id || existingList[0]?.id;

    if (iosCredsId) {
      await expoGraphql(
        token,
        `mutation($iosAppCredentialsId: ID!, $ascApiKeyId: ID!) {
          iosAppCredentials {
            setAppStoreConnectApiKeyForSubmissions(
              id: $iosAppCredentialsId
              ascApiKeyId: $ascApiKeyId
            ) { id }
          }
        }`,
        { iosAppCredentialsId: iosCredsId, ascApiKeyId: keyId },
      );
      return {
        ok: true,
        keyId,
        message:
          'App Store Connect API key uploaded to Expo and attached for iOS submissions. Apple review is still external.',
      };
    }

    const bundleIdentifier =
      opts.bundleIdentifier?.trim() || 'com.xroga.app';

    const appleId = await expoGraphql<{
      appleAppIdentifier?: {
        createAppleAppIdentifier?: { id: string };
      };
    }>(
      token,
      `mutation($accountId: ID!, $appleAppIdentifierInput: AppleAppIdentifierInput!) {
        appleAppIdentifier {
          createAppleAppIdentifier(
            accountId: $accountId
            appleAppIdentifierInput: $appleAppIdentifierInput
          ) { id }
        }
      }`,
      {
        accountId,
        appleAppIdentifierInput: {
          bundleIdentifier,
          ...(creds.teamId ? { appleTeamId: creds.teamId } : {}),
        },
      },
    ).catch(() => null);

    const appleAppIdentifierId =
      appleId?.appleAppIdentifier?.createAppleAppIdentifier?.id;

    if (appleAppIdentifierId) {
      const createdCreds = await expoGraphql<{
        iosAppCredentials?: {
          createIosAppCredentials?: { id: string };
        };
      }>(
        token,
        `mutation(
          $appId: ID!
          $appleAppIdentifierId: ID!
          $iosAppCredentialsInput: IosAppCredentialsInput!
        ) {
          iosAppCredentials {
            createIosAppCredentials(
              appId: $appId
              appleAppIdentifierId: $appleAppIdentifierId
              iosAppCredentialsInput: $iosAppCredentialsInput
            ) { id }
          }
        }`,
        {
          appId: projectId,
          appleAppIdentifierId,
          iosAppCredentialsInput: {
            appStoreConnectApiKeyForSubmissionsId: keyId,
            ...(creds.teamId ? { appleTeamId: creds.teamId } : {}),
          },
        },
      ).catch(() => null);

      if (createdCreds?.iosAppCredentials?.createIosAppCredentials?.id) {
        return {
          ok: true,
          keyId,
          message: `ASC API key uploaded and attached for iOS (${bundleIdentifier}). First App Store listing still needs Apple Developer + ASC app create.`,
        };
      }
    }

    // Key is on the Expo account even if project-level attach needs a one-time Expo UI step
    return {
      ok: true,
      keyId,
      message:
        'ASC API key uploaded to your Expo account. If attach failed, open Expo → Credentials → iOS → set this key for submissions (one-time). Store approval is still Apple’s.',
    };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message,
      error: 'SYNC_FAILED',
    };
  }
}

export type EasBuildInfo = {
  id: string;
  status: string;
  platform?: string;
  artifactUrl?: string;
  buildDetailsPageUrl?: string;
};

/** List recent EAS builds and pick the newest finished artifact. */
export async function listEasBuilds(opts: {
  userId: string;
  limit?: number;
}): Promise<EasBuildInfo[]> {
  const token = await getUserProviderKey(opts.userId, 'expo');
  const projectId = await resolveExpoProjectId(opts.userId);
  if (!token || !projectId) return [];

  const limit = opts.limit ?? 10;
  const res = await expoFetch(
    token,
    `/v2/projects/${encodeURIComponent(projectId)}/builds?limit=${limit}&offset=0`,
  );
  if (!res.ok) {
    // GraphQL fallback
    try {
      const data = await expoGraphql<{
        app?: {
          byId?: {
            builds?: {
              edges?: Array<{
                node?: {
                  id: string;
                  status: string;
                  platform?: string;
                  artifacts?: { buildUrl?: string };
                  appBuildUrl?: string;
                };
              }>;
            };
          };
        };
      }>(
        token,
        `query($appId: String!, $limit: Int!) {
          app {
            byId(appId: $appId) {
              builds(offset: 0, limit: $limit, filter: {}) {
                edges {
                  node {
                    id
                    status
                    platform
                    artifacts { buildUrl }
                  }
                }
              }
            }
          }
        }`,
        { appId: projectId, limit },
      );
      return (data.app?.byId?.builds?.edges ?? [])
        .map((e) => e.node)
        .filter(Boolean)
        .map((n) => ({
          id: n!.id,
          status: n!.status,
          platform: n!.platform,
          artifactUrl: n!.artifacts?.buildUrl,
          buildDetailsPageUrl: `https://expo.dev/projects/${projectId}/builds/${n!.id}`,
        }));
    } catch {
      return [];
    }
  }

  const json = res.json as {
    data?: Array<{
      id?: string;
      status?: string;
      platform?: string;
      artifacts?: { buildUrl?: string; applicationArchiveUrl?: string };
      appBuildUrl?: string;
    }>;
  };
  return (json.data ?? [])
    .filter((b) => b.id)
    .map((b) => ({
      id: b.id!,
      status: b.status || 'unknown',
      platform: b.platform,
      artifactUrl:
        b.artifacts?.buildUrl ||
        b.artifacts?.applicationArchiveUrl ||
        b.appBuildUrl,
      buildDetailsPageUrl: `https://expo.dev/projects/${projectId}/builds/${b.id}`,
    }));
}

export async function waitForEasBuildArtifact(opts: {
  userId: string;
  platform?: 'android' | 'ios';
  timeoutMs?: number;
  intervalMs?: number;
  onProgress?: (msg: string) => void;
}): Promise<{
  ok: boolean;
  build?: EasBuildInfo;
  message: string;
}> {
  const timeoutMs = opts.timeoutMs ?? 12 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 20_000;
  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    opts.onProgress?.(
      `Waiting for EAS ${opts.platform || ''} build artifact (check ${attempt})…`,
    );
    const builds = await listEasBuilds({ userId: opts.userId, limit: 8 });
    const match = builds.find((b) => {
      const status = (b.status || '').toUpperCase();
      const finished = status === 'FINISHED' || status === 'finished';
      const platformOk =
        !opts.platform ||
        (b.platform || '').toLowerCase().includes(opts.platform);
      return finished && platformOk && Boolean(b.artifactUrl || b.buildDetailsPageUrl);
    });
    if (match) {
      return {
        ok: true,
        build: match,
        message: match.artifactUrl
          ? `EAS build finished — install/download: ${match.artifactUrl}`
          : `EAS build finished — open ${match.buildDetailsPageUrl}`,
      };
    }
    const failed = builds.find((b) =>
      /ERROR|ERRORED|CANCELED|CANCELLED/i.test(b.status || ''),
    );
    if (failed && attempt > 2) {
      return {
        ok: false,
        build: failed,
        message: `EAS build ${failed.status}. Open ${failed.buildDetailsPageUrl}`,
      };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return {
    ok: false,
    message:
      'EAS build still running — open expo.dev builds for the install link when green. Xroga will not fake a finished binary.',
  };
}
