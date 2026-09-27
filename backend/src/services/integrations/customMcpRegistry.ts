import { createHash } from 'node:crypto';

import { getSupabaseAdmin } from '../../config/supabase.js';
import {
  ensureGithubSchema,
  githubSchemaAutoBootstrapEnabled,
} from '../../db/ensureGithubSchema.js';
import { isMissingTableError } from './githubTokenStore.js';

const PROVIDER_PREFIX = 'custom_mcp_';

export type CustomMcpAuthMode = 'no_auth' | 'api_key' | 'dcr_oauth';

export interface UserCustomMcp {
  toolkit: string;
  slug: string;
  name: string;
  serverUrl: string;
  authMode: CustomMcpAuthMode;
  createdAt?: string;
}

function normalizeToolkit(value: string): string {
  return value.trim().toUpperCase();
}

function providerForToolkit(toolkit: string): string {
  return `${PROVIDER_PREFIX}${normalizeToolkit(toolkit).toLowerCase()}`;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/^CUSTOM_/, '')
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42);
}

export function userScopedCustomMcpSlug(userId: string, requested: string): string {
  const base = normalizeSlug(requested);
  if (base.length < 2) {
    throw new Error('Custom Plugin slug must contain at least 2 letters or numbers.');
  }
  const userHash = createHash('sha256').update(userId).digest('hex').slice(0, 10).toUpperCase();
  return `XROGA_${userHash}_${base}`;
}

function rowToCustomMcp(row: {
  provider?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
}): UserCustomMcp | null {
  const metadata = row.metadata ?? {};
  const toolkit =
    typeof metadata.toolkit === 'string'
      ? normalizeToolkit(metadata.toolkit)
      : typeof row.provider === 'string' && row.provider.startsWith(PROVIDER_PREFIX)
        ? normalizeToolkit(row.provider.slice(PROVIDER_PREFIX.length))
        : '';

  if (!toolkit.startsWith('CUSTOM_')) return null;

  const serverUrl = typeof metadata.server_url === 'string' ? metadata.server_url : '';
  const name =
    typeof metadata.name === 'string' && metadata.name.trim()
      ? metadata.name.trim()
      : toolkit
          .replace(/^CUSTOM_XROGA_[A-F0-9]+_/, '')
          .split('_')
          .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
          .join(' ');
  const authMode =
    metadata.auth_mode === 'api_key' || metadata.auth_mode === 'dcr_oauth'
      ? metadata.auth_mode
      : 'no_auth';

  return {
    toolkit,
    slug: toolkit.replace(/^CUSTOM_/, ''),
    name,
    serverUrl,
    authMode,
    createdAt:
      typeof metadata.created_at === 'string'
        ? metadata.created_at
        : row.created_at ?? undefined,
  };
}

export function validatePublicMcpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('MCP server URL must be a valid HTTPS URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Custom MCP servers must use public HTTPS.');
  }

  const host = url.hostname.toLowerCase();
  const blocked =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal');

  if (blocked) {
    throw new Error('Custom MCP server must be reachable on the public internet.');
  }

  return url.toString();
}

async function ensureTableIfNeeded(): Promise<void> {
  if (githubSchemaAutoBootstrapEnabled()) {
    await ensureGithubSchema();
  }
}

export async function listUserCustomMcps(userId: string): Promise<UserCustomMcp[]> {
  const supabase = getSupabaseAdmin();
  let { data, error } = await supabase
    .from('user_integrations')
    .select('provider, metadata, created_at')
    .eq('user_id', userId)
    .like('provider', `${PROVIDER_PREFIX}%`);

  if (error && isMissingTableError(error.message)) {
    await ensureTableIfNeeded();
    ({ data, error } = await supabase
      .from('user_integrations')
      .select('provider, metadata, created_at')
      .eq('user_id', userId)
      .like('provider', `${PROVIDER_PREFIX}%`));
  }

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) =>
      rowToCustomMcp(
        row as {
          provider?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string | null;
        },
      ),
    )
    .filter((item): item is UserCustomMcp => Boolean(item));
}

export async function listUserCustomMcpToolkitSlugs(userId: string): Promise<string[]> {
  return (await listUserCustomMcps(userId)).map((item) => item.toolkit);
}

export async function ownsCustomMcpToolkit(
  userId: string,
  toolkit: string,
): Promise<boolean> {
  const clean = normalizeToolkit(toolkit);
  if (!clean.startsWith('CUSTOM_')) return true;
  const owned = await listUserCustomMcpToolkitSlugs(userId);
  return owned.includes(clean);
}

export async function assertCustomMcpOwnership(
  userId: string,
  toolkit: string,
): Promise<void> {
  if (!(await ownsCustomMcpToolkit(userId, toolkit))) {
    const error = new Error('Custom Plugin not found.');
    (error as Error & { status?: number; code?: string }).status = 404;
    (error as Error & { status?: number; code?: string }).code = 'CUSTOM_MCP_NOT_FOUND';
    throw error;
  }
}

export async function saveUserCustomMcp(
  userId: string,
  input: {
    toolkit: string;
    name: string;
    serverUrl: string;
    authMode: CustomMcpAuthMode;
  },
): Promise<UserCustomMcp> {
  const toolkit = normalizeToolkit(input.toolkit);
  if (!toolkit.startsWith('CUSTOM_')) {
    throw new Error('External provider did not return a Custom Plugin identifier.');
  }

  await ensureTableIfNeeded();

  const supabase = getSupabaseAdmin();
  const createdAt = new Date().toISOString();
  const row = {
    user_id: userId,
    provider: providerForToolkit(toolkit),
    access_token: 'xroga-custom-mcp',
    metadata: {
      type: 'xroga_custom_mcp',
      toolkit,
      name: input.name.trim(),
      server_url: input.serverUrl,
      auth_mode: input.authMode,
      created_at: createdAt,
    },
  };

  let { error } = await supabase.from('user_integrations').upsert(row, {
    onConflict: 'user_id,provider',
  });

  if (error && isMissingTableError(error.message)) {
    await ensureGithubSchema();
    ({ error } = await supabase.from('user_integrations').upsert(row, {
      onConflict: 'user_id,provider',
    }));
  }

  if (error) throw new Error(error.message);

  return {
    toolkit,
    slug: toolkit.replace(/^CUSTOM_/, ''),
    name: input.name.trim(),
    serverUrl: input.serverUrl,
    authMode: input.authMode,
    createdAt,
  };
}

export async function deleteUserCustomMcpRecord(
  userId: string,
  toolkit: string,
): Promise<void> {
  const clean = normalizeToolkit(toolkit);
  await assertCustomMcpOwnership(userId, clean);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', providerForToolkit(clean));

  if (error && !isMissingTableError(error.message)) {
    throw new Error(error.message);
  }
}

export function isCustomMcpToolkit(toolkit: string): boolean {
  return normalizeToolkit(toolkit).startsWith('CUSTOM_');
}
