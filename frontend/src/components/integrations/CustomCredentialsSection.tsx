'use client';

import { useCallback, useEffect, useState } from 'react';
import { Key, Lock, Upload } from 'lucide-react';
import {
  loadLegacyCredentials,
  readLegacyCredentialForImport,
  removeLegacyCredentialAfterImport,
  type StoredCredential,
} from '@/lib/credentialVault';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

function envName(value: string, suffix = 'API_KEY') {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  const candidate = /^[A-Z_]/.test(normalized) ? normalized : `XROGA_${normalized}`;
  const alreadyCredential = /_(?:KEY|TOKEN|SECRET|URL)$/.test(candidate);
  const named = suffix === 'API_KEY' && alreadyCredential
    ? candidate
    : `${candidate || 'CUSTOM'}_${suffix}`;
  return named.slice(0, 64);
}

export function CustomCredentialsSection() {
  const [legacy, setLegacy] = useState<StoredCredential[]>([]);
  const [serverKeys, setServerKeys] = useState<Array<{ provider: string; masked?: string; envVar?: string }>>([]);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [consented, setConsented] = useState(false);

  const refresh = useCallback(async () => {
    setLegacy(loadLegacyCredentials());
    try {
      const response = await api.integrations.providerKeys();
      setServerKeys(response.keys.filter(key => key.connected && key.provider === 'custom'));
    } catch {
      setServerKeys([]);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function saveNew() {
    if (!name.trim() || value.trim().length < 8) {
      toast.error('Enter a name and a credential of at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      await api.integrations.saveProviderKey('custom', value.trim(), { envVarName: envName(name) });
      setName('');
      setValue('');
      toast.success('Credential saved in the server vault');
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function importLegacy(record: StoredCredential) {
    if (!consented) {
      toast.error('Confirm the one-time import first');
      return;
    }
    const plain = readLegacyCredentialForImport(record.id, password);
    if (!plain) {
      toast.error('The legacy vault password is incorrect');
      return;
    }
    setSaving(true);
    try {
      await api.integrations.saveProviderKey('custom', plain, { envVarName: envName(record.name) });
      if (record.webhookUrl) {
        await api.integrations.saveProviderKey('custom', record.webhookUrl, { envVarName: envName(record.name, 'URL') });
      }
      if (!removeLegacyCredentialAfterImport(record.id, password)) throw new Error('Secure save succeeded, but local cleanup must be retried');
      setImportId(null);
      setPassword('');
      setConsented(false);
      toast.success('Legacy credential imported and its browser copy removed');
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)]/60 bg-[var(--card)]/40 p-3 sm:p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5 text-[#006aff]" /> Custom API keys
        </h3>
        <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
          New values are sent once to the authenticated backend and stored as bound CredentialVault envelopes. Secret values can’t be revealed in the browser.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--card-border)]/50 p-2.5 space-y-2 bg-white/[0.02]">
        <input placeholder="Service or environment variable name" value={name} onChange={event => setName(event.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-white/5 text-xs" />
        <input placeholder="Paste key or secret" type="password" value={value} onChange={event => setValue(event.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-white/5 text-xs font-mono" />
        <button type="button" disabled={saving} onClick={() => void saveNew()} className="w-full py-1.5 rounded-lg bg-[#006aff] text-white text-xs font-bold disabled:opacity-50">
          Save to server vault
        </button>
      </div>

      {serverKeys.length > 0 && (
        <div className="space-y-1.5">
          {serverKeys.map((key, index) => (
            <div key={`${key.envVar ?? key.provider}-${index}`} className="flex items-center gap-2 rounded-lg border border-[var(--card-border)]/40 px-2 py-1.5 text-[10px]">
              <Lock className="h-3 w-3 shrink-0 text-emerald-500" />
              <span className="min-w-0 flex-1 truncate font-semibold">{key.envVar ?? 'Custom credential'}</span>
              <span className="font-mono text-[var(--muted)]">{key.masked ?? 'connected'}</span>
            </div>
          ))}
        </div>
      )}

      {legacy.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
          <p className="text-[10px] leading-snug text-[var(--muted)]">
            {legacy.length} credential{legacy.length === 1 ? '' : 's'} remain in the retired browser vault. Import each one only with your explicit consent, then rotate it because browser storage didn’t provide secure custody.
          </p>
          {legacy.map(record => (
            <div key={record.id} className="space-y-2 rounded-md border border-[var(--card-border)]/40 p-2">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="min-w-0 flex-1 truncate font-semibold">{record.name}</span>
                <span className="font-mono text-[var(--muted)]">{record.masked}</span>
                <button type="button" onClick={() => { setImportId(record.id); setConsented(false); }} className="flex items-center gap-1 text-[#006aff] font-bold"><Upload className="h-3 w-3" /> Import</button>
              </div>
              {importId === record.id && (
                <div className="space-y-2">
                  <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Legacy vault password" className="w-full rounded border border-[var(--card-border)] bg-white/5 px-2 py-1 text-[10px]" />
                  <label className="flex items-start gap-2 text-[9px] leading-snug text-[var(--muted)]">
                    <input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} />
                    I consent to decrypt this selected browser record once, save it in my server vault, and remove the browser copy after a successful save.
                  </label>
                  <button type="button" disabled={saving || !consented} onClick={() => void importLegacy(record)} className="w-full rounded bg-[#006aff] py-1 text-[10px] font-bold text-white disabled:opacity-50">Import selected record</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
