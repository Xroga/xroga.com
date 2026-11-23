'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, UsersRound } from 'lucide-react';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { errorText, teamsApi, type LinkPreview } from '@/lib/teams';

export function JoinTeam({ token }: { token: string }) {
  const identity = useWorkspaceIdentity();
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const next = encodeURIComponent(`/join/${token}`);

  useEffect(() => {
    if (identity.status !== 'authenticated') return;
    teamsApi.previewLink(token).then(setPreview).catch(() => setError('This invitation link is invalid, expired or already used.'));
  }, [identity.status, token]);

  async function accept() {
    setBusy(true);
    try { await teamsApi.acceptLink(token); setJoined(true); setError(''); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <UsersRound className="mx-auto" size={30} />
      <h1 className="mt-4 text-2xl font-semibold">Team invitation</h1>
      {identity.status !== 'authenticated' ? <>
        <p className="mt-3 text-sm text-[var(--muted)]">Sign in or create an account to see and accept this invitation.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm font-semibold" href={`/auth/login?next=${next}`}>Sign in</Link>
          <Link className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm font-semibold" href={`/auth/signup?next=${next}`}>Create account</Link>
        </div>
      </> : joined ? <>
        <p className="mt-3 text-sm">You joined {preview?.teamName ?? 'the team'}.</p>
        <Link className="mt-6 inline-block rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm font-semibold" href="/team">Open Team</Link>
      </> : preview ? <>
        <p className="mt-3 text-sm"><strong>{preview.teamName}</strong> invited you to join as <strong>{preview.role}</strong>.</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Invited by {preview.invitedBy} · expires {new Date(preview.expiresAt).toLocaleDateString()}</p>
        {error ? <p role="alert" className="mt-4 text-sm text-red-400">{error}</p> : null}
        <button className="mt-6 rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={busy} onClick={accept}>
          {busy ? <Loader2 className="mr-2 inline animate-spin" size={14} /> : null}Accept invitation
        </button>
      </> : error ? <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>
        : <p className="mt-3 text-sm text-[var(--muted)]"><Loader2 className="mr-2 inline animate-spin" size={14} />Checking invitation…</p>}
    </main>
  );
}
