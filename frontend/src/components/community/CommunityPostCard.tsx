'use client';

import Link from 'next/link';
import { CheckCircle2, MessageCircle, Pin, ShieldCheck, ThumbsUp } from 'lucide-react';
import { communityCategoryLabel, communityStatusLabel, type CommunityPost } from '@/lib/community';

function relativeDate(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'Recently';
  const days = Math.floor((Date.now() - time) / 86_400_000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(time));
}

export function CommunityPostCard({ post }: { post: CommunityPost }) {
  return (
    <article className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg dark:border-white/10 dark:bg-white/[.045] sm:p-5">
      <div className="flex gap-3">
        <div className="hidden min-w-12 flex-col items-center rounded-xl bg-slate-50 px-2 py-2 text-slate-700 dark:bg-white/[.06] dark:text-slate-200 sm:flex">
          <ThumbsUp className="h-4 w-4" aria-hidden />
          <span className="mt-1 text-sm font-black">{post.voteCount}</span>
          <span className="text-[9px] uppercase tracking-wider">votes</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
            <span className="rounded-full bg-[#006aff]/10 px-2 py-1 text-[#006aff]">{communityCategoryLabel[post.category]}</span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">{communityStatusLabel[post.status]}</span>
            {post.isPinned && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-1 text-amber-700 dark:text-amber-300"><Pin className="h-3 w-3" />Pinned</span>}
            {post.hasOfficialResponse && <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-1 text-violet-700 dark:text-violet-300"><ShieldCheck className="h-3 w-3" />Official reply</span>}
          </div>
          <Link href={`/community/${post.id}`} className="block">
            <h2 className="text-lg font-black tracking-tight text-slate-950 group-hover:text-[#006aff] dark:text-white">{post.title}</h2>
            <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">{post.body}</p>
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{post.author.displayName}</span>
            <span>{relativeDate(post.createdAt)}</span>
            <span className="inline-flex items-center gap-1 sm:hidden"><ThumbsUp className="h-3.5 w-3.5" />{post.voteCount}</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{post.commentCount}</span>
            {post.status === 'solved' && <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Solved" />}
          </div>
        </div>
      </div>
    </article>
  );
}
