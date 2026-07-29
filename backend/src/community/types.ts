export const COMMUNITY_ROLES = ['member', 'moderator', 'admin', 'owner'] as const;
export type CommunityRole = (typeof COMMUNITY_ROLES)[number];

export const COMMUNITY_CATEGORIES = ['feedback', 'feature_request', 'bug', 'question'] as const;
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];

export const COMMUNITY_STATUSES = [
  'open',
  'under_review',
  'planned',
  'building',
  'released',
  'solved',
  'closed',
] as const;
export type CommunityStatus = (typeof COMMUNITY_STATUSES)[number];

export const OFFICIAL_IDENTITIES = ['xroga_owner', 'xroga_team', 'xroga_ai_ceo'] as const;
export type OfficialIdentity = (typeof OFFICIAL_IDENTITIES)[number];

export interface CommunityAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  author: CommunityAuthor;
  category: CommunityCategory;
  title: string;
  body: string;
  status: CommunityStatus;
  isPinned: boolean;
  isHidden: boolean;
  isLocked: boolean;
  voteCount: number;
  commentCount: number;
  hasOfficialResponse: boolean;
  viewerHasVoted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorId: string;
  author: CommunityAuthor;
  body: string;
  officialIdentity: OfficialIdentity | null;
  isAcceptedAnswer: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export function isCommunityStaff(role: CommunityRole): boolean {
  return role === 'moderator' || role === 'admin' || role === 'owner';
}

export function canPermanentlyDelete(role: CommunityRole): boolean {
  return role === 'admin' || role === 'owner';
}

export function canUseOfficialIdentity(role: CommunityRole, identity: OfficialIdentity): boolean {
  if (identity === 'xroga_team') return isCommunityStaff(role);
  return role === 'owner';
}
