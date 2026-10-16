import { getSupabaseAdmin } from '../config/supabase.js';
import { randomUUID } from 'node:crypto';
import {
  isCommunityStaff,
  type CommunityAuthor,
  type CommunityComment,
  type CommunityPost,
  type CommunityRole,
} from './types.js';
import type {
  CommunityListInput,
  CreateCommunityCommentInput,
  CreateCommunityPostInput,
  ModerateCommunityPostInput,
  UpdateCommunityCommentInput,
  UpdateCommunityPostInput,
} from './schemas.js';

type DbRow = Record<string, unknown>;

const POST_COLUMNS = 'id,author_id,category,title,body,status,is_pinned,is_hidden,is_locked,created_at,updated_at';
const COMMENT_COLUMNS = 'id,post_id,author_id,body,official_identity,is_accepted_answer,is_hidden,created_at,updated_at';

export class CommunityServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function query<T>(request: unknown, safeMessage: string): Promise<T> {
  const result = await (request as PromiseLike<unknown>);
  const { data, error } = result as { data: unknown; error: { message?: unknown } | null };
  if (error) throw new CommunityServiceError(503, 'COMMUNITY_STORAGE_UNAVAILABLE', safeMessage);
  return data as T;
}

function text(row: DbRow, key: string, fallback = ''): string {
  const value = row[key];
  return typeof value === 'string' ? value : fallback;
}

function bool(row: DbRow, key: string): boolean {
  return row[key] === true;
}

/** Authorization is per field; permission to accept an answer cannot edit its author. */
export function canUpdateCommentFields(role: CommunityRole, ownsComment: boolean, ownsPost: boolean, input: UpdateCommunityCommentInput): boolean {
  if (isCommunityStaff(role)) return true;
  if (input.isHidden !== undefined) return false;
  if (input.body !== undefined && !ownsComment) return false;
  if (input.isAcceptedAnswer !== undefined && !ownsPost) return false;
  return input.body !== undefined || input.isAcceptedAnswer !== undefined;
}

function encodeCursor(row: DbRow): string {
  return Buffer.from(JSON.stringify({ createdAt: text(row, 'created_at'), id: text(row, 'id') })).toString('base64url');
}

function decodeCursor(cursor?: string): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    if (Number.isNaN(Date.parse(parsed.createdAt)) || !/^[0-9a-f-]{36}$/i.test(parsed.id)) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function profileToAuthor(row: DbRow | undefined, id: string): CommunityAuthor {
  return {
    id,
    username: row ? text(row, 'username', 'xroga_builder') : 'xroga_builder',
    displayName: row ? text(row, 'display_name', 'Xroga Builder') : 'Xroga Builder',
    avatarUrl: row && typeof row.avatar_url === 'string' ? row.avatar_url : null,
  };
}

export class CommunityService {
  constructor(private readonly db = getSupabaseAdmin()) {}

  async role(userId?: string): Promise<CommunityRole> {
    if (!userId) return 'member';
    const row = await query<DbRow | null>(
      this.db.from('profiles').select('role').eq('id', userId).maybeSingle(),
      'Community permission check is temporarily unavailable.',
    );
    const role = row ? text(row, 'role', 'member') : 'member';
    return ['member', 'moderator', 'admin', 'owner'].includes(role) ? role as CommunityRole : 'member';
  }

  private async profiles(authorIds: string[]): Promise<Map<string, DbRow>> {
    const unique = [...new Set(authorIds)].filter(Boolean);
    if (!unique.length) return new Map();
    const rows = await query<DbRow[]>(
      this.db.from('profiles').select('id,username,display_name,avatar_url').in('id', unique),
      'Community author information is temporarily unavailable.',
    );
    return new Map(rows.map((row) => [text(row, 'id'), row]));
  }

  private async enrichPosts(rows: DbRow[], viewerId?: string): Promise<CommunityPost[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => text(row, 'id'));
    const authorIds = rows.map((row) => text(row, 'author_id'));
    const [profiles, votes, comments, viewerVotes] = await Promise.all([
      this.profiles(authorIds),
      query<DbRow[]>(this.db.from('community_votes').select('post_id').in('post_id', ids), 'Vote totals are unavailable.'),
      query<DbRow[]>(this.db.from('community_comments').select('post_id,official_identity,is_hidden').in('post_id', ids), 'Comment totals are unavailable.'),
      viewerId
        ? query<DbRow[]>(this.db.from('community_votes').select('post_id').eq('user_id', viewerId).in('post_id', ids), 'Vote state is unavailable.')
        : Promise.resolve([] as DbRow[]),
    ]);
    const voteCounts = new Map<string, number>();
    const commentCounts = new Map<string, number>();
    const official = new Set<string>();
    const voted = new Set(viewerVotes.map((row) => text(row, 'post_id')));
    for (const vote of votes) {
      const id = text(vote, 'post_id');
      voteCounts.set(id, (voteCounts.get(id) ?? 0) + 1);
    }
    for (const comment of comments) {
      if (bool(comment, 'is_hidden')) continue;
      const id = text(comment, 'post_id');
      commentCounts.set(id, (commentCounts.get(id) ?? 0) + 1);
      if (comment.official_identity) official.add(id);
    }
    return rows.map((row) => {
      const id = text(row, 'id');
      const authorId = text(row, 'author_id');
      return {
        id,
        authorId,
        author: profileToAuthor(profiles.get(authorId), authorId),
        category: text(row, 'category') as CommunityPost['category'],
        title: text(row, 'title'),
        body: text(row, 'body'),
        status: text(row, 'status') as CommunityPost['status'],
        isPinned: bool(row, 'is_pinned'),
        isHidden: bool(row, 'is_hidden'),
        isLocked: bool(row, 'is_locked'),
        voteCount: voteCounts.get(id) ?? 0,
        commentCount: commentCounts.get(id) ?? 0,
        hasOfficialResponse: official.has(id),
        viewerHasVoted: voted.has(id),
        createdAt: text(row, 'created_at'),
        updatedAt: text(row, 'updated_at'),
      };
    });
  }

  async listPosts(input: CommunityListInput, viewerId?: string): Promise<{ posts: CommunityPost[]; nextCursor: string | null }> {
    const fetchLimit = input.filter === 'trending' || input.filter === 'unanswered' || input.official === 'missing'
      ? Math.min(100, input.limit * 4)
      : input.limit + 1;
    let request = this.db.rpc('visible_community_posts', { p_actor: viewerId ?? null }).select(POST_COLUMNS);
    if (input.hidden === 'exclude') request = request.eq('is_hidden', false);
    // Preserve the existing non-staff "only" fallback to visible posts. This
    // lookup affects filtering only, visibility is independently enforced by SQL.
    if (input.hidden === 'only' && isCommunityStaff(await this.role(viewerId))) request = request.eq('is_hidden', true);
    const category = input.category ?? (['feedback', 'feature_request', 'bug', 'question'].includes(input.filter) ? input.filter : undefined);
    const status = input.status ?? (['released', 'solved'].includes(input.filter) ? input.filter : undefined);
    if (category) request = request.eq('category', category);
    if (status) request = request.eq('status', status);
    if (input.from) request = request.gte('created_at', `${input.from}T00:00:00.000Z`);
    if (input.to) request = request.lt('created_at', `${input.to}T00:00:00.000Z`);
    if (input.search) request = request.textSearch('search_document', input.search, { config: 'english', type: 'websearch' });
    const cursor = decodeCursor(input.cursor);
    if (input.cursor && !cursor) throw new CommunityServiceError(400, 'INVALID_CURSOR', 'The pagination cursor is invalid.');
    if (cursor) request = request.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const rows = await query<DbRow[]>(
      request.order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(fetchLimit),
      'The community feed is temporarily unavailable.',
    );
    let enriched = await this.enrichPosts(rows, viewerId);
    if (input.filter === 'unanswered') enriched = enriched.filter((post) => post.commentCount === 0);
    if (input.official === 'missing') enriched = enriched.filter((post) => !post.hasOfficialResponse);
    if (input.filter === 'trending') {
      enriched.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || (b.voteCount * 3 + b.commentCount) - (a.voteCount * 3 + a.commentCount) || b.createdAt.localeCompare(a.createdAt));
    }
    const page = enriched.slice(0, input.limit);
    const last = rows[Math.min(rows.length, input.limit) - 1];
    return { posts: page, nextCursor: rows.length > input.limit && last ? encodeCursor(last) : null };
  }

  async getPost(postId: string, viewerId?: string): Promise<{ post: CommunityPost; comments: CommunityComment[] }> {
    const postRequest = this.db.rpc('visible_community_posts', { p_actor: viewerId ?? null }).select(POST_COLUMNS).eq('id', postId);
    const row = await query<DbRow | null>(postRequest.maybeSingle(), 'The community post is temporarily unavailable.');
    if (!row) throw new CommunityServiceError(404, 'POST_NOT_FOUND', 'Community post not found.');
    const commentRequest = this.db.rpc('visible_community_comments', { p_actor: viewerId ?? null, p_post: postId }).select(COMMENT_COLUMNS);
    const commentRows = await query<DbRow[]>(commentRequest.order('created_at', { ascending: true }), 'Comments are temporarily unavailable.');
    const posts = await this.enrichPosts([row], viewerId);
    const profiles = await this.profiles(commentRows.map((comment) => text(comment, 'author_id')));
    const comments: CommunityComment[] = commentRows.map((comment) => {
      const authorId = text(comment, 'author_id');
      return {
        id: text(comment, 'id'),
        postId: text(comment, 'post_id'),
        authorId,
        author: profileToAuthor(profiles.get(authorId), authorId),
        body: text(comment, 'body'),
        officialIdentity: comment.official_identity ? text(comment, 'official_identity') as CommunityComment['officialIdentity'] : null,
        isAcceptedAnswer: bool(comment, 'is_accepted_answer'),
        isHidden: bool(comment, 'is_hidden'),
        createdAt: text(comment, 'created_at'),
        updatedAt: text(comment, 'updated_at'),
      };
    });
    return { post: posts[0], comments };
  }

  async createPost(userId: string, input: CreateCommunityPostInput): Promise<CommunityPost> {
    const id = randomUUID();
    const row = await this.mutateItem(userId, 'create_post', id, { category: input.category, title: input.title, body: input.body },
      { id, author_id: userId, category: input.category, title: input.title, body: input.body });
    return (await this.enrichPosts([row], userId))[0];
  }

  private async mutateItem(userId: string, operation: string, target: string, payload: DbRow, expected: DbRow): Promise<DbRow> {
    const { data, error } = await this.db.rpc('mutate_community_item_authorized', {
      p_actor: userId, p_operation: operation, p_target: target, p_payload: payload,
    });
    if (error?.code === '42501') throw new CommunityServiceError(403, 'FORBIDDEN', 'You cannot change this community item.');
    if (error?.code === 'P0002') throw new CommunityServiceError(404, 'COMMUNITY_ITEM_NOT_FOUND', 'Community item not found.');
    if (error?.code === 'P0003') throw new CommunityServiceError(423, 'POST_LOCKED', 'This discussion is locked.');
    const row = data?.row;
    if (error || data?.operation !== operation || data?.target !== target || !row || typeof row !== 'object' || Array.isArray(row)
      || (operation !== 'vote_remove' && (typeof row.id !== 'string' || !row.id))
      || Object.entries(expected).some(([key,value]) => row[key] !== value)) {
      throw new CommunityServiceError(503, 'COMMUNITY_STORAGE_UNAVAILABLE', 'The community change could not be verified.');
    }
    return row;
  }

  async updatePost(userId: string, postId: string, input: UpdateCommunityPostInput): Promise<CommunityPost> {
    const patch: DbRow = {};
    for (const key of ['title', 'body', 'category'] as const) if (input[key] !== undefined) patch[key] = input[key];
    const row = await this.mutatePost(userId, postId, 'update', patch);
    return (await this.enrichPosts([row], userId))[0];
  }

  async deletePost(userId: string, postId: string): Promise<void> {
    await this.mutatePost(userId, postId, 'delete', {});
  }

  private async mutatePost(userId: string, postId: string, operation: 'update' | 'delete' | 'moderate', patch: DbRow): Promise<DbRow> {
    const { data, error } = await this.db.rpc('mutate_community_post_authorized', {
      p_actor: userId, p_post: postId, p_operation: operation, p_patch: patch,
    });
    if (error?.code === '42501') throw new CommunityServiceError(403, 'FORBIDDEN', 'You cannot change this post.');
    if (error?.code === 'P0002') throw new CommunityServiceError(404, 'POST_NOT_FOUND', 'Community post not found.');
    if (error?.code === 'P0003') throw new CommunityServiceError(423, 'POST_LOCKED', 'This discussion is locked.');
    const row = data?.post;
    if (error || !row || typeof row !== 'object' || Array.isArray(row) || data.operation !== operation
      || row.id !== postId || typeof row.author_id !== 'string'
      || Object.entries(patch).some(([key, value]) => row[key] !== value)) {
      throw new CommunityServiceError(503, 'COMMUNITY_STORAGE_UNAVAILABLE', 'The post change could not be verified.');
    }
    return row;
  }

  async createComment(userId: string, postId: string, input: CreateCommunityCommentInput): Promise<CommunityComment> {
    const row = await this.mutateItem(userId, 'create_comment', postId, { body: input.body, official_identity: input.officialIdentity ?? null },
      { post_id: postId, author_id: userId, body: input.body, official_identity: input.officialIdentity ?? null, is_hidden: false, is_accepted_answer: false });
    const profiles = await this.profiles([userId]);
    return {
      id: text(row, 'id'), postId, authorId: userId, author: profileToAuthor(profiles.get(userId), userId),
      body: text(row, 'body'), officialIdentity: input.officialIdentity ?? null,
      isAcceptedAnswer: false, isHidden: false, createdAt: text(row, 'created_at'), updatedAt: text(row, 'updated_at'),
    };
  }

  async updateComment(userId: string, commentId: string, input: UpdateCommunityCommentInput): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (input.body !== undefined) patch.body = input.body;
    if (input.isHidden !== undefined) patch.is_hidden = input.isHidden;
    if (input.isAcceptedAnswer !== undefined) patch.is_accepted_answer = input.isAcceptedAnswer;
    const { data, error } = await this.db.rpc('update_community_comment_authorized', {
      p_actor: userId, p_comment: commentId, p_patch: patch,
    });
    if (error?.code === '42501') throw new CommunityServiceError(403, 'FORBIDDEN', 'You cannot update this reply.');
    if (error?.code === 'P0002') throw new CommunityServiceError(404, 'COMMENT_NOT_FOUND', 'Reply not found.');
    if (error || !data || typeof data !== 'object' || Array.isArray(data)
      || data.id !== commentId || typeof data.author_id !== 'string' || typeof data.post_id !== 'string'
      || Object.entries(patch).some(([key, value]) => data[key] !== value)) {
      throw new CommunityServiceError(503, 'COMMUNITY_STORAGE_UNAVAILABLE', 'The reply update could not be verified.');
    }
  }

  async deleteComment(userId: string, commentId: string): Promise<void> {
    await this.mutateItem(userId, 'delete_comment', commentId, {}, { id: commentId });
  }

  async setVote(userId: string, postId: string, enabled: boolean): Promise<{ voted: boolean }> {
    await this.mutateItem(userId, enabled ? 'vote_add' : 'vote_remove', postId, {},
      { post_id: postId, user_id: userId, ...(!enabled ? { voted: false } : {}) });
    return { voted: enabled };
  }

  async moderatePost(userId: string, postId: string, input: ModerateCommunityPostInput): Promise<CommunityPost> {
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) patch.status = input.status;
    if (input.isPinned !== undefined) patch.is_pinned = input.isPinned;
    if (input.isHidden !== undefined) patch.is_hidden = input.isHidden;
    if (input.isLocked !== undefined) patch.is_locked = input.isLocked;
    const row = await this.mutatePost(userId, postId, 'moderate', patch);
    return (await this.enrichPosts([row], userId))[0];
  }

  async addNote(userId: string, postId: string, note: string): Promise<DbRow> {
    return this.mutateItem(userId, 'add_note', postId, { note }, { post_id: postId, author_id: userId, note });
  }

  async notes(userId: string, postId: string): Promise<DbRow[]> {
    const data = await query<DbRow | null>(this.db.rpc('read_community_staff_notes', { p_actor: userId, p_post: postId }), 'Internal notes are temporarily unavailable.');
    if (!data) throw new CommunityServiceError(403, 'COMMUNITY_ADMIN_REQUIRED', 'Community staff access is required.');
    if (!isCommunityStaff(data.role as CommunityRole) || !Array.isArray(data.notes)
      || data.notes.some(note => !note || typeof note !== 'object' || note.post_id !== postId || typeof note.note !== 'string')) {
      throw new CommunityServiceError(503, 'COMMUNITY_STORAGE_UNAVAILABLE', 'Internal notes could not be verified.');
    }
    return data.notes;
  }

  async summary(userId: string): Promise<Record<string, number | string>> {
    const data = await query<DbRow | null>(this.db.rpc('read_community_staff_summary', { p_actor: userId }), 'Community totals are temporarily unavailable.');
    if (!data) throw new CommunityServiceError(403, 'COMMUNITY_ADMIN_REQUIRED', 'Community staff access is required.');
    const counts = data.counts as DbRow | null;
    const keys = ['open','underReview','featureRequests','bugs','questions','planned','building','released','hidden'];
    if (!isCommunityStaff(data.role as CommunityRole) || !counts || typeof counts !== 'object'
      || keys.some(key => !Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0)) {
      throw new CommunityServiceError(503, 'COMMUNITY_STORAGE_UNAVAILABLE', 'Community totals could not be verified.');
    }
    return { role: data.role as CommunityRole, ...Object.fromEntries(keys.map(key => [key, counts[key] as number])) };
  }
}
