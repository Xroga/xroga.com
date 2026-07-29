'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, MessageSquareReply, Pin, PinOff, RefreshCw, Trash2 } from 'lucide-react';
import {
  communityApi,
  communityCategoryLabel,
  communityStatusLabel,
  type CommunityPost,
  type CommunityRole,
  type CommunityStatus,
  type OfficialIdentity,
} from '@/lib/community';

const statuses = Object.entries(communityStatusLabel) as Array<[CommunityStatus, string]>;

export function CommunityAdminDashboard({ role }: { role: CommunityRole }) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [summary, setSummary] = useState<Record<string, number | string>>({});
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [hidden, setHidden] = useState('include');
  const [unanswered, setUnanswered] = useState(false);
  const [missingOfficial, setMissingOfficial] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [replying, setReplying] = useState<CommunityPost | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [identity, setIdentity] = useState<OfficialIdentity>('xroga_team');
  const [notePost, setNotePost] = useState<CommunityPost | null>(null);
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<Array<{ id: string; note: string; created_at: string }>>([]);

  const load = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({ filter: unanswered ? 'unanswered' : 'new', hidden, limit: '50' });
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      if (status) params.set('status', status);
      if (missingOfficial) params.set('official', 'missing');
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const [feed, totals] = await Promise.all([communityApi.list(params), communityApi.summary()]);
      setPosts(feed.posts);
      setSummary(totals);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Community management data is unavailable.');
    }
  }, [category, from, hidden, missingOfficial, search, status, to, unanswered]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);

  async function moderate(post: CommunityPost, patch: Partial<{ status: CommunityStatus; isPinned: boolean; isHidden: boolean; isLocked: boolean }>) {
    setWorking(post.id);
    setError('');
    try {
      const result = await communityApi.moderate(post.id, patch);
      setPosts((current) => current.map((item) => item.id === post.id ? result.post : item));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The moderation action failed.');
    } finally { setWorking(''); }
  }

  async function publishOfficial() {
    if (!replying || !replyBody.trim()) return;
    setWorking(replying.id);
    try {
      await communityApi.createComment(replying.id, { body: replyBody.trim(), officialIdentity: identity });
      setReplying(null); setReplyBody(''); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The official reply failed.'); }
    finally { setWorking(''); }
  }

  async function saveNote() {
    if (!notePost || !note.trim()) return;
    setWorking(notePost.id);
    try { await communityApi.addNote(notePost.id, note.trim()); setNote(''); setNotes((await communityApi.notes(notePost.id)).notes); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The private note failed.'); }
    finally { setWorking(''); }
  }

  async function openNotes(post: CommunityPost) {
    setNotePost(post);
    setNotes([]);
    setError('');
    try { setNotes((await communityApi.notes(post.id)).notes); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Private notes could not be loaded.'); }
  }

  async function remove(post: CommunityPost) {
    if (!window.confirm(`Permanently delete “${post.title}” and its replies? This cannot be undone.`)) return;
    setWorking(post.id);
    try { await communityApi.deletePost(post.id); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The post could not be deleted.'); }
    finally { setWorking(''); }
  }

  const cards = [
    ['Open', summary.open], ['Under Review', summary.underReview], ['Feature Requests', summary.featureRequests],
    ['Bugs', summary.bugs], ['Questions', summary.questions], ['Planned', summary.planned],
    ['Building', summary.building], ['Released', summary.released], ['Hidden', summary.hidden],
  ];

  return <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#060a0f] dark:text-white">
    <header className="border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#060a0f]"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#006aff]">Private operations</p><h1 className="text-2xl font-black">Community Admin</h1></div><div className="flex gap-2"><Link href="/community" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold dark:border-white/10">Public community</Link><button type="button" onClick={() => void load()} aria-label="Refresh community data" className="rounded-xl border border-slate-200 p-2 dark:border-white/10"><RefreshCw className="h-4 w-4" /></button></div></div></header>
    <main className="mx-auto max-w-7xl px-4 py-7">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">{cards.map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[.04]"><p className="text-2xl font-black">{typeof value === 'number' ? value : '—'}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p></div>)}</div>
      <div className="mt-6 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[.04] md:grid-cols-8">
        <input aria-label="Search posts" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search posts" className="rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-white/10 md:col-span-2" />
        <select aria-label="Filter category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-sm dark:border-white/10"><option value="">All categories</option>{Object.entries(communityCategoryLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-sm dark:border-white/10"><option value="">All statuses</option>{statuses.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select aria-label="Filter visibility" value={hidden} onChange={(event) => setHidden(event.target.value)} className="rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-sm dark:border-white/10"><option value="include">Visible + hidden</option><option value="exclude">Visible only</option><option value="only">Hidden only</option></select>
        <input aria-label="Posts from date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-sm dark:border-white/10" />
        <input aria-label="Posts before date" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-sm dark:border-white/10" />
        <div className="flex flex-col justify-center gap-1 text-xs"><label><input type="checkbox" checked={unanswered} onChange={(event) => setUnanswered(event.target.checked)} /> Unanswered</label><label><input type="checkbox" checked={missingOfficial} onChange={(event) => setMissingOfficial(event.target.checked)} /> No official reply</label></div>
      </div>
      {error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      <div className="mt-4 space-y-3">{posts.map((post) => <article key={post.id} className={`rounded-2xl border bg-white p-4 dark:bg-white/[.04] ${post.isHidden ? 'border-amber-400/40 opacity-75' : 'border-slate-200 dark:border-white/10'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-1 text-[10px] font-bold uppercase"><span className="text-[#006aff]">{communityCategoryLabel[post.category]}</span><span>·</span><span>{post.author.displayName}</span><span>·</span><span>{post.voteCount} votes</span><span>·</span><span>{post.commentCount} replies</span></div><Link href={`/community/${post.id}`} className="mt-1 block truncate text-base font-black hover:text-[#006aff]">{post.title}</Link></div>
          <select aria-label={`Status for ${post.title}`} value={post.status} disabled={working === post.id} onChange={(event) => void moderate(post, { status: event.target.value as CommunityStatus })} className="rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-xs dark:border-white/10">{statuses.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <div className="flex flex-wrap gap-1"><button title={post.isPinned ? 'Unpin' : 'Pin'} aria-label={post.isPinned ? 'Unpin post' : 'Pin post'} onClick={() => void moderate(post, { isPinned: !post.isPinned })} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10">{post.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button><button title={post.isHidden ? 'Restore' : 'Hide'} aria-label={post.isHidden ? 'Restore post' : 'Hide post'} onClick={() => void moderate(post, { isHidden: !post.isHidden })} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10">{post.isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button><button title={post.isLocked ? 'Unlock' : 'Lock'} aria-label={post.isLocked ? 'Unlock post' : 'Lock post'} onClick={() => void moderate(post, { isLocked: !post.isLocked })} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10">{post.isLocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</button><button title="Official reply" aria-label="Add official reply" onClick={() => setReplying(post)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10"><MessageSquareReply className="h-4 w-4" /></button><button title="Private note" onClick={() => void openNotes(post)} className="rounded-lg px-2 py-1 text-xs font-bold hover:bg-slate-100 dark:hover:bg-white/10">Notes</button>{(role === 'admin' || role === 'owner') && <button title="Delete permanently" aria-label="Delete post permanently" onClick={() => void remove(post)} className="rounded-lg p-2 text-red-600 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>}</div>
        </div>
      </article>)}</div>
      {!posts.length && !error && <p className="mt-8 text-center text-sm text-slate-500">No community posts match these filters.</p>}
    </main>

    {(replying || notePost) && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && (setReplying(null), setNotePost(null))}>
      <div role="dialog" aria-modal="true" aria-labelledby="community-admin-dialog-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-slate-950 shadow-2xl dark:bg-slate-900 dark:text-white">
        <h2 id="community-admin-dialog-title" className="text-lg font-black">{replying ? 'Official reply' : 'Private internal notes'}</h2>
        <p className="mt-1 truncate text-sm text-slate-500">{(replying ?? notePost)?.title}</p>
        {replying && <select aria-label="Official identity" value={identity} onChange={(event) => setIdentity(event.target.value as OfficialIdentity)} className="mt-4 w-full rounded-lg border p-2 dark:bg-slate-950"><option value="xroga_team">Xroga Team</option>{role === 'owner' && <><option value="xroga_owner">Xroga Owner</option><option value="xroga_ai_ceo">Xroga AI CEO</option></>}</select>}
        {notePost && notes.length > 0 && <div className="mt-4 space-y-2" aria-label="Existing private notes">{notes.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-white/10"><p className="whitespace-pre-wrap break-words">{item.note}</p><time className="mt-1 block text-[10px] text-slate-500">{new Date(item.created_at).toLocaleString()}</time></div>)}</div>}
        <textarea aria-label={replying ? 'Official reply text' : 'New private note'} autoFocus value={replying ? replyBody : note} onChange={(event) => replying ? setReplyBody(event.target.value) : setNote(event.target.value)} rows={6} maxLength={5000} className="mt-3 w-full rounded-lg border bg-transparent p-3" />
        <div className="mt-3 flex justify-end gap-2"><button onClick={() => { setReplying(null); setNotePost(null); }} className="rounded-lg border px-4 py-2 font-bold">Close</button><button disabled={working !== ''} onClick={() => void (replying ? publishOfficial() : saveNote())} className="rounded-lg bg-[#006aff] px-4 py-2 font-bold text-white disabled:opacity-50">{replying ? 'Publish securely' : 'Save private note'}</button></div>
      </div>
    </div>}
  </div>;
}
