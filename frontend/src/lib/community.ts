import { API_URL, getAccessToken } from '@/lib/api';

export const COMMUNITY_ROLES = ['member', 'moderator', 'admin', 'owner'] as const;
export type CommunityRole = (typeof COMMUNITY_ROLES)[number];
export type CommunityCategory = 'feedback' | 'feature_request' | 'bug' | 'question';
export type CommunityStatus = 'open' | 'under_review' | 'planned' | 'building' | 'released' | 'solved' | 'closed';
export type OfficialIdentity = 'xroga_owner' | 'xroga_team' | 'xroga_ai_ceo';

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

export class CommunityApiError extends Error {
  constructor(public readonly status: number, public readonly code?: string) {
    super('Community request failed');
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken().catch(() => null);
  const response = await fetch(`${API_URL}/api/community${path}`, {
    ...init,
    cache: init?.method ? 'no-store' : 'no-store',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({})) as { error?: string; code?: string } & T;
  if (!response.ok) {
    const error = new CommunityApiError(response.status, payload.code);
    error.message = payload.error ?? 'The community request could not be completed.';
    throw error;
  }
  return payload;
}

export const communityApi = {
  me: () => request<{ authenticated: boolean; userId: string | null; role: CommunityRole }>('/me'),
  list: (params: URLSearchParams) => request<{ posts: CommunityPost[]; nextCursor: string | null }>(`/posts?${params}`),
  get: (postId: string) => request<{ post: CommunityPost; comments: CommunityComment[] }>(`/posts/${postId}`),
  createPost: (input: { category: CommunityCategory; title: string; body: string }) =>
    request<{ post: CommunityPost }>('/posts', { method: 'POST', body: JSON.stringify(input) }),
  createComment: (postId: string, input: { body: string; officialIdentity?: OfficialIdentity | null }) =>
    request<{ comment: CommunityComment }>(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify(input) }),
  updateComment: (commentId: string, input: Partial<{ body: string; isAcceptedAnswer: boolean; isHidden: boolean }>) =>
    request<void>(`/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteComment: (commentId: string) => request<void>(`/comments/${commentId}`, { method: 'DELETE' }),
  vote: (postId: string, enabled: boolean) => request<{ voted: boolean }>(`/posts/${postId}/vote`, { method: enabled ? 'PUT' : 'DELETE' }),
  summary: () => request<Record<string, number | string>>('/admin/summary'),
  moderate: (postId: string, input: Partial<{ status: CommunityStatus; isPinned: boolean; isHidden: boolean; isLocked: boolean }>) =>
    request<{ post: CommunityPost }>(`/admin/posts/${postId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  notes: (postId: string) => request<{ notes: Array<{ id: string; note: string; created_at: string }> }>(`/admin/posts/${postId}/notes`),
  addNote: (postId: string, note: string) => request<{ note: { id: string; note: string; created_at: string } }>(`/admin/posts/${postId}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
  deletePost: (postId: string) => request<void>(`/posts/${postId}`, { method: 'DELETE' }),
};

export const communityCategoryLabel: Record<CommunityCategory, string> = {
  feedback: 'Feedback',
  feature_request: 'Feature Request',
  bug: 'Bug Report',
  question: 'Question',
};

export const communityStatusLabel: Record<CommunityStatus, string> = {
  open: 'Open',
  under_review: 'Under Review',
  planned: 'Planned',
  building: 'Building',
  released: 'Released',
  solved: 'Solved',
  closed: 'Closed',
};
