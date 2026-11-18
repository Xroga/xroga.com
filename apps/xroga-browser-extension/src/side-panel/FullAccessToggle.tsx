import { useEffect, useState } from 'react';

type Reply = { error?: string; mode?: string };

async function request(op: string, data: Record<string, string> = {}): Promise<Reply> {
  const value = await chrome.runtime.sendMessage({ type: 'xroga.browser.plugins.v1', op, ...data }) as Reply | undefined;
  if (!value || value.error) throw new Error(value?.error || 'The Xroga extension is reconnecting. Try again.');
  return value;
}

/**
 * The one Full access control, in the chat bar. It is a single account-wide choice saved on the server: while it is on, Xroga does not
 * ask before reading or changing any connected app, in every tab and in the Plugins list, so a task can finish while the owner is away.
 * Sending, publishing, deleting and payments keep their own approval; the server enforces that. The state is shown in words and colour
 * (On: filled green with a tick; Off: plain), so it is never unclear whether it is on.
 */
export function FullAccessToggle() {
  const [mode, setMode] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void request('permission').then(data => { if (current) setMode(data.mode); }, () => { if (current) setFailed(true); });
    return () => { current = false; };
  }, []);
  const on = mode === 'full_access';
  async function toggle() {
    if (saving || mode === undefined) return;
    setSaving(true);
    setFailed(false);
    try {
      const data = await request('setPermission', { mode: on ? 'low_risk' : 'full_access' });
      setMode(data.mode);
    } catch { setFailed(true); } finally { setSaving(false); }
  }
  const label = saving ? 'Saving…' : mode === undefined ? (failed ? 'Full access: unavailable' : 'Full access…') : on ? 'Full access: ON' : 'Full access: OFF';
  return (
    <button type="button" role="switch" aria-checked={on} disabled={saving || mode === undefined} onClick={() => void toggle()}
      title={on
        ? 'Full access is ON for all your connected apps: Xroga will not ask before reading or changing them. Sending, publishing, deleting and payments still ask. Click to turn off.'
        : 'Full access is OFF: Xroga asks before using your connected apps. Click to turn it on for all apps.'}
      className={'flex h-7 items-center gap-1.5 rounded-full border px-2 text-xs font-medium disabled:opacity-60 ' +
        (on ? 'border-green-600 bg-green-600 text-white hover:bg-green-700' : 'border-nb-border text-nb-muted hover:bg-nb-surface hover:text-nb-fg')}>
      <span aria-hidden="true" className={'inline-block size-2 rounded-full ' + (on ? 'bg-white' : 'bg-nb-muted')} />
      <span className="max-[279px]:sr-only">{label}</span>
      {on ? <span aria-hidden="true" className="min-[280px]:hidden">✓</span> : null}
    </button>
  );
}
