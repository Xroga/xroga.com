'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquarePlus, Search } from 'lucide-react';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { CommunityPostCard } from './CommunityPostCard';
import { communityApi, type CommunityPost } from '@/lib/community';

const filters = [
  ['trending', 'Trending'], ['new', 'New'], ['unanswered', 'Unanswered'], ['feedback', 'Feedback'],
  ['feature_request', 'Feature Requests'], ['bug', 'Bugs'], ['question', 'Questions'], ['released', 'Released'], ['solved', 'Solved'],
] as const;

export function CommunityFeed() {
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<(typeof filters)[number][0]>('new');
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [compose, setCompose] = useState(searchParams.get('compose') === '1');

  const load = useCallback(async (next?: string) => {
    if (next) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ filter, limit: '18' });
      if (query.trim()) params.set('search', query.trim());
      if (next) params.set('cursor', next);
      const result = await communityApi.list(params);
      setPosts((current) => next ? [...current, ...result.posts] : result.posts);
      setCursor(result.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The community feed is unavailable.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search community posts</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder="Search ideas, questions and bugs" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-[#006aff] dark:border-white/10 dark:bg-white/[.05] dark:text-white" />
        </label>
        <button type="button" onClick={() => setCompose(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#006aff] px-5 py-3 text-sm font-bold text-white hover:bg-[#0055cc]"><MessageSquarePlus className="h-4 w-4" />Create Post</button>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Community filters">
        {filters.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === value ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[.07] dark:text-slate-300'}`}>{label}</button>)}
      </div>

      <div className="mt-5 space-y-3" aria-live="polite" aria-busy={loading}>
        {loading && Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[.05]" />)}
        {!loading && error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-700 dark:text-red-300" role="alert"><p>{error}</p><button className="mt-3 font-bold underline" onClick={() => void load()}>Try again</button></div>}
        {!loading && !error && !posts.length && <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-white/15"><p className="font-bold">No posts match this view.</p><p className="mt-1 text-sm text-slate-500">Start the conversation with a real question, idea, or report.</p></div>}
        {!loading && posts.map((post) => <CommunityPostCard key={post.id} post={post} />)}
      </div>
      {cursor && !loading && <button type="button" disabled={loadingMore} onClick={() => void load(cursor)} className="mx-auto mt-5 block rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold dark:border-white/10">{loadingMore ? 'Loading…' : 'Load more'}</button>}
      <FeedbackModal open={compose} onClose={() => setCompose(false)} />
    </>
  );
}
