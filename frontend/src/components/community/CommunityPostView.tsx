'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, MessageCircle, ShieldCheck, ThumbsUp, Trash2 } from 'lucide-react';
import {
  communityApi,
  communityCategoryLabel,
  communityStatusLabel,
  type CommunityComment,
  type CommunityPost,
  type CommunityRole,
} from '@/lib/community';

const officialLabels = {
  xroga_owner: 'Xroga Owner',
  xroga_team: 'Xroga Team',
  xroga_ai_ceo: 'Xroga AI CEO',
} as const;

export function CommunityPostView({ postId }: { postId: string }) {
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState<{ userId: string | null; role: CommunityRole }>({ userId: null, role: 'member' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [result, me] = await Promise.all([communityApi.get(postId), communityApi.me()]);
      setPost(result.post);
      setComments(result.comments);
      setViewer({ userId: me.userId, role: me.role });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This post could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { void load(); }, [load]);

  async function toggleVote() {
    if (!post) return;
    try {
      await communityApi.vote(post.id, !post.viewerHasVoted);
      setPost({ ...post, viewerHasVoted: !post.viewerHasVoted, voteCount: Math.max(0, post.voteCount + (post.viewerHasVoted ? -1 : 1)) });
    } catch (reason) {
      const status = typeof reason === 'object' && reason && 'status' in reason ? Number(reason.status) : 0;
      if (status === 401) window.location.assign(`/auth/login?next=${encodeURIComponent(`/community/${postId}`)}`);
      else setError(reason instanceof Error ? reason.message : 'Your vote could not be recorded.');
    }
  }

  async function reply(event: React.FormEvent) {
    event.preventDefault();
    if (body.trim().length < 1) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await communityApi.createComment(postId, { body: body.trim() });
      setComments((current) => [...current, result.comment]);
      setBody('');
      if (post) setPost({ ...post, commentCount: post.commentCount + 1 });
    } catch (reason) {
      const status = typeof reason === 'object' && reason && 'status' in reason ? Number(reason.status) : 0;
      if (status === 401) window.location.assign(`/auth/login?next=${encodeURIComponent(`/community/${postId}`)}`);
      else setError(reason instanceof Error ? reason.message : 'Your reply could not be published.');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateReply(comment: CommunityComment, patch: Partial<{ isAcceptedAnswer: boolean; isHidden: boolean }>) {
    setError('');
    try {
      await communityApi.updateComment(comment.id, patch);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The reply could not be updated.');
    }
  }

  async function deleteReply(comment: CommunityComment) {
    if (!window.confirm('Permanently delete this reply?')) return;
    setError('');
    try {
      await communityApi.deleteComment(comment.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The reply could not be deleted.');
    }
  }

  if (loading) return <div className="h-96 animate-pulse rounded-3xl bg-slate-100 dark:bg-white/[.05]" />;
  if (!post) return <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6" role="alert"><p>{error || 'Post not found.'}</p><Link href="/community" className="mt-3 inline-block font-bold underline">Back to community</Link></div>;

  return <div>
    <Link href="/community" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-[#006aff]"><ArrowLeft className="h-4 w-4" />Community</Link>
    <article className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[.04] sm:p-8">
      <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider"><span className="rounded-full bg-[#006aff]/10 px-2.5 py-1 text-[#006aff]">{communityCategoryLabel[post.category]}</span><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-300">{communityStatusLabel[post.status]}</span>{post.isLocked && <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-1"><Lock className="h-3 w-3" />Locked</span>}</div>
      <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">{post.title}</h1>
      <p className="mt-3 text-sm text-slate-500">Posted by <strong className="text-slate-700 dark:text-slate-200">{post.author.displayName}</strong> · {new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date(post.createdAt))}</p>
      <p className="mt-7 whitespace-pre-wrap break-words text-base leading-8 text-slate-700 dark:text-slate-200">{post.body}</p>
      <div className="mt-7 flex gap-3 border-t border-slate-100 pt-5 dark:border-white/10"><button type="button" onClick={() => void toggleVote()} aria-pressed={post.viewerHasVoted} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${post.viewerHasVoted ? 'bg-[#006aff] text-white' : 'bg-slate-100 dark:bg-white/[.07]'}`}><ThumbsUp className="h-4 w-4" />{post.voteCount}</button><span className="inline-flex items-center gap-2 text-sm text-slate-500"><MessageCircle className="h-4 w-4" />{post.commentCount} replies</span></div>
    </article>

    <section className="mt-7" aria-labelledby="replies-heading">
      <h2 id="replies-heading" className="text-xl font-black">Replies</h2>
      <div className="mt-3 space-y-3">
        {!comments.length && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-white/15">No replies yet. Help this builder if you can.</p>}
        {comments.map((comment) => <article key={comment.id} className={`rounded-2xl border p-4 sm:p-5 ${comment.isHidden ? 'border-amber-400/40 opacity-70' : comment.officialIdentity ? 'border-cyan-400/35 bg-cyan-400/[.06]' : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/[.035]'}`}>
          <div className="flex flex-wrap items-center gap-2 text-sm"><strong>{comment.author.displayName}</strong>{comment.officialIdentity && <span className="inline-flex items-center gap-1 rounded-full bg-[#006aff] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white"><ShieldCheck className="h-3 w-3" />{officialLabels[comment.officialIdentity]}</span>}{comment.isAcceptedAnswer && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Accepted answer</span>}</div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{comment.body}</p>
          {viewer.userId && <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            {(viewer.userId === post.authorId || ['moderator', 'admin', 'owner'].includes(viewer.role)) && <button type="button" onClick={() => void updateReply(comment, { isAcceptedAnswer: !comment.isAcceptedAnswer })} className="rounded-lg border px-2.5 py-1.5">{comment.isAcceptedAnswer ? 'Remove accepted answer' : 'Accept answer'}</button>}
            {['moderator', 'admin', 'owner'].includes(viewer.role) && <button type="button" onClick={() => void updateReply(comment, { isHidden: !comment.isHidden })} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5">{comment.isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{comment.isHidden ? 'Restore' : 'Hide'}</button>}
            {(viewer.userId === comment.authorId || viewer.role === 'admin' || viewer.role === 'owner') && <button type="button" onClick={() => void deleteReply(comment)} className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 px-2.5 py-1.5 text-red-600"><Trash2 className="h-3.5 w-3.5" />Delete</button>}
          </div>}
        </article>)}
      </div>
    </section>

    <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[.04]">
      {post.isLocked && !['moderator', 'admin', 'owner'].includes(viewer.role) ? <p className="inline-flex items-center gap-2 text-sm font-semibold"><Lock className="h-4 w-4" />This discussion is locked. Existing replies remain visible.</p> : <form onSubmit={reply}><label htmlFor="community-reply" className="font-bold">Add a reply</label><textarea id="community-reply" value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={5} required disabled={submitting} className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-white/10" placeholder="Share a helpful answer or update." />{error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}<button type="submit" disabled={submitting} className="mt-3 rounded-xl bg-[#006aff] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{submitting ? 'Publishing…' : 'Publish reply'}</button></form>}
    </section>
  </div>;
}
