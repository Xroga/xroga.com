'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, UsersRound, X } from 'lucide-react';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { TEAM_CHANGED_EVENT, announceTeamChange, errorText, teamsApi, type TeamInvitationForMe } from '@/lib/teams';
import s from './TeamInvitePopup.module.css';

const SNOOZE_KEY = 'xroga:team-invite-snoozed';
const POLL_MS = 45_000;

function readSnoozed(): string[] {
  try { const v = JSON.parse(window.sessionStorage.getItem(SNOOZE_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
}

/**
 * Tells a signed-in user, wherever they are in the app, that someone invited them to a team,
 * and lets them accept or decline right there. Nothing is sent by email: it reads the user's
 * own invitations from the API (on load, on focus and every 45 seconds).
 */
export function TeamInvitePopup() {
  const identity = useWorkspaceIdentity();
  const [invites, setInvites] = useState<TeamInvitationForMe[]>([]);
  const [snoozed, setSnoozed] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState('');
  const authed = identity.status === 'authenticated';

  const load = useCallback(async () => {
    try { const inbox = await teamsApi.inbox(); setInvites(inbox.invitations); } catch { /* stay quiet: the popup is a courtesy, the Team panel shows real errors */ }
  }, []);

  useEffect(() => { setSnoozed(readSnoozed()); }, []);
  useEffect(() => {
    if (!authed) { setInvites([]); return; }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener(TEAM_CHANGED_EVENT, onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener(TEAM_CHANGED_EVENT, onFocus); };
  }, [authed, load]);
  useEffect(() => { if (!joined) return; const t = window.setTimeout(() => setJoined(''), 5000); return () => window.clearTimeout(t); }, [joined]);

  function later(id: string) {
    const next = [...snoozed, id];
    setSnoozed(next);
    try { window.sessionStorage.setItem(SNOOZE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }

  async function answer(invite: TeamInvitationForMe, accept: boolean) {
    setBusy(invite.id); setError('');
    try {
      await teamsApi.respond(invite.id, accept);
      setInvites(current => current.filter(item => item.id !== invite.id));
      if (accept) setJoined(`You joined ${invite.teamName}.`);
      announceTeamChange();
    } catch (e) { setError(errorText(e)); void load(); } finally { setBusy(null); }
  }

  const visible = invites.filter(invite => !snoozed.includes(invite.id)).slice(0, 2);
  if (!authed || (!visible.length && !joined)) return null;

  return (
    <div className={s.wrap} role="region" aria-label="Team invitations" aria-live="polite">
      {joined ? <div className={s.card}><p className={s.done}><Check size={16} />{joined} <Link href="/team" style={{ textDecoration: 'underline', marginLeft: 'auto', fontWeight: 600 }}>View team</Link></p></div> : null}
      {visible.map(invite => (
        <div key={invite.id} className={s.card}>
          <div className={s.top}>
            <span className={s.icon}><UsersRound size={19} /></span>
            <p className={s.text}><b>{invite.invitedBy}</b> invited you to join <b>{invite.teamName}</b> as {invite.role}.<small>Expires {new Date(invite.expiresAt).toLocaleDateString()}</small></p>
            <button type="button" className={s.close} aria-label="Decide later" title="Decide later" onClick={() => later(invite.id)}><X size={15} /></button>
          </div>
          {error ? <p role="alert" className={s.error}>{error}</p> : null}
          <div className={s.row}>
            <button type="button" className={`${s.btn} ${s.primary}`} disabled={busy === invite.id} onClick={() => answer(invite, true)}>{busy === invite.id ? <Loader2 size={14} /> : <Check size={14} />}Accept</button>
            <button type="button" className={s.btn} disabled={busy === invite.id} onClick={() => answer(invite, false)}>Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}
