import { getSupabaseAdmin } from '../config/supabase.js';
import {
  canPermanentlyDelete,
  canUseOfficialIdentity,
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
  private readonly db = getSupabaseAdmin();

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
    const role = await this.role(viewerId);
    const staff = isCommunityStaff(role);
    const fetchLimit = input.filter === 'trending' || input.filter === 'unanswered' || input.official === 'missing'
      ? Math.min(100, input.limit * 4)
      : input.limit + 1;
    let request = this.db.from('community_posts').select(POST_COLUMNS);
    if (!staff || input.hidden === 'exclude') request = request.eq('is_hidden', false);
    if (staff && input.hidden === 'only') request = request.eq('is_hidden', true);
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
    const role = await this.role(viewerId);
    const staff = isCommunityStaff(role);
    let postRequest = this.db.from('community_posts').select(POST_COLUMNS).eq('id', postId);
    if (!staff) postRequest = postRequest.eq('is_hidden', false);
    const row = await query<DbRow | null>(postRequest.maybeSingle(), 'The community post is temporarily unavailable.');
    if (!row) throw new CommunityServiceError(404, 'POST_NOT_FOUND', 'Community post not found.');
    let commentRequest = this.db.from('community_comments').select(COMMENT_COLUMNS).eq('post_id', postId);
    if (!staff) commentRequest = commentRequest.eq('is_hidden', false);
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
    const rows = await query<DbRow[]>(
      this.db.from('community_posts').insert({ author_id: userId, category: input.category, title: input.title, body: input.body }).select(POST_COLUMNS),
      'Your post could not be published.',
    );
    return (await this.enrichPosts(rows, userId))[0];
  }

  async updatePost(userId: string, postId: string, input: UpdateCommunityPostInput): Promise<CommunityPost> {
    const role = await this.role(userId);
    const current = await query<DbRow | null>(this.db.from('community_posts').select(POST_COLUMNS).eq('id', postId).maybeSingle(), 'The post could not be checked.');
    if (!current) throw new CommunityServiceError(404, 'POST_NOT_FOUND', 'Community post not found.');
    if (text(current, 'author_id') !== userId && !isCommunityStaff(role)) throw new CommunityServiceError(403, 'FORBIDDEN', 'You cannot edit this post.');
    if (bool(current, 'is_locked') && !isCommunityStaff(role)) throw new CommunityServiceError(423, 'POST_LOCKED', 'This discussion is locked.');
    const rows = await query<DbRow[]>(this.db.from('community_posts').update(input).eq('id', postId).select(POST_COLUMNS), 'The post could not be updated.');
    return (await this.enrichPosts(rows, userId))[0];
  }

  async deletePost(userId: string, postId: string): Promise<void> {
    const role = await this.role(userId);
    const current = await query<DbRow | null>(this.db.from('community_posts').select('author_id,is_locked').eq('id', postId).maybeSingle(), 'The post could not be checked.');
    if (!current) throw new CommunityServiceError(404, 'POST_NOT_FOUND', 'Community post not found.');
    const owns = text(current, 'author_id') === userId;
    if (!owns && !canPermanentlyDelete(role)) throw new CommunityServiceError(403, 'FORBIDDEN', 'Permanent deletion requires an administrator.');
    if (owns && bool(current, 'is_locked') && !canPermanentlyDelete(role)) throw new CommunityServiceError(423, 'POST_LOCKED', 'This discussion is locked.');
    await query(this.db.from('community_posts').delete().eq('id', postId), 'The post could not be deleted.');
  }

  async createComment(userId: string, postId: string, input: CreateCommunityCommentInput): Promise<CommunityComment> {
    const role = await this.role(userId);
    const post = await query<DbRow | null>(this.db.from('community_posts').select('id,is_hidden,is_locked').eq('id', postId).maybeSingle(), 'The discussion could not be checked.');
    if (!post || (bool(post, 'is_hidden') && !isCommunityStaff(role))) throw new CommunityServiceError(404, 'POST_NOT_FOUND', 'Community post not found.');
    if (bool(post, 'is_locked') && !isCommunityStaff(role)) throw new CommunityServiceError(423, 'POST_LOCKED', 'This discussion is locked.');
    if (input.officialIdentity && !canUseOfficialIdentity(role, input.officialIdentity)) {
      throw new CommunityServiceError(403, 'OFFICIAL_IDENTITY_FORBIDDEN', 'You cannot use that official identity.');
    }
    const rows = await query<DbRow[]>(this.db.from('community_comments').insert({ post_id: postId, author_id: userId, body: input.body, official_identity: input.officialIdentity ?? null }).select(COMMENT_COLUMNS), 'Your reply could not be published.');
    const profiles = await this.profiles([userId]);
    const row = rows[0];
    return {
      id: text(row, 'id'), postId, authorId: userId, author: profileToAuthor(profiles.get(userId), userId),
      body: text(row, 'body'), officialIdentity: input.officialIdentity ?? null,
      isAcceptedAnswer: false, isHidden: false, createdAt: text(row, 'created_at'), updatedAt: text(row, 'updated_at'),
    };
  }

  async updateComment(userId: string, commentId: string, input: UpdateCommunityCommentInput): Promise<void> {
    const role = await this.role(userId);
    const current = await query<DbRow | null>(this.db.from('community_comments').select('author_id,post_id').eq('id', commentId).maybeSingle(), 'The reply could not be checked.');
    if (!current) throw new CommunityServiceError(404, 'COMMENT_NOT_FOUND', 'Reply not found.');
    const ownsComment = text(current, 'author_id') === userId;
    let allowed = ownsComment && input.isHidden === undefined && input.isAcceptedAnswer === undefined;
    if (isCommunityStaff(role)) allowed = true;
    if (!allowed && input.isAcceptedAnswer !== undefined) {
      const post = await query<DbRow | null>(this.db.from('community_posts').select('author_id').eq('id', text(current, 'post_id')).maybeSingle(), 'The post owner could not be checked.');
      allowed = text(post ?? {}, 'author_id') === userId;
    }
    if (!allowed) throw new CommunityServiceError(403, 'FORBIDDEN', 'You cannot update this reply.');
    const patch: Record<string, unknown> = {};
    if (input.body !== undefined) patch.body = input.body;
    if (input.isHidden !== undefined) patch.is_hidden = input.isHidden;
    if (input.isAcceptedAnswer !== undefined) patch.is_accepted_answer = input.isAcceptedAnswer;
    await query(this.db.from('community_comments').update(patch).eq('id', commentId), 'The reply could not be updated.');
  }

  async deleteComment(userId: string, commentId: string): Promise<void> {
    const role = await this.role(userId);
    const current = await query<DbRow | null>(this.db.from('community_comments').select('author_id').eq('id', commentId).maybeSingle(), 'The reply could not be checked.');
    if (!current) throw new CommunityServiceError(404, 'COMMENT_NOT_FOUND', 'Reply not found.');
    if (text(current, 'author_id') !== userId && !canPermanentlyDelete(role)) throw new CommunityServiceError(403, 'FORBIDDEN', 'Permanent deletion requires an administrator.');
    await query(this.db.from('community_comments').delete().eq('id', commentId), 'The reply could not be deleted.');
  }

  async setVote(userId: string, postId: string, enabled: boolean): Promise<{ voted: boolean }> {
    const post = await query<DbRow | null>(this.db.from('community_posts').select('id,is_hidden').eq('id', postId).maybeSingle(), 'The post could not be checked.');
    if (!post || bool(post, 'is_hidden')) throw new CommunityServiceError(404, 'POST_NOT_FOUND', 'Community post not found.');
    if (enabled) {
      const { error } = await this.db.from('community_votes').upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
      if (error) throw new CommunityServiceError(503, 'COMMUNITY_STORAGE_UNAVAILABLE', 'The vote could not be recorded.');
    } else {
      await query(this.db.from('community_votes').delete().eq('post_id', postId).eq('user_id', userId), 'The vote could not be removed.');
    }
    return { voted: enabled };
  }

  async moderatePost(userId: string, postId: string, input: ModerateCommunityPostInput): Promise<CommunityPost> {
    const role = await this.role(userId);
    if (!isCommunityStaff(role)) throw new CommunityServiceError(403, 'COMMUNITY_ADMIN_REQUIRED', 'Community staff access is required.');
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) patch.status = input.status;
    if (input.isPinned !== undefined) patch.is_pinned = input.isPinned;
    if (input.isHidden !== undefined) patch.is_hidden = input.isHidden;
    if (input.isLocked !== undefined) patch.is_locked = input.isLocked;
    const rows = await query<DbRow[]>(this.db.from('community_posts').update(patch).eq('id', postId).select(POST_COLUMNS), 'The moderation action could not be completed.');
    if (!rows.length) throw new CommunityServiceError(404, 'POST_NOT_FOUND', 'Community post not found.');
    return (await this.enrichPosts(rows, userId))[0];
  }

  async addNote(userId: string, postId: string, note: string): Promise<DbRow> {
    const role = await this.role(userId);
    if (!isCommunityStaff(role)) throw new CommunityServiceError(403, 'COMMUNITY_ADMIN_REQUIRED', 'Community staff access is required.');
    const rows = await query<DbRow[]>(this.db.from('community_admin_notes').insert({ post_id: postId, author_id: userId, note }).select('id,post_id,author_id,note,created_at,updated_at'), 'The internal note could not be saved.');
    return rows[0];
  }

  async notes(userId: string, postId: string): Promise<DbRow[]> {
    const role = await this.role(userId);
    if (!isCommunityStaff(role)) throw new CommunityServiceError(403, 'COMMUNITY_ADMIN_REQUIRED', 'Community staff access is required.');
    return query<DbRow[]>(this.db.from('community_admin_notes').select('id,post_id,author_id,note,created_at,updated_at').eq('post_id', postId).order('created_at', { ascending: false }), 'Internal notes are temporarily unavailable.');
  }

  async summary(userId: string): Promise<Record<string, number | string>> {
    const role = await this.role(userId);
    if (!isCommunityStaff(role)) throw new CommunityServiceError(403, 'COMMUNITY_ADMIN_REQUIRED', 'Community staff access is required.');
    const posts = await query<DbRow[]>(this.db.from('community_posts').select('category,status,is_hidden,created_at'), 'Community totals are temporarily unavailable.');
    const count = (predicate: (row: DbRow) => boolean) => posts.filter(predicate).length;
    return {
      role,
      open: count((row) => text(row, 'status') === 'open' && !bool(row, 'is_hidden')),
      underReview: count((row) => text(row, 'status') === 'under_review'),
      featureRequests: count((row) => text(row, 'category') === 'feature_request'),
      bugs: count((row) => text(row, 'category') === 'bug'),
      questions: count((row) => text(row, 'category') === 'question'),
      planned: count((row) => text(row, 'status') === 'planned'),
      building: count((row) => text(row, 'status') === 'building'),
      released: count((row) => text(row, 'status') === 'released'),
      hidden: count((row) => bool(row, 'is_hidden')),
    };
  }
}
