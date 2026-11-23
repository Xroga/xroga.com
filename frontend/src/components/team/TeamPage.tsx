'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Search, ShieldCheck, Trash2, UserPlus, UsersRound, X } from 'lucide-react';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import {
  errorText, inviteUrl, teamsApi,
  type FoundUser, type InviteRole, type TeamInbox, type TeamOverview,
} from '@/lib/teams';

const card = 'rounded-xl border border-[var(--card-border)] bg-[var(--card-bg,transparent)] p-5';
const btn = 'inline-flex items-center gap-2 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40';
const input = 'rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--foreground)]';
const name = (m: { displayName: string | null; username: string | null }) => m.displayName || m.username || 'Xroga user';
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function TeamPage() {
  const identity = useWorkspaceIdentity();
  const [inbox, setInbox] = useState<TeamInbox | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [teamName, setTeamName] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await teamsApi.inbox();
      setInbox(next);
      setTeamId(current => (current && next.teams.some(t => t.id === current) ? current : next.teams[0]?.id ?? null));
      setError('');
    } catch (e) { setError(errorText(e)); }
  }, []);

  useEffect(() => { if (identity.status === 'authenticated') void load(); }, [identity.status, load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); setError(''); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  if (identity.status !== 'authenticated') {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <UsersRound size={28} />
        <h1 className="mt-4 text-2xl font-semibold">Team</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Sign in to create a team, invite people and accept invitations.</p>
        <Link className={`${btn} mt-6`} href="/auth/login?next=%2Fteam">Sign in</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><UsersRound size={24} /> Team</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Invite people with an in-app invitation or a link you share yourself. No email is sent.</p>
      </header>
      {error ? <p role="alert" className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400">{error}</p> : null}
      {!inbox ? <p className="text-sm text-[var(--muted)]"><Loader2 className="mr-2 inline animate-spin" size={14} />Loading…</p> : <>
        {inbox.invitations.length ? (
          <section className={card} aria-label="Invitations for you">
            <h2 className="mb-3 text-sm font-semibold">Invitations for you</h2>
            <ul className="space-y-2">
              {inbox.invitations.map(i => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span><strong>{i.teamName}</strong> invited you as {i.role} · from {i.invitedBy} · expires {when(i.expiresAt)}</span>
                  <span className="flex gap-2">
                    <button className={btn} disabled={busy} onClick={() => run(() => teamsApi.respond(i.id, true))}><Check size={14} />Accept</button>
                    <button className={btn} disabled={busy} onClick={() => run(() => teamsApi.respond(i.id, false))}><X size={14} />Decline</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={card} aria-label="Your teams">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Your teams</h2>
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const n = teamName.trim(); if (n.length >= 2) void run(async () => { const t = await teamsApi.create(n); setTeamName(''); setTeamId(t.id); }); }}>
              <input className={input} placeholder="New team name" maxLength={60} value={teamName} onChange={e => setTeamName(e.target.value)} aria-label="New team name" />
              <button className={btn} disabled={busy || teamName.trim().length < 2}>Create team</button>
            </form>
          </div>
          {inbox.teams.length ? (
            <div className="flex flex-wrap gap-2">
              {inbox.teams.map(t => (
                <button key={t.id} onClick={() => setTeamId(t.id)} aria-pressed={t.id === teamId}
                  className={`${btn} ${t.id === teamId ? 'border-[var(--foreground)]' : ''}`}>{t.name} · {t.role}</button>
              ))}
            </div>
          ) : <p className="text-sm text-[var(--muted)]">You are not in a team yet. Create one, or open an invite link someone shared with you.</p>}
        </section>

        {teamId ? <TeamDetail key={teamId} teamId={teamId} onChanged={load} onLeft={() => setTeamId(null)} /> : null}
      </>}
    </main>
  );
}

function TeamDetail({ teamId, onChanged, onLeft }: { teamId: string; onChanged: () => Promise<void>; onLeft: () => void }) {
  const myId = useWorkspaceIdentity().userId;
  const [data, setData] = useState<TeamOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundUser[] | null>(null);
  const [role, setRole] = useState<InviteRole>('member');
  const [link, setLink] = useState<{ url: string; copied: boolean } | null>(null);
  const [linkRole, setLinkRole] = useState<'member' | 'viewer'>('member');
  const [hours, setHours] = useState(168);
  const [maxUses, setMaxUses] = useState(1);

  const refresh = useCallback(async () => {
    try { setData(await teamsApi.overview(teamId)); setError(''); } catch (e) { setError(errorText(e)); }
  }, [teamId]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    try { await action(); after?.(); setError(''); await refresh(); await onChanged(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  if (!data) return error ? <p role="alert" className="text-sm text-red-400">{error}</p> : <p className="text-sm text-[var(--muted)]">Loading team…</p>;
  const isOwner = data.me.role === 'owner';
  const canInvite = data.me.canInvite;

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400">{error}</p> : null}
      <section className={card} aria-label="Members">
        <h2 className="mb-3 text-sm font-semibold">{data.team.name} · Members ({data.members.length}/{data.team.limit})</h2>
        <ul className="divide-y divide-[var(--card-border)]">
          {data.members.map(m => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <span>{name(m)} {m.username ? <span className="text-[var(--muted)]">@{m.username}</span> : null} · <em>{m.role}</em>{m.canInvite && m.role !== 'owner' ? ' · can invite' : ''} · joined {when(m.joinedAt)}</span>
              <span className="flex flex-wrap gap-2">
                {isOwner && m.role !== 'owner' ? <>
                  <select aria-label={`Role for ${name(m)}`} className={input} value={m.role} disabled={busy}
                    onChange={e => run(() => teamsApi.setMember(teamId, m.userId, e.target.value as InviteRole, m.canInvite))}>
                    <option value="admin">admin</option><option value="member">member</option><option value="viewer">viewer</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={m.canInvite} disabled={busy || m.role === 'admin'}
                    onChange={e => run(() => teamsApi.setMember(teamId, m.userId, m.role as InviteRole, e.target.checked))} />can invite</label>
                </> : null}
                {m.role !== 'owner' && (isOwner || (data.me.role === 'admin' && (m.role === 'member' || m.role === 'viewer'))) ? (
                  <button className={btn} disabled={busy} onClick={() => { if (confirm(`Remove ${name(m)} from the team?`)) void run(() => teamsApi.removeMember(teamId, m.userId)); }}><Trash2 size={13} />Remove</button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {!isOwner && myId ? <button className={`${btn} mt-3`} disabled={busy} onClick={() => { if (confirm('Leave this team?')) void run(() => teamsApi.removeMember(teamId, myId), onLeft); }}>Leave team</button> : null}
      </section>

      {canInvite ? <>
        <section className={card} aria-label="Invite an existing user">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserPlus size={15} />Invite an existing Xroga user</h2>
          <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void run(async () => setFound(await teamsApi.search(teamId, q.trim()))); }}>
            <input className={`${input} min-w-[16rem] flex-1`} placeholder="Username or exact email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search by username or email" />
            <select aria-label="Role" className={input} value={role} onChange={e => setRole(e.target.value as InviteRole)}>
              {isOwner ? <option value="admin">admin</option> : null}<option value="member">member</option><option value="viewer">viewer</option>
            </select>
            <button className={btn} disabled={busy || q.trim().length < 3}><Search size={14} />Search</button>
          </form>
          {found ? (found.length ? (
            <ul className="mt-3 space-y-2">
              {found.map(u => (
                <li key={u.id} className="flex items-center justify-between text-sm">
                  <span>{u.displayName || u.username} <span className="text-[var(--muted)]">@{u.username}</span></span>
                  <button className={btn} disabled={busy || u.alreadyMember} onClick={() => run(() => teamsApi.invite(teamId, u.id, role), () => setFound(null))}>{u.alreadyMember ? 'Already a member' : 'Invite to Team'}</button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-[var(--muted)]">No matching user. For someone without an account, create an invite link below.</p>) : null}
        </section>

        <section className={card} aria-label="Invite links">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Link2 size={15} />Invite links</h2>
          <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void run(async () => { const r = await teamsApi.createLink(teamId, { role: linkRole, hours, maxUses }); setLink({ url: inviteUrl(r.path), copied: false }); }); }}>
            <label className="text-xs">Role<select className={`${input} ml-2`} value={linkRole} onChange={e => setLinkRole(e.target.value as 'member' | 'viewer')}><option value="member">member</option><option value="viewer">viewer</option></select></label>
            <label className="text-xs">Expires in<select className={`${input} ml-2`} value={hours} onChange={e => setHours(Number(e.target.value))}><option value={1}>1 hour</option><option value={24}>1 day</option><option value={168}>7 days</option><option value={720}>30 days</option></select></label>
            <label className="text-xs">Max uses<input type="number" min={1} max={100} className={`${input} ml-2 w-20`} value={maxUses} onChange={e => setMaxUses(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} /></label>
            <button className={btn} disabled={busy}>Create invite link</button>
          </form>
          {link ? (
            <div className="mt-4 rounded-lg border border-[var(--card-border)] p-3 text-sm">
              <p className="mb-2 text-xs text-[var(--muted)]">Copy it now. For security the full link is shown only once.</p>
              <div className="flex gap-2"><input readOnly className={`${input} flex-1`} value={link.url} aria-label="Invitation link" onFocus={e => e.currentTarget.select()} />
                <button className={btn} onClick={async () => { await navigator.clipboard.writeText(link.url); setLink({ ...link, copied: true }); }}>{link.copied ? <Check size={14} /> : <Copy size={14} />}{link.copied ? 'Copied' : 'Copy invitation link'}</button></div>
            </div>
          ) : null}
          {data.links.length ? (
            <ul className="mt-4 divide-y divide-[var(--card-border)]">
              {data.links.map(l => (
                <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{l.role} link · {l.useCount}/{l.maxUses} used · expires {when(l.expiresAt)}</span>
                  <button className={btn} disabled={busy} onClick={() => run(() => teamsApi.revoke(l.id))}><ShieldCheck size={13} />Revoke</button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-[var(--muted)]">No active links.</p>}
        </section>

        <section className={card} aria-label="Pending invitations">
          <h2 className="mb-3 text-sm font-semibold">Pending invitations</h2>
          {data.pending.length ? (
            <ul className="divide-y divide-[var(--card-border)]">
              {data.pending.map(p => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{name(p)} {p.username ? <span className="text-[var(--muted)]">@{p.username}</span> : null} · {p.role} · expires {when(p.expiresAt)}</span>
                  <button className={btn} disabled={busy} onClick={() => run(() => teamsApi.revoke(p.id))}>Cancel</button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[var(--muted)]">Nothing waiting for a reply.</p>}
        </section>
      </> : null}
    </div>
  );
}
