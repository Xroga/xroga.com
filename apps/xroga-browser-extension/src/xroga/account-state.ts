// Extension storage that belongs to one account's work but lives in the profile-wide storage area: the permission mode and site rules the
// person chose, the workflow hints and run timings learned from their tasks, and their worker jobs. (Conversations already have a database
// per account, see store/db.ts; connected apps, tool lists and the Full access choice live on the server per account.)
// When another account signs in on the same Chrome profile, the previous account's values are put aside under its own id and removed
// from the live keys, and the signing-in account's own set-aside values (if any) come back. A profile's first account keeps what was
// there before accounts existed.
export const ACCOUNT_STATE_KEYS = ['nb.settings', 'nb.siteRules', 'xroga_hints_v1', 'xroga_perf_v1', 'xroga_parallel_jobs_v1'] as const;
export const STATE_OWNER_KEY = 'xroga-local-state-owner';
const asideKey = (account: string) => 'xroga-account-state-' + account;

interface Area {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** `firstOwner`: the profile's first account, who owns the values when this version has not recorded an owner yet (an upgraded profile). */
export async function switchAccountState(account: string, area: Area = chrome.storage.local, firstOwner?: string): Promise<void> {
  const previous = (await area.get(STATE_OWNER_KEY))[STATE_OWNER_KEY] ?? firstOwner;
  if (previous === account) return;
  if (typeof previous === 'string' && previous) {
    const live = await area.get([...ACCOUNT_STATE_KEYS]);
    await area.set({ [asideKey(previous)]: live });
    await area.remove([...ACCOUNT_STATE_KEYS]);
  }
  const back = (await area.get(asideKey(account)))[asideKey(account)] as Record<string, unknown> | undefined;
  if (back) {
    await area.set(back);
    await area.remove(asideKey(account));
  }
  await area.set({ [STATE_OWNER_KEY]: account });
}
