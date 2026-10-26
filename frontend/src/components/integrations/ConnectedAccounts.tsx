'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Star, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';

import { xrogaConnect, type XrogaConnectedAccount, type XrogaConnectedAccountsResult } from '@/lib/xrogaConnect';

const ALIAS = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** A readable name for an account: the user's own name for it, else the provider label. */
export function accountDisplayName(account: Pick<XrogaConnectedAccount, 'alias' | 'label' | 'id'>, index: number): string {
  return account.alias ?? account.label ?? `Account ${index + 1}`;
}

/**
 * Several accounts for one app (for example a work and a personal Gmail): see them, name them,
 * add another, and choose the one Xroga uses by default. Renders nothing unless Xroga has enabled
 * several accounts, so it never appears for a deployment that has not turned the feature on.
 */
export function ConnectedAccounts({ toolkit, appName, getSessionId }: { toolkit: string; appName: string; getSessionId: () => Promise<string> }) {
  const [state, setState] = useState<XrogaConnectedAccountsResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await xrogaConnect.accounts.list(toolkit));
    } catch {
      setState(null);
    }
  }, [toolkit]);

  useEffect(() => {
    void load();
  }, [load]);

  // The connect popup tells this window when it finishes.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && (event.data as { type?: string } | null)?.type === 'xroga-composio-connected') {
        setBusy(null);
        setAdding(false);
        setNewName('');
        void load();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [load]);

  if (!state?.multiAccount) return null;
  const accounts = state.accounts;

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That did not complete.');
    } finally {
      setBusy((current) => (current === label ? null : current));
    }
  };

  const makeDefault = (account: XrogaConnectedAccount) => run(`default:${account.id}`, async () => {
    await xrogaConnect.accounts.setDefault(toolkit, account.id);
    await load();
    toast.success('Default account saved');
  });

  const saveName = (account: XrogaConnectedAccount, value: string) => run(`rename:${account.id}`, async () => {
    const alias = value.trim().toLowerCase();
    if (!ALIAS.test(alias)) throw new Error('Use 2 to 40 lowercase letters, numbers or hyphens.');
    await xrogaConnect.accounts.rename(toolkit, account.id, alias);
    setEditing(null);
    await load();
  });

  const addAccount = () => run('add', async () => {
    const alias = newName.trim().toLowerCase();
    if (alias && !ALIAS.test(alias)) throw new Error('Use 2 to 40 lowercase letters, numbers or hyphens.');
    if (accounts.length >= 5) throw new Error('You can connect up to 5 accounts for one app.');
    // The popup must open from the click, before any await.
    const popup = window.open('', 'xroga-connect-oauth', 'width=600,height=760,resizable=yes,scrollbars=yes');
    try {
      const sessionId = await getSessionId();
      const result = await xrogaConnect.link(sessionId, toolkit, alias || undefined);
      if (!result.redirectUrl) throw new Error('Authorization link was not returned.');
      if (popup) {
        popup.location.href = result.redirectUrl;
        popup.focus();
      } else {
        window.location.href = result.redirectUrl;
      }
    } catch (error) {
      try {
        popup?.close();
      } catch {
        // The browser may have closed it already.
      }
      throw error;
    }
  });

  const hasSeveral = accounts.length > 1;
  const needsDefault = hasSeveral && !state.defaultAccountId;

  return (
    <section aria-label={`${appName} accounts`} className="space-y-2 rounded-lg border border-[var(--card-border)] p-3 text-sm">
      <div className="flex items-center gap-1.5 font-medium">
        <UserRound className="h-4 w-4" aria-hidden="true" /> Connected accounts
      </div>
      <p className="text-xs text-[var(--muted)]">
        {accounts.length === 0
          ? `No ${appName} account is connected yet.`
          : hasSeveral
            ? `Xroga acts as your default ${appName} account unless a request names another one.`
            : `Xroga acts as this ${appName} account. Add another to choose between them.`}
      </p>
      {needsDefault ? (
        <p role="status" className="text-xs text-amber-400">Choose a default account. Until you do, Xroga will ask before acting with {appName}.</p>
      ) : null}

      <ul className="space-y-1.5">
        {accounts.map((account, index) => {
          const isDefault = state.defaultAccountId === account.id;
          const name = accountDisplayName(account, index);
          return (
            <li key={account.id} className="flex flex-wrap items-center gap-2 rounded border border-[var(--card-border)] px-2 py-1.5">
              {editing?.id === account.id ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveName(account, editing.value);
                  }}
                >
                  <label className="sr-only" htmlFor={`alias-${account.id}`}>Account name</label>
                  <input
                    id={`alias-${account.id}`}
                    value={editing.value}
                    onChange={(event) => setEditing({ id: account.id, value: event.target.value })}
                    maxLength={40}
                    autoFocus
                    className="min-w-0 flex-1 rounded border border-[var(--card-border)] bg-transparent px-1.5 py-0.5 text-xs"
                  />
                  <button type="submit" disabled={busy !== null} className="rounded border border-[var(--card-border)] px-2 py-0.5 text-xs disabled:opacity-50">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="text-xs underline text-[var(--muted)]">Cancel</button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate" title={account.label ?? undefined}>
                    {name}
                    {account.alias && account.label ? <span className="ml-1 text-xs text-[var(--muted)]">({account.label})</span> : null}
                  </span>
                  {isDefault ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Default</span>
                  ) : hasSeveral ? (
                    <button type="button" disabled={busy !== null} onClick={() => void makeDefault(account)} className="flex items-center gap-1 rounded border border-[var(--card-border)] px-2 py-0.5 text-xs disabled:opacity-50">
                      {busy === `default:${account.id}` ? <Loader2 className="h-3 w-3 animate-spin" aria-label="Saving" /> : <Star className="h-3 w-3" aria-hidden="true" />} Make default
                    </button>
                  ) : null}
                  <button type="button" disabled={busy !== null} onClick={() => setEditing({ id: account.id, value: account.alias ?? '' })} className="text-xs underline text-[var(--muted)] disabled:opacity-50">Rename</button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void addAccount();
          }}
        >
          <label className="sr-only" htmlFor={`new-alias-${toolkit}`}>Name for the new account (optional)</label>
          <input
            id={`new-alias-${toolkit}`}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Name, e.g. work-gmail (optional)"
            maxLength={40}
            className="min-w-0 flex-1 rounded border border-[var(--card-border)] bg-transparent px-1.5 py-1 text-xs"
          />
          <button type="submit" disabled={busy !== null} className="rounded border border-[var(--accent)] px-2 py-1 text-xs text-[var(--accent)] disabled:opacity-50">
            {busy === 'add' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Connecting" /> : 'Connect'}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs underline text-[var(--muted)]">Cancel</button>
        </form>
      ) : accounts.length < 5 ? (
        <button type="button" disabled={busy !== null} onClick={() => setAdding(true)} className="flex items-center gap-1 rounded border border-[var(--card-border)] px-2 py-1 text-xs disabled:opacity-50">
          <Plus className="h-3 w-3" aria-hidden="true" /> Connect another account
        </button>
      ) : (
        <p className="text-xs text-[var(--muted)]">You have reached the limit of 5 accounts for this app.</p>
      )}
    </section>
  );
}
