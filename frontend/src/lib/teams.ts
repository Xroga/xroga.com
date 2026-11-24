import { apiFetch } from '@/lib/api';

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';
export type InviteRole = 'admin' | 'member' | 'viewer';

export interface TeamSummary { id: string; name: string; role: TeamRole; canInvite: boolean; memberCount: number }
export interface TeamInvitationForMe { id: string; teamName: string; role: InviteRole; expiresAt: string; invitedBy: string }
export interface TeamInbox { teams: TeamSummary[]; invitations: TeamInvitationForMe[] }

export interface TeamMember {
  userId: string; role: TeamRole; canInvite: boolean; joinedAt: string;
  username: string | null; displayName: string | null; avatarUrl: string | null;
}
export interface PendingInvite { id: string; role: InviteRole; expiresAt: string; username: string | null; displayName: string | null }
export interface InviteLink { id: string; role: InviteRole; expiresAt: string; maxUses: number; useCount: number; createdAt: string }
export interface TeamOverview {
  team: { id: string; name: string; limit: number };
  me: { role: TeamRole; canInvite: boolean };
  members: TeamMember[];
  pending: PendingInvite[];
  links: InviteLink[];
}
export interface FoundUser { id: string; username: string; displayName: string | null; avatarUrl: string | null; alreadyMember: boolean }
export interface LinkPreview { teamName: string; role: InviteRole; expiresAt: string; invitedBy: string }

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const teamsApi = {
  inbox: () => apiFetch<TeamInbox>('/api/teams'),
  create: (name: string) => apiFetch<{ id: string; name: string }>('/api/teams', { method: 'POST', ...json({ name }) }),
  overview: (teamId: string) => apiFetch<TeamOverview>(`/api/teams/${teamId}`),
  activity: (teamId: string) => apiFetch<TeamActivityItem[]>(`/api/teams/${teamId}/activity`),
  search: (teamId: string, q: string) => apiFetch<FoundUser[]>(`/api/teams/${teamId}/search?q=${encodeURIComponent(q)}`),
  invite: (teamId: string, userId: string, role: InviteRole) =>
    apiFetch(`/api/teams/${teamId}/invitations`, { method: 'POST', ...json({ userId, role }) }),
  createLink: (teamId: string, input: { role: 'member' | 'viewer'; hours: number; maxUses: number }) =>
    apiFetch<{ id: string; token: string; path: string }>(`/api/teams/${teamId}/links`, { method: 'POST', ...json(input) }),
  respond: (invitationId: string, accept: boolean) =>
    apiFetch<{ status: string; teamId?: string }>(`/api/teams/invitations/${invitationId}/respond`, { method: 'POST', ...json({ accept }) }),
  revoke: (invitationId: string) => apiFetch(`/api/teams/invitations/${invitationId}`, { method: 'DELETE' }),
  removeMember: (teamId: string, userId: string) => apiFetch(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),
  setMember: (teamId: string, userId: string, role: InviteRole, canInvite: boolean) =>
    apiFetch(`/api/teams/${teamId}/members/${userId}`, { method: 'PATCH', ...json({ role, canInvite }) }),
  previewLink: (token: string) => apiFetch<LinkPreview>(`/api/teams/join/${encodeURIComponent(token)}`),
  acceptLink: (token: string) => apiFetch<{ status: string; teamId: string }>(`/api/teams/join/${encodeURIComponent(token)}`, { method: 'POST' }),
};

/** A full invitation URL from a token path, using the current origin. */
export function inviteUrl(path: string): string {
  return `${typeof window === 'undefined' ? 'https://xroga.com' : window.location.origin}${path}`;
}

export function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong. Try again.';
}

export interface TeamActivityItem {
  id: number;
  action: string;
  at: string;
  detail: { role?: string; maxUses?: number; hours?: number; kind?: string; canInvite?: boolean };
  actor: { userId: string | null; username: string | null; displayName: string | null; avatarUrl: string | null };
  target: { username: string | null; displayName: string | null } | null;
}

/** Tell every mounted Team surface (panel, page, invitation popup) to reload. */
export const TEAM_CHANGED_EVENT = 'xroga:team-changed';
export function announceTeamChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TEAM_CHANGED_EVENT));
}

/** One plain sentence for an audit row, from the viewer's point of view. */
export function describeActivity(item: TeamActivityItem, myId?: string | null): string {
  const who = item.actor.userId && item.actor.userId === myId ? 'You' : (item.actor.displayName || item.actor.username || 'Someone');
  const target = item.target ? (item.target.displayName || item.target.username || 'a member') : 'a member';
  switch (item.action) {
    case 'team_created': return `${who} created the team`;
    case 'invite_user': return `${who} invited ${target}${item.detail.role ? ` as ${item.detail.role}` : ''}`;
    case 'accept': return `${who} accepted the invitation and joined`;
    case 'decline': return `${who} declined the invitation`;
    case 'create_link': return `${who} created an invite link${item.detail.role ? ` for ${item.detail.role}s` : ''}`;
    case 'accept_link': return `${who} joined with an invite link`;
    case 'revoke': return `${who} cancelled ${item.detail.kind === 'link' ? 'an invite link' : 'an invitation'}`;
    case 'remove_member': return `${who} removed ${target}`;
    case 'leave': return `${who} left the team`;
    case 'set_member': return `${who} changed ${target}'s access${item.detail.role ? ` to ${item.detail.role}` : ''}`;
    default: return `${who} updated the team`;
  }
}
