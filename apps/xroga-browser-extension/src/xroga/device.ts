import { BROWSER_API_ORIGIN } from './workspace';

const DEVICE_KEY = 'xroga-browser-device-v1';
export const PAIR_KEY = 'xroga-browser-account';
export const DEVICE_PROFILE = 'xroga-browser-device-profile';
const BASE = BROWSER_API_ORIGIN && BROWSER_API_ORIGIN + '/api/browser/local';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_-]{43}$/;

type Device = { account: string; deviceId: string; deviceKey: string };
type Access = { account: string; value: string; expires: number };
let access: Access | undefined;
let refreshing: Promise<Access> | undefined;
let switching = false;
let nextStatusCheck = 0;
let valid = false;

class DeviceError extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail?: Record<string, string[]>) { super(code); }
}

/** Only short lists of names (never values) are kept from an error body: the arguments a tool does not define or still needs. */
function safeDetail(body: unknown): Record<string, string[]> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const out: Record<string, string[]> = {};
  const reason = (body as Record<string, unknown>).reason;
  if (typeof reason === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(reason)) out.reason = [reason];
  if (typeof (body as Record<string, unknown>).providerMessage === 'string') out.providerMessage = [((body as Record<string, string>).providerMessage).slice(0, 300)];
  for (const key of ['unknown', 'missing', 'allowed']) {
    const value = (body as Record<string, unknown>)[key];
    if (Array.isArray(value)) out[key] = value.filter((x): x is string => typeof x === 'string' && x.length <= 80).slice(0, key === 'allowed' ? 40 : 12);
  }
  return Object.keys(out).length ? out : undefined;
}

async function request(path: string, method: string, data?: unknown, bearer?: string, signal?: AbortSignal) {
  if (!BASE) throw new Error('This build has no direct Xroga API configured.');
  const response = await fetch(BASE + path, {
    method,
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.any([AbortSignal.timeout(85_000), ...(signal ? [signal] : [])]),
  });
  if (response.status === 204) return;
  const result = await response.json();
  if (!response.ok) throw new DeviceError(response.status, result.error ?? 'BROWSER_DEVICE_UNAVAILABLE', safeDetail(result));
  return result;
}

export function directConfigured() { return !!BASE; }

export function directReady() { return valid && !switching; }

export async function savedDevice(): Promise<Device | undefined> {
  const value = (await chrome.storage.local.get(DEVICE_KEY))[DEVICE_KEY] as Device | undefined;
  return value && UUID.test(value.account) && UUID.test(value.deviceId) && KEY.test(value.deviceKey) ? value : undefined;
}

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function deviceProof() {
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

function validateAccess(data: { account?: string; access?: string; expiresIn?: number }, account: string): Access {
  if (data?.account !== account || !/^xroga_browser_[A-Za-z0-9_-]{43}$/.test(data.access ?? '') || data.expiresIn !== 300) {
    throw new Error('Xroga returned an invalid device session.');
  }
  return { account, value: data.access!, expires: Date.now() + 280_000 };
}

export async function enrollDevice(account: string, verifier: string, result: unknown) {
  if (switching) throw new Error('Xroga is changing accounts.');
  const code = (result as { code?: string } | null)?.code;
  if (!code || !KEY.test(code)) throw new Error('Xroga returned an invalid authorization code.');
  const data = await request('/device/exchange', 'POST', { account, code, verifier });
  const token = validateAccess(data, account);
  if (!UUID.test(data.deviceId) || !KEY.test(data.deviceKey)) throw new Error('Xroga returned an invalid device credential.');
  const device: Device = { account, deviceId: data.deviceId, deviceKey: data.deviceKey };
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const firstOwner = (await chrome.storage.local.get(DEVICE_PROFILE))[DEVICE_PROFILE];
  await chrome.storage.local.set({ [DEVICE_KEY]: device, [PAIR_KEY]: account, [DEVICE_PROFILE]: firstOwner ?? account });
  access = token;
  valid = true;
  nextStatusCheck = Date.now() + 30_000;
}

async function currentAccess(device: Device, stale?: Access): Promise<Access> {
  if (switching) throw new Error('Xroga is signing out.');
  if (access && access !== stale && access.account === device.account && access.expires > Date.now()) return access;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const data = await request('/device/refresh', 'POST', { deviceId: device.deviceId, deviceKey: device.deviceKey });
      if (switching) throw new Error('Xroga is signing out.');
      access = validateAccess(data, device.account);
      valid = true;
      return access;
    } catch (error) {
      valid = false;
      access = undefined;
      throw error;
    }
  })().finally(() => { refreshing = undefined; });
  return refreshing;
}

export async function verifyDevice() {
  const device = BASE && await savedDevice();
  if (!device || switching) return false;
  if (valid && nextStatusCheck > Date.now()) return true;
  if (nextStatusCheck > Date.now()) return false;
  nextStatusCheck = Date.now() + 30_000;
  try {
    const session = await deviceRequest(device, '/session', 'GET') as { account?: string };
    valid = session?.account === device.account;
  } catch {
    valid = false;
  }
  return valid;
}

export async function deviceRequest(device: Device, path: string, method: string, data?: unknown, signal?: AbortSignal) {
  const token = await currentAccess(device);
  if (switching) throw new Error('Xroga is signing out.');
  try {
    return await request(path, method, data, token.value, signal);
  } catch (error) {
    // This specific code is emitted before the task handler runs. Never replay a timeout or provider failure.
    if (!(error instanceof DeviceError) || error.status !== 401 || error.code !== 'BROWSER_DEVICE_AUTH_REQUIRED') throw error;
    const replacement = await currentAccess(device, token);
    if (switching) throw new Error('Xroga is signing out.');
    return request(path, method, data, replacement.value, signal);
  }
}

export async function revokeDevice() {
  switching = true;
  try {
    const device = await savedDevice();
    if (device) await request('/device/revoke', 'POST', { deviceId: device.deviceId, deviceKey: device.deviceKey });
    await chrome.storage.local.remove([DEVICE_KEY, PAIR_KEY]);
    valid = false;
    access = undefined;
    nextStatusCheck = 0;
  } finally {
    switching = false;
  }
}
