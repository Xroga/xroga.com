/**
 * Push user vault store credentials into Expo/EAS (real GraphQL),
 * poll finished builds for install/artifact URLs, and drive submit workflows.
 */

import {
  getUserProviderKey,
} from '../integrations/userProviderKeys.js';
import { resolveExpoProjectId } from './easPublish.js';

const EXPO_API = 'https://api.expo.dev';

/** Match Expo scaffold package/bundle: com.xroga.<slug> */
export function packageIdFromProjectName(name?: string | null): string {
  const slug = String(name || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);
  return `com.xroga.${slug || 'app'}`;
}

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
  if (!res.ok || !body || body.errors?.length) {
    throw new Error('Expo credential request failed');
  }
  if (!body.data) throw new Error('Expo GraphQL returned no data');
  return body.data;
}

function selectCredentialTarget<T extends {id:string}>(rows:T[], requested:string|undefined, identifier:(row:T)=>string|null|undefined):T|undefined {
  if (!Array.isArray(rows) || rows.some(row=>!row || !validExpoId(row.id) || typeof identifier(row)!=='string' || !identifier(row))
    || new Set(rows.map(row=>row.id)).size!==rows.length) throw new Error('Invalid Expo credential catalogue');
  const matches=requested?rows.filter(row=>identifier(row)===requested):rows;
  if(matches.length>1 || (!requested && matches.length===0))throw new Error('Explicit application identifier required');
  return matches[0];
}
function validExpoId(value:unknown):value is string { return typeof value==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }

/** Upload Google Play service-account JSON into Expo and attach for submissions. */
export async function syncGooglePlayCredentialsToExpo(opts: {
  userId: string;
  applicationIdentifier?: string;
  projectName?: string;
  projectId?: string;
}): Promise<{ ok: boolean; message: string; error?: string }> {
  opts={...opts};
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

  const projectId = await resolveExpoProjectId(opts.userId,opts.projectId);
  if (!projectId) {
    return { ok: false, message: 'Link an EAS project first', error: 'NO_PROJECT' };
  }

  try {
    // Resolve account + android credentials for this app (always unwrap byId)
    type AppCredsShape = {
      id: string;
      ownerAccount?: { id: string; name?: string };
      androidAppCredentialsList?: Array<{
        id: string;
        applicationIdentifier?: string | null;
      }>;
    };
    const meta = await expoGraphql<{ app?: { byId?: AppCredsShape | null } }>(
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
    );

    const app = meta.app?.byId ?? null;
    const accountId = app?.ownerAccount?.id;
    if (app?.id !== projectId || !validExpoId(accountId)) {
      return {
        ok: false,
        message: 'Could not resolve Expo account for this project',
        error: 'NO_ACCOUNT',
      };
    }

    const requested=opts.applicationIdentifier?.trim() || (opts.projectName?packageIdFromProjectName(opts.projectName):undefined);
    const selected=selectCredentialTarget(app.androidAppCredentialsList ?? [],requested,row=>row.applicationIdentifier);
    let androidCredsId=selected?.id;

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
            googleServiceAccountKeyInput: { jsonKey: $jsonKey }
          ) { id }
        }
      }`,
      { accountId, jsonKey: parsed },
    );

    const keyId = created.googleServiceAccountKey?.createGoogleServiceAccountKey?.id;
    if (!validExpoId(keyId)) {
      return {
        ok: false,
        message: 'Expo did not return a Google service account key id',
        error: 'CREATE_KEY_FAILED',
      };
    }

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
              applicationIdentifier: $applicationIdentifier
              androidAppCredentialsInput: {}
            ) { id }
          }
        }`,
        {
          appId: projectId,
          applicationIdentifier:
            requested!,
        },
      ).catch(() => null);
      androidCredsId =
        createdCreds?.androidAppCredentials?.createAndroidAppCredentials?.id;
    }

    if (validExpoId(androidCredsId)) {
      const attached=await expoGraphql<{androidAppCredentials?:{setGoogleServiceAccountKeyForSubmissions?:{id?:string}}}>(
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
      if(attached.androidAppCredentials?.setGoogleServiceAccountKeyForSubmissions?.id!==androidCredsId)throw new Error('Expo attachment unverified');
    }
    else throw new Error('Expo attachment missing');

    // The original credential was only read, not rotated. Writing it back after
    // remote work could resurrect a key the user revoked while upload was pending.

    return {
      ok: true,
      message:
        'Google Play service account uploaded to Expo/EAS for submissions. First Play listing still needs a one-time manual create in Play Console.',
    };
  } catch (err) {
    return {
      ok: false,
      message: 'Expo credential attachment could not be verified. Uploaded keys may require cleanup in Expo.',
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
  projectName?: string;
  projectId?: string;
}): Promise<{ ok: boolean; message: string; error?: string; keyId?: string }> {
  opts={...opts};
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

  const projectId = await resolveExpoProjectId(opts.userId,opts.projectId);
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
    if (app?.id !== projectId || !validExpoId(accountId)) {
      return {
        ok: false,
        message: 'Could not resolve Expo account for this project',
        error: 'NO_ACCOUNT',
      };
    }

    const existingList = app?.iosAppCredentialsList ?? [];
    const requested=opts.bundleIdentifier?.trim() || (opts.projectName?packageIdFromProjectName(opts.projectName):undefined);
    const selected=selectCredentialTarget(existingList,requested,row=>row.appleAppIdentifier?.bundleIdentifier);
    const alreadyAttached=selected?.appStoreConnectApiKeyForSubmissions?.keyIdentifier===creds.keyId?selected:undefined;
    if (validExpoId(alreadyAttached?.appStoreConnectApiKeyForSubmissions?.id)) {
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
    if (!validExpoId(keyId) || created.appStoreConnectApiKey?.createAppStoreConnectApiKey?.keyIdentifier !== creds.keyId) {
      return {
        ok: false,
        message: 'Expo did not return an App Store Connect API key id',
        error: 'CREATE_KEY_FAILED',
      };
    }

    const iosCredsId = selected?.id;

    if (iosCredsId) {
      const attached=await expoGraphql<{iosAppCredentials?:{setAppStoreConnectApiKeyForSubmissions?:{id?:string}}}>(
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
      if(attached.iosAppCredentials?.setAppStoreConnectApiKeyForSubmissions?.id!==iosCredsId)throw new Error('Expo attachment unverified');
      return {
        ok: true,
        keyId,
        message:
          'App Store Connect API key uploaded to Expo and attached for iOS submissions. Apple review is still external.',
      };
    }

    const bundleIdentifier =
      requested!;

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

    if (validExpoId(appleAppIdentifierId)) {
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

      if (validExpoId(createdCreds?.iosAppCredentials?.createIosAppCredentials?.id)) {
        return {
          ok: true,
          keyId,
          message: `ASC API key uploaded and attached for iOS (${bundleIdentifier}). First App Store listing still needs Apple Developer + ASC app create.`,
        };
      }
    }

    // Key is on the Expo account even if project-level attach needs a one-time Expo UI step
    return {
      ok: false,
      keyId,
      error: 'ATTACHMENT_UNVERIFIED',
      message:
        'ASC API key uploaded to your Expo account. If attach failed, open Expo → Credentials → iOS → set this key for submissions (one-time). Store approval is still Apple’s.',
    };
  } catch (err) {
    return {
      ok: false,
      message: 'Expo credential attachment could not be verified. Uploaded keys may require cleanup in Expo.',
      error: 'SYNC_FAILED',
    };
  }
}

export type EasBuildInfo = {
  id: string;
  projectId?: string;
  status: string;
  platform?: string;
  artifactUrl?: string;
  buildDetailsPageUrl?: string;
  createdAt?: string;
};

/** List recent EAS builds and pick the newest finished artifact. */
export async function listEasBuilds(opts: {
  userId: string;
  limit?: number;
  projectId?: string;
}): Promise<EasBuildInfo[]> {
  opts={...opts};
  const token = await getUserProviderKey(opts.userId, 'expo');
  const projectId = await resolveExpoProjectId(opts.userId,opts.projectId);
  if (!token || !projectId) return [];

  const limit = Math.max(1,Math.min(100,Math.trunc(opts.limit ?? 10)));
  const res = await expoFetch(
    token,
    `/v2/projects/${encodeURIComponent(projectId)}/builds?limit=${limit}&offset=0`,
  );
  const restRows=(res.json as {data?:unknown}|null)?.data;
  if (!res.ok || !Array.isArray(restRows) || verifiedBuilds(restRows,projectId).length!==restRows.length) {
    // GraphQL fallback
    try {
      const data = await expoGraphql<{
        app?: {
          byId?: {
            id?: string;
            builds?: Array<{
                  id: string;
                  app?: {id?:string};
                  status: string;
                  platform?: string;
                  createdAt?: string;
                  artifacts?: { buildUrl?: string };
                  appBuildUrl?: string;
                }>;
          };
        };
      }>(
        token,
        `query($appId: String!, $limit: Int!) {
          app {
            byId(appId: $appId) {
              id
              builds(offset: 0, limit: $limit, filter: {}) {
                    id
                    app { id }
                    status
                    platform
                    createdAt
                    artifacts { buildUrl }
              }
            }
          }
        }`,
        { appId: projectId, limit },
      );
      if(data.app?.byId?.id!==projectId)return [];
      return verifiedBuilds(data.app.byId.builds,projectId);
    } catch {
      return [];
    }
  }

  const json = res.json as {
    data?: Array<{
      id?: string;
      app?: {id?:string};
      status?: string;
      platform?: string;
      createdAt?: string;
      artifacts?: { buildUrl?: string; applicationArchiveUrl?: string };
      appBuildUrl?: string;
    }>;
  };
  return verifiedBuilds(json?.data,projectId);
}

function verifiedBuilds(value:unknown,projectId:string):EasBuildInfo[]{
  if(!Array.isArray(value))return [];
  const result:EasBuildInfo[]=[];
  for(const row of value){
    if(!row||!validExpoId(row.id)||row.app?.id!==projectId||typeof row.status!=='string'
      ||!['ANDROID','IOS'].includes(String(row.platform).toUpperCase())||typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt)))return [];
    const artifact=row.artifacts?.buildUrl||row.artifacts?.applicationArchiveUrl;
    if(artifact!=null){try{const url=new URL(artifact);if(url.protocol!=='https:'||url.username||url.password) return [];}catch{return [];}}
    result.push({id:row.id,projectId,status:row.status,platform:row.platform,createdAt:row.createdAt,artifactUrl:artifact,
      buildDetailsPageUrl:`https://expo.dev/projects/${encodeURIComponent(projectId)}/builds/${encodeURIComponent(row.id)}`});
  }
  return new Set(result.map(row=>row.id)).size===result.length?result:[];
}

export async function waitForEasBuildArtifact(opts: {
  userId: string;
  projectId?: string;
  platform?: 'android' | 'ios';
  timeoutMs?: number;
  intervalMs?: number;
  /** Build IDs that already existed at dispatch — ignore finished ones among these */
  ignoreBuildIds?: string[];
  /** Only accept builds created at/after this ms epoch (when known) */
  startedAfterMs?: number;
  onProgress?: (msg: string) => void;
}): Promise<{
  ok: boolean;
  build?: EasBuildInfo;
  message: string;
}> {
  opts={...opts,ignoreBuildIds:opts.ignoreBuildIds?[...opts.ignoreBuildIds]:undefined};
  const projectId=await resolveExpoProjectId(opts.userId,opts.projectId);
  if(!projectId)return {ok:false,message:'No EAS project selected for build polling.'};
  const timeoutMs = opts.timeoutMs ?? 12 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 20_000;
  const started = Date.now();
  const startedAfterMs = opts.startedAfterMs ?? started - 30_000;
  let attempt = 0;

  // Snapshot baseline if caller didn't pass one
  let ignore = new Set(opts.ignoreBuildIds || []);
  if (opts.ignoreBuildIds === undefined) {
    const prior = await listEasBuilds({ userId: opts.userId, projectId, limit: 8 });
    ignore = new Set(prior.map((b) => b.id));
  }

  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    opts.onProgress?.(
      `Waiting for EAS ${opts.platform || ''} build artifact (check ${attempt})…`,
    );
    const builds = await listEasBuilds({ userId: opts.userId, projectId, limit: 12 });

    const platformMatch = (b: EasBuildInfo) =>
      !opts.platform || (b.platform || '').toLowerCase()===opts.platform;

    const isNewEnough = (b: EasBuildInfo) => {
      const created=Date.parse(b.createdAt??'');
      return b.projectId===projectId && !ignore.has(b.id) && Number.isFinite(created) && created>=startedAfterMs;
    };

    const inFlight = builds.find((b) => {
      const status = (b.status || '').toUpperCase();
      return (
        platformMatch(b) &&
        isNewEnough(b) &&
        /NEW|IN_QUEUE|IN_PROGRESS|PENDING|ERRORED_WAITING|REQUESTED/i.test(status)
      );
    });

    const finishedNew = builds.find((b) => {
      const status = (b.status || '').toUpperCase();
      const finished = status === 'FINISHED' || status === 'finished';
      return finished && platformMatch(b) && isNewEnough(b);
    });

    if (finishedNew) {
      return {
        ok: true,
        build: finishedNew,
        message: finishedNew.artifactUrl
          ? `EAS build finished — install/download: ${finishedNew.artifactUrl}`
          : `EAS build finished — open ${finishedNew.buildDetailsPageUrl}`,
      };
    }

    // Only fail on a *new* errored build (not an old one from baseline)
    const failedNew = builds.find((b) => {
      if (!platformMatch(b) || !isNewEnough(b)) return false;
      return /ERROR|ERRORED|CANCELED|CANCELLED/i.test(b.status || '');
    });
    if (failedNew && attempt > 2 && !inFlight) {
      return {
        ok: false,
        build: failedNew,
        message: `EAS build ${failedNew.status}. Open ${failedNew.buildDetailsPageUrl}`,
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
