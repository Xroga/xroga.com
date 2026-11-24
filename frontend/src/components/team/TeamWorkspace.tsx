'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Activity, Check, Copy, Inbox, Link2, Loader2, LogOut, Plus, Search, Trash2, UserPlus, UsersRound, X } from 'lucide-react';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import {
  TEAM_CHANGED_EVENT, announceTeamChange, describeActivity, errorText, inviteUrl, teamsApi,
  type FoundUser, type InviteRole, type TeamActivityItem, type TeamInbox, type TeamOverview,
} from '@/lib/teams';
import s from './TeamWorkspace.module.css';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
const label = (m: { displayName: string | null; username: string | null }) => m.displayName || m.username || 'Xroga user';
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function Avatar({ text, url, square }: { text: string; url?: string | null; square?: boolean }) {
  return (
    <span className={cx(s.avatar, square && s.square)} aria-hidden="true">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" />
      ) : (text.trim()[0] || '?').toUpperCase()}
    </span>
  );
}

function Seg<T extends string | number>({ value, options, onChange, name }: { value: T; options: Array<{ v: T; l: string }>; onChange: (v: T) => void; name: string }) {
  return (
    <div className={s.seg} role="radiogroup" aria-label={name}>
      {options.map(o => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === value} className={cx(s.segBtn, o.v === value && s.segOn)} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

/**
 * One Team experience used by both the /team page and the workspace slide-in panel,
 * so every action (create, invite, link, accept, manage) works in either place.
 */
export function TeamWorkspace({ variant }: { variant: 'page' | 'panel' }) {
  const identity = useWorkspaceIdentity();
  const accountKey = identity.status === 'authenticated' ? identity.userId : identity.status;
  return <TeamWorkspaceView key={accountKey} variant={variant} identity={identity} />;
}

function TeamWorkspaceView({ variant, identity }: { variant: 'page' | 'panel'; identity: ReturnType<typeof useWorkspaceIdentity> }) {
  const pathname = usePathname() || '/team';
  const [inbox, setInbox] = useState<TeamInbox | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const isPage = variant === 'page';

  const load = useCallback(async () => {
    try {
      const next = await teamsApi.inbox();
      setInbox(next);
      setTeamId(current => (current && next.teams.some(t => t.id === current) ? current : next.teams[0]?.id ?? null));
      setError('');
    } catch (e) { setError(errorText(e)); }
  }, []);

  useEffect(() => { if (identity.status === 'authenticated') void load(); }, [identity.status, load]);
  // The invitation popup (or another Team surface) answered something: reload.
  useEffect(() => {
    if (identity.status !== 'authenticated') return;
    const reload = () => { void load(); };
    window.addEventListener(TEAM_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TEAM_CHANGED_EVENT, reload);
  }, [identity.status, load]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setNotice('');
    try { await action(); setError(''); if (success) setNotice(success); await load(); announceTeamChange(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (n.length < 2) return;
    void run(async () => { const t = await teamsApi.create(n); setNewName(''); setCreating(false); setTeamId(t.id); }, `Team “${n}” created.`);
  }

  if (identity.status !== 'authenticated') {
    return (
      <div className={cx(s.root, isPage ? s.page : s.panel)}>
        <div className={s.empty}>
          <UsersRound size={28} />
          <h2>Sign in to use Teams</h2>
          <p className={s.sub}>Create a team, invite people and accept invitations once you are signed in.</p>
          <Link className={cx(s.btn, s.primary)} href={`/auth/login?next=${encodeURIComponent(pathname)}`}>Sign in</Link>
        </div>
      </div>
    );
  }

  const createForm = (
    <form className={s.row} onSubmit={submitCreate}>
      <input className={cx(s.input, s.grow)} placeholder="Team name, e.g. Product crew" maxLength={60} value={newName} onChange={e => setNewName(e.target.value)} aria-label="New team name" autoFocus={creating} />
      <button className={cx(s.btn, s.primary)} disabled={busy || newName.trim().length < 2}>{busy ? <Loader2 size={14} className={s.spin} /> : <Plus size={14} />}Create</button>
    </form>
  );

  return (
    <div className={cx(s.root, isPage ? s.page : s.panel)}>
      {isPage ? (
        <header className={s.hero}>
          <h1><UsersRound size={26} /> Team</h1>
          <p>Work together with clear access. Invite people with an in-app invitation or a link you share yourself. No email is sent and nothing is charged.</p>
        </header>
      ) : null}

      {error ? <p role="alert" className={cx(s.banner, s.error)}>{error}</p> : null}
      {notice ? <p role="status" className={cx(s.banner, s.ok)}><Check size={15} />{notice}</p> : null}

      {!inbox ? <p className={s.muted}><Loader2 size={14} className={s.spin} style={{ display: 'inline', marginRight: 8 }} />Loading your teams…</p> : <>
        {inbox.invitations.length ? (
          <section className={s.card} aria-label="Invitations for you">
            <h2 className={s.cardTitle}><Inbox size={14} />Invitations for you · {inbox.invitations.length}</h2>
            <ul className={s.list}>
              {inbox.invitations.map(i => (
                <li key={i.id} className={s.item}>
                  <Avatar text={i.teamName} square />
                  <span className={s.who}><b>{i.teamName}</b><span>{i.role} · from {i.invitedBy} · expires {when(i.expiresAt)}</span></span>
                  <span className={s.actions}>
                    <button className={cx(s.btn, s.small, s.primary)} disabled={busy} onClick={() => run(() => teamsApi.respond(i.id, true), `You joined ${i.teamName}.`)}><Check size={13} />Accept</button>
                    <button className={cx(s.btn, s.small)} disabled={busy} onClick={() => run(() => teamsApi.respond(i.id, false))}>Decline</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!inbox.teams.length ? (
          <section className={s.empty} aria-label="Create your first team">
            <UsersRound size={28} />
            <h2>Create your first team</h2>
            <p className={s.sub}>A team lets you invite people by username, email lookup or a private link, and manage who can do what.</p>
            <div style={{ width: '100%', maxWidth: 420 }}>{createForm}</div>
            <p className={s.sub}>Have an invite link? Just open it while signed in.</p>
          </section>
        ) : (
          <div className={s.layout}>
            <section className={s.card} aria-label="Your teams">
              <h2 className={s.cardTitle}>Your teams</h2>
              <div className={s.teamList}>
                {inbox.teams.map(t => (
                  <button key={t.id} type="button" className={cx(s.teamItem, t.id === teamId && s.teamActive)} aria-pressed={t.id === teamId} onClick={() => setTeamId(t.id)}>
                    <Avatar text={t.name} square />
                    <span className={s.teamMeta}><span className={s.teamName}>{t.name}</span><span className={s.teamRole}>{t.role} · {t.memberCount} member{t.memberCount === 1 ? '' : 's'}</span></span>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                {creating ? <>{createForm}<button type="button" className={cx(s.btn, s.small)} style={{ marginTop: 8 }} onClick={() => { setCreating(false); setNewName(''); }}><X size={13} />Cancel</button></>
                  : <button type="button" className={cx(s.btn, s.small)} onClick={() => setCreating(true)}><Plus size={13} />New team</button>}
              </div>
            </section>

            {teamId ? <TeamDetail key={teamId} teamId={teamId} onChanged={load} onLeft={() => setTeamId(null)} onNotice={setNotice} /> : null}
          </div>
        )}
      </>}
    </div>
  );
}

type Tab = 'members' | 'invite' | 'pending' | 'activity';

function TeamDetail({ teamId, onChanged, onLeft, onNotice }: { teamId: string; onChanged: () => Promise<void>; onLeft: () => void; onNotice: (m: string) => void }) {
  const myId = useWorkspaceIdentity().userId;
  const [data, setData] = useState<TeamOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('members');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [role, setRole] = useState<InviteRole>('member');
  const [link, setLink] = useState<{ url: string; copied: boolean } | null>(null);
  const [linkRole, setLinkRole] = useState<'member' | 'viewer'>('member');
  const [hours, setHours] = useState(168);
  const [maxUses, setMaxUses] = useState(1);

  const [activity, setActivity] = useState<TeamActivityItem[] | null>(null);

  const refresh = useCallback(async () => {
    try { setData(await teamsApi.overview(teamId)); setError(''); } catch (e) { setError(errorText(e)); }
    teamsApi.activity(teamId).then(setActivity).catch(() => setActivity(current => current ?? []));
  }, [teamId]);
  useEffect(() => { void refresh(); }, [refresh]);
  // Someone accepted or declined elsewhere (e.g. the popup): refresh members and the timeline.
  useEffect(() => {
    const reload = () => { void refresh(); };
    window.addEventListener(TEAM_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TEAM_CHANGED_EVENT, reload);
  }, [refresh]);

  // Live search while typing (debounced; the server also rate-limits).
  const canSearch = !!data?.me.canInvite;
  useEffect(() => {
    const term = q.trim();
    if (!canSearch || term.length < 3) { setFound(null); return; }
    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      teamsApi.search(teamId, term).then(r => { if (live) { setFound(r); setError(''); } }).catch(e => { if (live) setError(errorText(e)); }).finally(() => { if (live) setSearching(false); });
    }, 400);
    return () => { live = false; clearTimeout(timer); setSearching(false); };
  }, [q, teamId, canSearch]);

  async function run(action: () => Promise<unknown>, success?: string, after?: () => void) {
    setBusy(true);
    try { await action(); after?.(); setError(''); setConfirm(null); if (success) onNotice(success); await refresh(); await onChanged(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  if (!data) return <section className={s.card}>{error ? <p role="alert" className={cx(s.banner, s.error)}>{error}</p> : <p className={s.muted}>Loading team…</p>}</section>;

  const isOwner = data.me.role === 'owner';
  const canInvite = data.me.canInvite;
  const waiting = data.pending.length + data.links.length;
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setLink({ ...link, copied: true }); } catch { setError('Copy failed. Select the link and copy it manually.'); }
  };

  return (
    <section className={s.card} aria-label={`${data.team.name} team`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className={s.head}>
        <div className={s.row}><Avatar text={data.team.name} square /><div className={s.who}><h2 style={{ margin: 0, fontSize: 17 }}>{data.team.name}</h2><span>{data.members.length} of {data.team.limit} seats · you are {data.me.role}</span></div></div>
        {!isOwner && myId ? (
          confirm === 'leave'
            ? <span className={s.actions}><button className={cx(s.btn, s.small, s.danger)} disabled={busy} onClick={() => run(() => teamsApi.removeMember(teamId, myId), 'You left the team.', onLeft)}>Confirm leave</button><button className={cx(s.btn, s.small)} onClick={() => setConfirm(null)}>Cancel</button></span>
            : <button className={cx(s.btn, s.small)} onClick={() => setConfirm('leave')}><LogOut size={13} />Leave</button>
        ) : null}
      </div>

      {error ? <p role="alert" className={cx(s.banner, s.error)}>{error}</p> : null}

      <div className={s.tabs} role="tablist">
        <button role="tab" aria-selected={tab === 'members'} className={cx(s.tab, tab === 'members' && s.tabOn)} onClick={() => setTab('members')}><UsersRound size={14} />Members<span className={s.badge}>{data.members.length}</span></button>
        {canInvite ? <>
          <button role="tab" aria-selected={tab === 'invite'} className={cx(s.tab, tab === 'invite' && s.tabOn)} onClick={() => setTab('invite')}><UserPlus size={14} />Invite</button>
          <button role="tab" aria-selected={tab === 'pending'} className={cx(s.tab, tab === 'pending' && s.tabOn)} onClick={() => setTab('pending')}>Pending{waiting ? <span className={s.badge}>{waiting}</span> : null}</button>
        </> : null}
        <button role="tab" aria-selected={tab === 'activity'} className={cx(s.tab, tab === 'activity' && s.tabOn)} onClick={() => setTab('activity')}><Activity size={14} />Activity</button>
      </div>

      {tab === 'activity' ? (
        activity === null ? <p className={s.muted}><Loader2 size={14} className={s.spin} style={{ display: 'inline', marginRight: 8 }} />Loading activity…</p>
        : activity.length ? (
          <ol className={s.timeline} aria-label="Team activity">
            {activity.map(item => (
              <li key={item.id} className={s.event}>
                <Avatar text={item.actor.displayName || item.actor.username || '?'} url={item.actor.avatarUrl} />
                <span className={s.who}>
                  <b style={{ whiteSpace: 'normal' }}>{describeActivity(item, myId)}</b>
                  <span>{new Date(item.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : <p className={s.sub}>No activity yet. Invitations, joins and changes will appear here.</p>
      ) : null}

      {tab === 'members' ? (
        <ul className={s.list} aria-label="Members">
          {data.members.map(m => {
            const mine = m.userId === myId;
            const canManage = isOwner && m.role !== 'owner';
            const canRemove = m.role !== 'owner' && !mine && (isOwner || (data.me.role === 'admin' && (m.role === 'member' || m.role === 'viewer')));
            return (
              <li key={m.userId} className={s.item} style={{ flexWrap: 'wrap' }}>
                <Avatar text={label(m)} url={m.avatarUrl} />
                <span className={s.who}><b>{label(m)}{mine ? ' (you)' : ''}</b><span>{m.username ? `@${m.username} · ` : ''}joined {when(m.joinedAt)}{m.canInvite && m.role !== 'owner' && m.role !== 'admin' ? ' · can invite' : ''}</span></span>
                <span className={s.actions}>
                  {canManage ? <>
                    <select aria-label={`Role for ${label(m)}`} className={s.select} style={{ width: 'auto', height: 30, fontSize: 12 }} value={m.role} disabled={busy}
                      onChange={e => run(() => teamsApi.setMember(teamId, m.userId, e.target.value as InviteRole, m.canInvite), 'Role updated.')}>
                      <option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
                    </select>
                    {m.role === 'member' || m.role === 'viewer' ? (
                      <button className={cx(s.btn, s.small)} disabled={busy} title="Allow this person to invite others"
                        onClick={() => run(() => teamsApi.setMember(teamId, m.userId, m.role as InviteRole, !m.canInvite), m.canInvite ? 'Invite permission removed.' : 'Invite permission granted.')}>{m.canInvite ? 'Can invite ✓' : 'Allow invites'}</button>
                    ) : null}
                  </> : <span className={cx(s.rolePill, m.role === 'owner' && s.ownerPill)}>{m.role}</span>}
                  {canRemove ? (confirm === m.userId
                    ? <><button className={cx(s.btn, s.small, s.danger)} disabled={busy} onClick={() => run(() => teamsApi.removeMember(teamId, m.userId), `${label(m)} was removed.`)}>Confirm</button><button className={cx(s.btn, s.small)} onClick={() => setConfirm(null)}>Cancel</button></>
                    : <button className={cx(s.btn, s.small, s.icon)} aria-label={`Remove ${label(m)}`} title="Remove" onClick={() => setConfirm(m.userId)}><Trash2 size={14} /></button>) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {tab === 'invite' && canInvite ? <>
        <div className={s.field}>
          <span className={s.label}>Invite an existing Xroga user</span>
          <div className={s.row}>
            <div className={s.grow} style={{ position: 'relative' }}>
              <input className={s.input} placeholder="Type a username (3+ letters) or exact email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search by username or email" />
            </div>
            <Seg name="Role" value={role} onChange={setRole} options={isOwner ? [{ v: 'admin', l: 'Admin' }, { v: 'member', l: 'Member' }, { v: 'viewer', l: 'Viewer' }] : [{ v: 'member', l: 'Member' }, { v: 'viewer', l: 'Viewer' }]} />
          </div>
          {searching ? <p className={s.muted}><Search size={13} style={{ display: 'inline', marginRight: 6 }} />Searching…</p> : null}
          {found && !searching ? (found.length ? (
            <ul className={s.list}>
              {found.map(u => (
                <li key={u.id} className={s.item}>
                  <Avatar text={u.displayName || u.username} url={u.avatarUrl} />
                  <span className={s.who}><b>{u.displayName || u.username}</b><span>@{u.username}</span></span>
                  <button className={cx(s.btn, s.small, !u.alreadyMember && s.primary)} disabled={busy || u.alreadyMember} onClick={() => run(() => teamsApi.invite(teamId, u.id, role), `Invitation sent to @${u.username}.`, () => { setFound(null); setQ(''); })}>{u.alreadyMember ? 'Member' : 'Invite'}</button>
                </li>
              ))}
            </ul>
          ) : <p className={s.sub}>No Xroga user matches. For someone without an account, create an invite link below.</p>) : null}
        </div>

        <div className={s.field} style={{ borderTop: '1px solid var(--t-line)', paddingTop: 14 }}>
          <span className={s.label}><Link2 size={13} style={{ display: 'inline', marginRight: 6 }} />Or share an invite link</span>
          <div className={s.fields}>
            <div className={s.field}><span className={s.label}>Role</span><Seg name="Link role" value={linkRole} onChange={setLinkRole} options={[{ v: 'member', l: 'Member' }, { v: 'viewer', l: 'Viewer' }]} /></div>
            <div className={s.field}><span className={s.label}>Expires</span><Seg name="Expiry" value={hours} onChange={setHours} options={[{ v: 1, l: '1h' }, { v: 24, l: '1d' }, { v: 168, l: '7d' }, { v: 720, l: '30d' }]} /></div>
            <div className={s.field}><span className={s.label}>People who can use it</span><Seg name="Max uses" value={maxUses} onChange={setMaxUses} options={[{ v: 1, l: '1' }, { v: 5, l: '5' }, { v: 25, l: '25' }, { v: 100, l: '100' }]} /></div>
          </div>
          <div><button className={cx(s.btn, s.primary)} disabled={busy} onClick={() => run(async () => { const r = await teamsApi.createLink(teamId, { role: linkRole, hours, maxUses }); setLink({ url: inviteUrl(r.path), copied: false }); })}>{busy ? <Loader2 size={14} className={s.spin} /> : <Link2 size={14} />}Create invite link</button></div>
          {link ? (
            <div className={s.linkBox}>
              <p className={s.sub} style={{ width: '100%' }}>Copy it now. For security the full link is shown only once.</p>
              <input readOnly value={link.url} aria-label="Invitation link" onFocus={e => e.currentTarget.select()} />
              <button className={cx(s.btn, s.small)} onClick={copy}>{link.copied ? <Check size={13} /> : <Copy size={13} />}{link.copied ? 'Copied' : 'Copy'}</button>
            </div>
          ) : null}
        </div>
      </> : null}

      {tab === 'pending' && canInvite ? <>
        <div className={s.field}>
          <span className={s.label}>Invitations waiting for a reply</span>
          {data.pending.length ? (
            <ul className={s.list}>
              {data.pending.map(p => (
                <li key={p.id} className={s.item}>
                  <Avatar text={label(p)} />
                  <span className={s.who}><b>{label(p)}</b><span>{p.username ? `@${p.username} · ` : ''}{p.role} · expires {when(p.expiresAt)}</span></span>
                  <button className={cx(s.btn, s.small)} disabled={busy} onClick={() => run(() => teamsApi.revoke(p.id), 'Invitation cancelled.')}>Cancel</button>
                </li>
              ))}
            </ul>
          ) : <p className={s.sub}>Nothing waiting for a reply.</p>}
        </div>
        <div className={s.field} style={{ borderTop: '1px solid var(--t-line)', paddingTop: 14 }}>
          <span className={s.label}>Active invite links</span>
          {data.links.length ? (
            <ul className={s.list}>
              {data.links.map(l => (
                <li key={l.id} className={s.item}>
                  <Avatar text="🔗" square />
                  <span className={s.who}><b style={{ textTransform: 'capitalize' }}>{l.role} link</b><span>{l.useCount}/{l.maxUses} used · expires {when(l.expiresAt)}</span></span>
                  <button className={cx(s.btn, s.small, s.danger)} disabled={busy} onClick={() => run(() => teamsApi.revoke(l.id), 'Link revoked.')}>Revoke</button>
                </li>
              ))}
            </ul>
          ) : <p className={s.sub}>No active links. Create one from the Invite tab.</p>}
        </div>
      </> : null}
    </section>
  );
}
