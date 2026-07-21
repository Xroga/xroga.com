/**
 * Chrome Web Store Publish API (v2 upload + publish).
 * Real submit only — Google still reviews; we never fake “live in store”.
 *
 * Prerequisites (user’s Google Cloud + CWS developer account ~$5):
 * - OAuth client + refresh token with scope chromewebstore
 * - Extension already created once in CWS dashboard (API cannot finish first listing metadata)
 * - Publisher ID + Extension (item) ID
 */

import {
  getUserProviderKey,
  saveUserProviderKey,
} from '../integrations/userProviderKeys.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

export type CwsCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  extensionId: string;
  /** publishers/{publisherId} or bare publisher id */
  publisherId: string;
};

export async function getCwsCredentials(userId: string): Promise<CwsCredentials | null> {
  const raw = await getUserProviderKey(userId, 'cws_oauth');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CwsCredentials>;
    if (
      !parsed.clientId?.trim() ||
      !parsed.clientSecret?.trim() ||
      !parsed.refreshToken?.trim() ||
      !parsed.extensionId?.trim() ||
      !parsed.publisherId?.trim()
    ) {
      return null;
    }
    return {
      clientId: parsed.clientId.trim(),
      clientSecret: parsed.clientSecret.trim(),
      refreshToken: parsed.refreshToken.trim(),
      extensionId: parsed.extensionId.trim(),
      publisherId: parsed.publisherId.trim().replace(/^publishers\//, ''),
    };
  } catch {
    return null;
  }
}

export async function saveCwsCredentials(
  userId: string,
  creds: CwsCredentials,
): Promise<void> {
  await saveUserProviderKey(
    userId,
    'cws_oauth',
    JSON.stringify({
      clientId: creds.clientId.trim(),
      clientSecret: creds.clientSecret.trim(),
      refreshToken: creds.refreshToken.trim(),
      extensionId: creds.extensionId.trim(),
      publisherId: creds.publisherId.trim().replace(/^publishers\//, ''),
    }),
  );
}

async function refreshAccessToken(creds: CwsCredentials): Promise<string> {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Chrome Web Store OAuth failed (${res.status}) — check client id/secret/refresh token`,
    );
  }
  return json.access_token;
}

function itemName(creds: CwsCredentials): string {
  return `publishers/${creds.publisherId}/items/${creds.extensionId}`;
}

export type CwsPublishResult = {
  ok: boolean;
  submitted: boolean;
  uploadState?: string;
  itemId?: string;
  dashboardUrl?: string;
  message: string;
  error?: string;
};

/**
 * Upload extension.zip then submit for CWS review (publish).
 * Does NOT mean the extension is public yet — Google review is separate.
 */
export async function publishChromeExtensionToStore(opts: {
  userId: string;
  zip: Buffer;
}): Promise<CwsPublishResult> {
  const creds = await getCwsCredentials(opts.userId);
  if (!creds) {
    return {
      ok: false,
      submitted: false,
      message:
        'Connect Chrome Web Store credentials in Publish (OAuth client + refresh token + extension ID + publisher ID). Create the listing once in the CWS dashboard first (~$5).',
      error: 'NO_CWS_CREDS',
    };
  }
  if (opts.zip.length < 64) {
    return {
      ok: false,
      submitted: false,
      message: 'extension.zip is empty',
      error: 'EMPTY_ZIP',
    };
  }

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(creds);
  } catch (err) {
    return {
      ok: false,
      submitted: false,
      message: (err as Error).message,
      error: 'OAUTH_FAILED',
    };
  }

  const name = itemName(creds);
  const uploadUrl = `https://chromewebstore.googleapis.com/upload/v2/${name}:upload`;
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/zip',
      'x-goog-api-version': '2',
    },
    body: opts.zip,
  });
  const uploadJson = (await upload.json().catch(() => ({}))) as {
    uploadState?: string;
    itemId?: string;
    error?: { message?: string };
    message?: string;
  };
  if (!upload.ok) {
    return {
      ok: false,
      submitted: false,
      message:
        uploadJson.error?.message ||
        uploadJson.message ||
        `CWS upload failed (${upload.status})`,
      error: 'UPLOAD_FAILED',
      dashboardUrl: `https://chrome.google.com/webstore/devconsole/${creds.extensionId}`,
    };
  }

  const publishUrl = `https://chromewebstore.googleapis.com/v2/${name}:publish`;
  const publish = await fetch(publishUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-goog-api-version': '2',
    },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
  });
  const publishJson = (await publish.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
    status?: string;
  };
  if (!publish.ok) {
    return {
      ok: true,
      submitted: false,
      uploadState: uploadJson.uploadState,
      itemId: uploadJson.itemId || creds.extensionId,
      dashboardUrl: `https://chrome.google.com/webstore/devconsole/${creds.extensionId}`,
      message:
        `Zip uploaded to CWS, but publish/submit failed: ${
          publishJson.error?.message || publishJson.message || publish.status
        }. Open the developer dashboard to finish submit.`,
      error: 'PUBLISH_FAILED',
    };
  }

  return {
    ok: true,
    submitted: true,
    uploadState: uploadJson.uploadState,
    itemId: uploadJson.itemId || creds.extensionId,
    dashboardUrl: `https://chrome.google.com/webstore/devconsole/${creds.extensionId}`,
    message:
      'Submitted to Chrome Web Store for Google review. Listing goes public only after Google approves — Xroga cannot skip review.',
  };
}

export { CWS_SCOPE };
