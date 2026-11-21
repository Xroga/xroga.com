'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { API_URL, apiFetch, ApiError } from '@/lib/api';
import { isProductionAuthBuild } from '@/lib/supabase/config';
import { currentTeamResponse, type TeamResponse } from '@/lib/teamMembershipSelection';
import styles from './WorkspacePeopleControls.module.css';

type Role = 'owner' | 'admin' | 'member';
type Team = { id: string; name: string; role: Role; status: 'active' | 'pending' };
type Member = { userId: string; name: string; role: Role; status: 'active' | 'pending' };
type Detail = { members: Member[]; activity: Array<{ id: string; actor_user_id: string | null; action: string; created_at: string }> };
type Command = { action: 'create'; requestId: string; name: string }
  | { action: 'invite' | 'resend' | 'revoke'; teamId: string; email: string; requestId: string }
  | { action: 'accept' | 'decline'; teamId: string }
  | { action: 'remove'; teamId: string; userId: string }
  | { action: 'set_role'; teamId: string; userId: string; role: 'admin' | 'member' };

export function teamMembershipPreviewAvailable() {
  const isolated = process.env.NEXT_PUBLIC_XROGA_TEAMS_PREVIEW_API_ORIGIN;
  return !!isolated && isolated === API_URL && !isProductionAuthBuild()
    && !['https://api.xroga.com','https://xroga.com','https://www.xroga.com'].includes(isolated);
}

// Initials and member attribution adapted from Elenchus Avatar.tsx (MIT).
function initials(name: string) {
  return (name || '?').split(' ').map(part => part[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

function message(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return 'Teams requires an active individual Paid subscription.';
  if (error instanceof ApiError && error.status === 404) return 'Team access is no longer available.';
  if (error instanceof ApiError && error.data?.code === 'INVITE_EMAIL_UNAVAILABLE') return 'Invitation email is not configured in this environment.';
  return 'The team request couldn’t be completed. Please try again.';
}

const actions: Record<string, string> = { create: 'created the team', accept: 'joined the team', remove: 'removed a member', set_role: 'changed a role' };

export function TeamMembershipPanel({ userId }: { userId: string }) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [selected, setSelected] = useState('');
  const [teamResponse, setTeamResponse] = useState<TeamResponse<Detail> | null>(null);
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const createAttempt = useRef<{ requestId: string; name: string } | null>(null);
  const inviteAttempt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const active = teams?.find(team => team.id === selected && team.status === 'active');
  const activeId = active?.id;
  const detail = currentTeamResponse(teamResponse, activeId, revision);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{data: Team[]}>('/api/team-membership', { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setTeams(data);
    }).catch(err => { if (!controller.signal.aborted) setError(message(err)); });
    return () => controller.abort();
  }, [revision, userId]);

  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    apiFetch<{data: Detail}>(`/api/team-membership/${activeId}`, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setTeamResponse({ teamId: activeId, revision, data });
    }).catch(err => { if (!controller.signal.aborted) setError(message(err)); });
    return () => controller.abort();
  }, [activeId, revision, userId]);

  async function submit(command: Command) {
    if (submitting.current) return;
    submitting.current = true;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data } = await apiFetch<{ data: { id?: string } }>('/api/team-membership', {
        method: 'POST', body: JSON.stringify(command),
      });
      if (command.action === 'create' && data.id) { createAttempt.current = null; setSelected(data.id); setName(''); }
      if (command.action === 'accept') setSelected(command.teamId);
      if (command.action === 'invite' || command.action === 'resend' || command.action === 'revoke') {
        inviteAttempt.current = null;
        setEmail('');
        setNotice(command.action === 'revoke'
          ? 'Revoke request processed. If a pending invitation matched, it can no longer be accepted.'
          : 'Request processed. If the invitation is eligible and within send limits, Xroga attempts email delivery.');
      }
      setRevision(value => value + 1);
    } catch (err) { setError(message(err)); }
    finally { submitting.current = false; setBusy(false); }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (createAttempt.current?.name !== trimmed) {
      createAttempt.current = { name: trimmed, requestId: crypto.randomUUID() };
    }
    void submit({ action: 'create', ...createAttempt.current });
  }

  return <section className={styles.teamSection}>
    <h3>Team membership</h3>
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {!teams && !error ? <p role="status">Loading teams…</p> : null}
    {teams ? <>
      <form onSubmit={create} className="grid gap-2">
        <label>Team name <input value={name} onChange={event => setName(event.target.value)} required maxLength={80} /></label>
        <button type="submit" disabled={busy}>Create team</button>
      </form>
      <label>Manage a team <select value={selected} disabled={busy} onChange={event => {
        setTeamResponse(null);
        setEmail('');
        setNotice('');
        setError('');
        setSelected(event.target.value);
      }}>
        <option value="">Choose a team</option>
        {teams.filter(team => team.status === 'active').map(team => <option value={team.id} key={team.id}>{team.name} ({team.role})</option>)}
      </select></label>
      {teams.filter(team => team.status === 'pending').map(team => <div key={team.id}>
        <p>Invitation to {team.name}</p>
        <button disabled={busy} onClick={() => void submit({ action: 'accept', teamId: team.id })}>Accept</button>
        <button disabled={busy} onClick={() => void submit({ action: 'decline', teamId: team.id })}>Decline</button>
      </div>)}
    </> : null}
    {active && !detail && !error ? <p role="status">Loading team details…</p> : null}
    {active && detail ? <>
      {(active.role === 'owner' || active.role === 'admin') ? <form className="grid gap-2" onSubmit={event => {
        event.preventDefault();
        const value = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
        const action = value === 'resend' || value === 'revoke' ? value : 'invite';
        const recipient = email.trim().toLowerCase();
        const fingerprint = JSON.stringify([active.id, action, recipient]);
        if (inviteAttempt.current?.fingerprint !== fingerprint) {
          inviteAttempt.current = { fingerprint, requestId: crypto.randomUUID() };
        }
        void submit({ action, teamId: active.id, email: recipient, requestId: inviteAttempt.current.requestId });
      }}>
        <label>Account email <input type="email" required maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label>
        <button type="submit" value="invite" disabled={busy}>Send invitation</button>
        <button type="submit" value="resend" disabled={busy}>Resend pending invitation</button>
        <button type="submit" value="revoke" disabled={busy}>Revoke pending invitation</button>
      </form> : null}
      <h3>Members</h3>
      <ul>{detail.members.map(member => {
        const manage = member.userId !== userId && member.role !== 'owner'
          && (active.role === 'owner' || (active.role === 'admin' && member.role === 'member'));
        return <li key={member.userId} className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-full bg-foreground/10 text-xs">{initials(member.name)}</span>
          <span>{member.name} · {member.role}{member.status === 'pending' ? ' · invited' : ''}</span>
          {manage ? <button type="button" disabled={busy} onClick={() => void submit({ action: 'remove', teamId: active.id, userId: member.userId })}>Remove</button> : null}
          {manage && active.role === 'owner' && member.status === 'active' ? <button type="button" disabled={busy} onClick={() =>
            void submit({ action: 'set_role', teamId: active.id, userId: member.userId, role: member.role === 'admin' ? 'member' : 'admin' })}>
            {member.role === 'admin' ? 'Make member' : 'Make admin'}
          </button> : null}
        </li>;
      })}</ul>
      <h3>Recent membership activity</h3>
      <ul>{detail.activity.map(event => <li key={event.id}>{detail.members.find(member => member.userId === event.actor_user_id)?.name ?? 'Former member'} {actions[event.action]} · {new Date(event.created_at).toLocaleDateString()}</li>)}</ul>
    </> : null}
  </section>;
}
