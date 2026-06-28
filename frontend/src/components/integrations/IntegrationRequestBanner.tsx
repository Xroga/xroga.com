'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import toast from 'react-hot-toast';

export function IntegrationRequestBanner({ query }: { query: string }) {
  const [company, setCompany] = useState(query);
  const [website, setWebsite] = useState('');
  const [note, setNote] = useState('');

  if (!query.trim()) return null;

  function submit() {
    if (!company.trim()) {
      toast.error('Company name required');
      return;
    }
    toast.success('Request submitted — Xroga AI will review this integration');
    setNote('');
  }

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3">
      <p className="text-sm font-semibold">Request integration</p>
      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
        We could not find <strong className="text-[var(--foreground)]">{query}</strong> in our catalog.
        Submit a request and our team will check if this company offers a safe, useful API for Xroga AI.
        We cannot guarantee future availability — we only add partners that align with our AI and security standards.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company name"
          className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-white/5 text-sm"
        />
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="Website (optional)"
          className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-white/5 text-sm"
        />
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What would you connect it for?"
        rows={2}
        className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-white/5 text-sm resize-none"
      />
      <button
        type="button"
        onClick={submit}
        className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 rounded-lg bg-[#006aff] text-white text-sm font-bold"
      >
        <Send className="w-3.5 h-3.5" /> Submit request
      </button>
    </div>
  );
}
