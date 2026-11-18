import { useEffect, useState } from 'react';

type Reply = { error?: string; mode?: string };

async function request(op: string, data: Record<string, string> = {}): Promise<Reply> {
  const value = await chrome.runtime.sendMessage({ type: 'xroga.browser.plugins.v1', op, ...data }) as Reply | undefined;
  if (!value || value.error) throw new Error(value?.error || 'The Xroga extension is reconnecting. Try again.');
  return value;
}

/**
 * Full access for every connected app, reachable from the chat bar. It is the same account-wide choice as the one in the Plugins panel
 * (the owner's own click, saved on the server): while it is on, Xroga does not ask before reading or changing a connected app, so a task
 * can finish while the owner is away. Sending, publishing, deleting and payments keep their own approval; the server enforces that.
 */
export function FullAccessToggle() {
  const [mode, setMode] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let current = true;
    void request('permission').then(data => { if (current) setMode(data.mode); }, () => { /* stays unknown; the switch is disabled */ });
    return () => { current = false; };
  }, []);
  const on = mode === 'full_access';
  async function toggle() {
    if (saving || mode === undefined) return;
    setSaving(true);
    try {
      const data = await request('setPermission', { mode: on ? 'low_risk' : 'full_access' });
      setMode(data.mode);
    } catch { /* unchanged */ } finally { setSaving(false); }
  }
  return (
    <button type="button" role="switch" aria-checked={on} disabled={saving || mode === undefined} onClick={() => void toggle()}
      title={on ? 'Full access is on: Xroga will not ask before using your connected apps. Click to turn off.' : 'Turn on Full access so Xroga does not ask before using your connected apps.'}
      className={'flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs hover:bg-nb-surface disabled:opacity-50 ' + (on ? 'text-nb-accent' : 'text-nb-muted hover:text-nb-fg')}>
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 4 6v6c0 4.4 3.2 7.6 8 9 4.8-1.4 8-4.6 8-9V6l-8-3Z" />
        {on ? <path d="m9 12 2 2 4-4" /> : null}
      </svg>
      <span className="max-[279px]:sr-only">{saving ? 'Saving…' : on ? 'Full access on' : 'Full access'}</span>
    </button>
  );
}
