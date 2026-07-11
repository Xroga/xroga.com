'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Key, Eye, EyeOff, Copy, Trash2, Lock } from 'lucide-react';
import {
  addCredential,
  deleteCredential,
  hasVault,
  loadCredentials,
  revealCredential,
  type CredentialType,
  type StoredCredential,
} from '@/lib/credentialVault';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const TYPE_OPTIONS: { id: CredentialType; label: string; hint: string }[] = [
  { id: 'api_key', label: 'API Key', hint: 'Paste your API key — stored encrypted in your vault.' },
  { id: 'webhook', label: 'Webhook', hint: 'Webhook URL + optional secret for signing.' },
  { id: 'secret', label: 'Secret', hint: 'Generic secret token — hidden until you unlock.' },
];

export function CustomCredentialsSection() {
  const [creds, setCreds] = useState<StoredCredential[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<CredentialType>('api_key');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [vaultPw, setVaultPw] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const [unlockPw, setUnlockPw] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletePw, setDeletePw] = useState('');

  useEffect(() => {
    setCreds(loadCredentials());
  }, []);

  function refresh() {
    setCreds(loadCredentials());
  }

  function handleSave() {
    if (!name.trim() || !value.trim()) {
      toast.error('Name and value required');
      return;
    }
    if (!vaultPw.trim()) {
      toast.error(hasVault() ? 'Enter vault password' : 'Set a vault password to lock secrets');
      return;
    }
    try {
      addCredential(vaultPw, { name: name.trim(), type, value: value.trim(), webhookUrl: webhookUrl || undefined });
      toast.success('Credential saved & locked');
      setName('');
      setValue('');
      setWebhookUrl('');
      setVaultPw('');
      setShowForm(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function tryReveal(id: string) {
    const plain = revealCredential(id, unlockPw);
    if (!plain) {
      toast.error('Wrong vault password');
      return;
    }
    setRevealed((r) => ({ ...r, [id]: plain }));
    setUnlockId(null);
    setUnlockPw('');
    toast.success('Unlocked');
  }

  function handleDelete() {
    if (!deleteId) return;
    if (!deleteCredential(deleteId, deletePw)) {
      toast.error('Wrong vault password');
      return;
    }
    setRevealed((r) => {
      const n = { ...r };
      delete n[deleteId];
      return n;
    });
    setDeleteId(null);
    setDeletePw('');
    refresh();
    toast.success('Deleted');
  }

  const deleteModal =
    deleteId && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/50" onClick={() => setDeleteId(null)}>
            <div className="bg-[var(--card)] rounded-xl p-4 w-full max-w-xs border border-[var(--card-border)]" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-semibold mb-2">Confirm delete</p>
              <p className="text-xs text-[var(--muted)] mb-3">Enter vault password to delete this credential.</p>
              <input
                type="password"
                value={deletePw}
                onChange={(e) => setDeletePw(e.target.value)}
                placeholder="Vault password"
                className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-white/5 text-sm mb-3"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setDeleteId(null)} className="flex-1 py-2 rounded-lg border border-[var(--card-border)] text-xs">Cancel</button>
                <button type="button" onClick={handleDelete} className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-bold">Delete</button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="rounded-xl border border-[var(--card-border)]/60 bg-[var(--card)]/40 p-3 sm:p-4 space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-[#006aff]" />
            Custom API Keys & Webhooks
          </h3>
          <p className="text-[10px] text-[var(--muted)] mt-0.5 leading-snug">
            Add your own API keys or webhooks. <strong className="text-[var(--foreground)]">Set a vault password</strong> — required every time you view or copy a key.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-[#006aff] text-white font-bold shrink-0"
        >
          <Plus className="w-3 h-3" /> Add New Credential
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-[var(--card-border)]/50 p-2.5 space-y-2 bg-white/[0.02]">
          <div className="flex flex-wrap gap-1">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={cn(
                  'text-[10px] font-bold px-2.5 py-1 rounded-md border transition-colors',
                  type === t.id ? 'bg-[#006aff]/15 border-[#006aff]/40 text-[#006aff]' : 'border-transparent text-[var(--muted)] hover:bg-white/5'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-[var(--muted)]">{TYPE_OPTIONS.find((t) => t.id === type)?.hint}</p>
          <input
            placeholder="Service name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-white/5 text-xs"
          />
          <input
            placeholder={type === 'webhook' ? 'Webhook secret (optional)' : 'Paste key or secret'}
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-white/5 text-xs font-mono"
          />
          {type === 'webhook' && (
            <input
              placeholder="Webhook URL"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-white/5 text-xs"
            />
          )}
          <input
            type="password"
            placeholder={hasVault() ? 'Vault password' : 'Set vault password (locks all secrets)'}
            value={vaultPw}
            onChange={(e) => setVaultPw(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-white/5 text-xs"
          />
          <button type="button" onClick={handleSave} className="w-full py-1.5 rounded-lg bg-[#006aff] text-white text-xs font-bold">
            Save & Lock
          </button>
        </div>
      )}

      {creds.length === 0 ? (
        <p className="text-[11px] text-[var(--muted)] text-center py-2">No custom credentials yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {creds.map((cred) => {
            const plain = revealed[cred.id];
            const showPlain = !!plain;
            return (
              <div key={cred.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[var(--card-border)]/40 text-[10px]">
                <Lock className="w-3 h-3 text-[var(--muted)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{cred.name}</p>
                  <p className="text-[var(--muted)] font-mono truncate">{showPlain ? plain : cred.masked}</p>
                </div>
                {unlockId === cred.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="password"
                      value={unlockPw}
                      onChange={(e) => setUnlockPw(e.target.value)}
                      className="w-20 px-1 py-0.5 rounded border border-[var(--card-border)] text-[9px]"
                      placeholder="pw"
                    />
                    <button type="button" onClick={() => tryReveal(cred.id)} className="text-[#006aff] font-bold">OK</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (showPlain) setRevealed((r) => { const n = { ...r }; delete n[cred.id]; return n; });
                        else setUnlockId(cred.id);
                      }}
                      className="p-1 rounded hover:bg-white/10 text-[var(--muted)]"
                      title={showPlain ? 'Hide' : 'Reveal'}
                    >
                      {showPlain ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                    {showPlain && (
                      <button
                        type="button"
                        onClick={() => { void navigator.clipboard.writeText(plain); toast.success('Copied'); }}
                        className="p-1 rounded hover:bg-white/10 text-[var(--muted)]"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                    <button type="button" onClick={() => setDeleteId(cred.id)} className="p-1 rounded hover:bg-red-500/10 text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {deleteModal}
    </div>
  );
}
