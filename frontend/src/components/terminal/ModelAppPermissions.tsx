'use client';

import { useEffect, useState } from 'react';
import { xrogaConnect, type XrogaPluginPermissionMode } from '@/lib/xrogaConnect';
import styles from './WorkspaceControls.module.css';

/** Uses the saved app-tool policy, not a cosmetic model or safety override. */
export function ModelAppPermissions() {
  const [mode, setMode] = useState<XrogaPluginPermissionMode>('low_risk');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    xrogaConnect.permissionPolicy.get().then(result => {
      if (active) setMode(result.mode);
    }).catch(() => {
      if (active) setError('Sign in or reconnect to load your saved app permissions.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function change(next: XrogaPluginPermissionMode) {
    setSaving(true);
    setError('');
    try {
      const result = await xrogaConnect.permissionPolicy.update(next);
      setMode(result.mode);
    } catch {
      setError('Could not save. Your previous setting is unchanged.');
    } finally { setSaving(false); }
  }
  return <div className={styles.permissionChoice}>
    <label htmlFor="model-app-permissions">Connected app permissions</label>
    <select id="model-app-permissions" value={mode} disabled={loading || saving || error.startsWith('Sign in')}
      onChange={event => void change(event.target.value as XrogaPluginPermissionMode)}>
      <option value="low_risk">Auto (default)</option>
      <option value="always_ask">Ask before changes</option>
      <option value="read_only">Read-only</option>
      <option value="full_access">Full access — requested app actions</option>
    </select>
    {error ? <p role="status">{error}</p> : <p role="status">{saving ? 'Saving…' : loading ? 'Loading saved preference…' : mode === 'full_access' ? 'Requested app actions skip extra Xroga checks. Provider permissions and platform safeguards still apply.' : mode === 'always_ask' ? 'Ask before every connected-app change. Requested reads can continue.' : mode === 'read_only' ? 'Requested reads run directly. External changes require approval.' : 'Auto runs routine requested app actions. Sensitive actions still require approval.'}</p>}
  </div>;
}
