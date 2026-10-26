import { ComposioClientError, composioRequest } from './composioClient.js';
import { readComposioCapabilityFlags } from './composioPolicy.js';

/**
 * Several connected accounts for one user and toolkit (a work and a personal Gmail).
 * https://docs.composio.dev/docs/authentication/managing-multiple-connected-accounts.md
 *
 * Tenant isolation rules, because Composio's own account listing is not enough on its own:
 *  - The listing is filtered by the caller's Composio user id (`xroga:<user>`), and only PRIVATE accounts
 *    are requested (`account_type` omitted returns PRIVATE only; a SHARED account is reachable by other
 *    users through an ACL and is never offered or accepted).
 *  - The per-item `user_id` field is deprecated and may disappear, so it is never relied on. When it IS
 *    present and differs from the caller's, the item is dropped.
 *  - An account id supplied by a request is only ever used if it is in this freshly fetched, filtered list.
 */

export interface XrogaConnectedAccount {
  readonly id: string;
  readonly toolkit: string;
  readonly alias: string | null;
  /** Provider-identity label such as `gmail_red-castle`, safe to show next to an alias. */
  readonly label: string | null;
  readonly status: 'ACTIVE';
}

interface AccountListResponse {
  items?: Array<{
    id?: string;
    toolkit?: { slug?: string };
    alias?: string | null;
    word_id?: string | null;
    user_id?: string;
    status?: string;
    is_disabled?: boolean;
    experimental?: { account_type?: string };
  }>;
}

const ACCOUNT_ID = /^[A-Za-z0-9_-]{4,64}$/;
const ALIAS = /^[a-z0-9][a-z0-9-]{1,39}$/;
const TOOLKIT = /^[a-z0-9][a-z0-9_-]{1,79}$/;
/** Matches the session's max_accounts_per_toolkit. */
export const MAX_ACCOUNTS_PER_TOOLKIT = 5;

function composioUserOf(userId: string): string {
  const clean = userId.trim();
  if (!clean) throw new ComposioClientError('Authenticated Xroga user is required.', { status: 401, code: 'XROGA_USER_REQUIRED' });
  return `xroga:${clean}`;
}

export function cleanAlias(alias: string): string {
  const clean = alias.trim().toLowerCase();
  if (!ALIAS.test(clean)) {
    throw new ComposioClientError('An account name uses 2 to 40 lowercase letters, numbers or hyphens.', { status: 400, code: 'INVALID_COMPOSIO_ALIAS' });
  }
  return clean;
}

export async function listComposioConnectedAccounts(userId: string, input: { toolkit: string }): Promise<XrogaConnectedAccount[]> {
  const owner = composioUserOf(userId);
  const toolkit = input.toolkit.trim().toLowerCase();
  if (!TOOLKIT.test(toolkit)) throw new ComposioClientError('Invalid integration identifier.', { status: 400, code: 'INVALID_COMPOSIO_TOOLKIT' });
  const query = new URLSearchParams({ limit: '50', order_by: 'created_at', order_direction: 'desc' });
  query.append('user_ids', owner);
  query.append('toolkit_slugs', toolkit);
  query.append('statuses', 'ACTIVE');
  const response = await composioRequest<AccountListResponse>(`/connected_accounts?${query.toString()}`);
  const accounts: XrogaConnectedAccount[] = [];
  for (const item of response.items ?? []) {
    if (typeof item.id !== 'string' || !ACCOUNT_ID.test(item.id)) continue;
    if (item.status !== 'ACTIVE' || item.is_disabled === true) continue;
    if (item.toolkit?.slug?.toLowerCase() !== toolkit) continue;
    if (item.experimental?.account_type && item.experimental.account_type !== 'PRIVATE') continue;
    if (typeof item.user_id === 'string' && item.user_id !== owner) continue;
    accounts.push({
      id: item.id,
      toolkit,
      alias: typeof item.alias === 'string' && ALIAS.test(item.alias) ? item.alias : null,
      label: typeof item.word_id === 'string' && /^[a-z0-9_-]{3,80}$/i.test(item.word_id) ? item.word_id : null,
      status: 'ACTIVE',
    });
  }
  return accounts.slice(0, MAX_ACCOUNTS_PER_TOOLKIT);
}

/**
 * Chooses the account a tool call runs as. With multi-account off, Composio's single most-recent account
 * is used and nothing is passed. With it on and several accounts, the caller must name one, and it must be theirs.
 */
export async function resolveComposioAccountSelection(
  userId: string,
  input: { toolkit: string; requestedAccountId?: string | null },
  list: typeof listComposioConnectedAccounts = listComposioConnectedAccounts,
): Promise<{ accountId: string | null; accounts: XrogaConnectedAccount[] }> {
  if (!readComposioCapabilityFlags().multiAccount) {
    // Never accept a request-supplied account id that has not been proven to be the caller's.
    if (input.requestedAccountId) throw new ComposioClientError('Multiple accounts are not enabled.', { status: 403, code: 'COMPOSIO_MULTI_ACCOUNT_DISABLED' });
    return { accountId: null, accounts: [] };
  }
  const accounts = await list(userId, { toolkit: input.toolkit });
  if (input.requestedAccountId) {
    if (!accounts.some((account) => account.id === input.requestedAccountId)) {
      throw new ComposioClientError('That connected account is not available to you.', { status: 403, code: 'COMPOSIO_ACCOUNT_NOT_OWNED' });
    }
    return { accountId: input.requestedAccountId, accounts };
  }
  if (accounts.length > 1) {
    throw new ComposioClientError('Several accounts are connected for this app. Choose which one to use.', { status: 409, code: 'COMPOSIO_ACCOUNT_SELECTION_REQUIRED' });
  }
  return { accountId: accounts[0]?.id ?? null, accounts };
}

/** Names an account (for example `work-gmail`). The account must be in the caller's own list. */
export async function setComposioAccountAlias(
  userId: string,
  input: { toolkit: string; accountId: string; alias: string | null },
  list: typeof listComposioConnectedAccounts = listComposioConnectedAccounts,
): Promise<XrogaConnectedAccount> {
  if (!readComposioCapabilityFlags().multiAccount) {
    throw new ComposioClientError('Multiple accounts are not enabled.', { status: 403, code: 'COMPOSIO_MULTI_ACCOUNT_DISABLED' });
  }
  const alias = input.alias === null ? null : cleanAlias(input.alias);
  const accounts = await list(userId, { toolkit: input.toolkit });
  const target = accounts.find((account) => account.id === input.accountId);
  if (!target) throw new ComposioClientError('That connected account is not available to you.', { status: 403, code: 'COMPOSIO_ACCOUNT_NOT_OWNED' });
  if (alias && accounts.some((account) => account.id !== target.id && account.alias === alias)) {
    throw new ComposioClientError('Another account already uses that name.', { status: 409, code: 'COMPOSIO_ALIAS_IN_USE' });
  }
  await composioRequest(`/connected_accounts/${encodeURIComponent(target.id)}`, { method: 'PATCH', body: { alias } });
  return { ...target, alias };
}
