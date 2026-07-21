'use client';

import { useCallback, useState } from 'react';
import { CheckCircle2, Circle, Globe, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type DomainInfo = {
  name: string;
  verified: boolean;
  verification?: Array<{ type: string; domain: string; value: string; reason?: string }>;
};

/**
 * Attach a branded domain to the user's Vercel project and verify DNS.
 * Requires Domain write permission on the Vercel App.
 */
export function CustomDomainPanel({ className }: { className?: string }) {
  const [project, setProject] = useState('');
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const slug = project.trim();
    if (!slug) return;
    setBusy(true);
    try {
      const res = await api.vercel.listDomains(slug);
      setDomains((res.domains as DomainInfo[]) ?? []);
    } catch (e) {
      toast.error((e as Error).message || 'Could not list domains');
    } finally {
      setBusy(false);
    }
  }, [project]);

  async function addDomain() {
    const slug = project.trim();
    const name = domain.trim();
    if (!slug || !name) {
      toast.error('Enter Vercel project slug and domain');
      return;
    }
    setBusy(true);
    try {
      const res = await api.vercel.addDomain(slug, name);
      setLastMessage(res.message || null);
      if (res.domain) {
        setDomains((d) => {
          const rest = d.filter((x) => x.name !== res.domain!.name);
          return [res.domain as DomainInfo, ...rest];
        });
      }
      toast.success(res.message || 'Domain attached');
      setDomain('');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Add domain failed');
    } finally {
      setBusy(false);
    }
  }

  async function verify(name: string) {
    const slug = project.trim();
    if (!slug) return;
    setBusy(true);
    try {
      const res = await api.vercel.verifyDomain(slug, name);
      setLastMessage(res.message || null);
      if (res.domain) {
        setDomains((d) => d.map((x) => (x.name === name ? (res.domain as DomainInfo) : x)));
      }
      if (res.verified) toast.success('Domain verified');
      else toast.error(res.message || 'DNS not ready yet');
    } catch (e) {
      toast.error((e as Error).message || 'Verify failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    const slug = project.trim();
    if (!slug) return;
    setBusy(true);
    try {
      await api.vercel.removeDomain(slug, name);
      setDomains((d) => d.filter((x) => x.name !== name));
      toast.success('Domain removed');
    } catch (e) {
      toast.error((e as Error).message || 'Remove failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('rounded-xl border border-[var(--card-border)] p-4 space-y-3', className)}>
      <div className="flex items-start gap-2">
        <Globe className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">Custom domain</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            Attach <span className="font-medium">yourdomain.com</span> to your Vercel project, then
            verify DNS. Needs Domain write on the Vercel App.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <input
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="Vercel project slug"
          className="rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
        />
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="app.example.com"
          className="rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void addDomain()}
          className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add domain'}
        </button>
        <button
          type="button"
          disabled={busy || !project.trim()}
          onClick={() => void refresh()}
          className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-xs font-semibold disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {lastMessage ? (
        <p className="text-[11px] text-[var(--muted)]">{lastMessage}</p>
      ) : null}

      {domains.length > 0 ? (
        <ul className="space-y-2">
          {domains.map((d) => (
            <li
              key={d.name}
              className="rounded-lg border border-[var(--card-border)] p-2.5 space-y-1.5"
            >
              <div className="flex items-center gap-2 text-sm">
                {d.verified ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <span className="font-semibold flex-1 truncate">{d.name}</span>
                <span className="text-[10px] text-[var(--muted)]">
                  {d.verified ? 'verified' : 'pending DNS'}
                </span>
                {!d.verified ? (
                  <button
                    type="button"
                    className="text-[10px] font-semibold text-[var(--accent)]"
                    onClick={() => void verify(d.name)}
                  >
                    Verify
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-[var(--muted)] hover:text-red-500"
                  onClick={() => void remove(d.name)}
                  aria-label={`Remove ${d.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {!d.verified && d.verification?.length ? (
                <div className="text-[10px] font-mono text-[var(--muted)] space-y-1 pl-6">
                  {d.verification.map((v, i) => (
                    <p key={`${v.type}-${i}`}>
                      {v.type.toUpperCase()} {v.domain} → {v.value}
                      {v.reason ? ` (${v.reason})` : ''}
                    </p>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
