import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type PublicShare = {
  token: string;
  visibility: 'private' | 'public';
  scope: 'response' | 'exchange';
  prompt: string;
  response: string;
};

function apiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : 'https://xroga-api.fly.dev';
}

type ShareResult =
  | { status: 'ok'; share: PublicShare }
  | { status: 'private' }
  | { status: 'missing' };

const loadShare = cache(async (token: string): Promise<ShareResult> => {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return { status: 'missing' };
  try {
    let accessToken = '';
    try {
      const supabase = await createClient();
      const { data: { session } } = await supabase.auth.getSession();
      accessToken = session?.access_token ?? '';
    } catch {
      // Public shares do not depend on auth configuration. A private one will
      // correctly receive 403 below when no verified session can be forwarded.
    }
    const response = await fetch(`${apiOrigin()}/api/message-shares/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    if (response.status === 403) return { status: 'private' };
    if (!response.ok) return { status: 'missing' };
    const payload = await response.json() as { share?: PublicShare };
    return payload.share ? { status: 'ok', share: payload.share } : { status: 'missing' };
  } catch {
    return { status: 'missing' };
  }
});

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const result = await loadShare(token);
  if (result.status !== 'ok') return { title: result.status === 'private' ? 'Private share — Xroga' : 'Share unavailable — Xroga', robots: { index: false, follow: false } };
  const { share } = result;
  return {
    title: 'Shared answer — Xroga',
    description: share.response.slice(0, 150),
    robots: share.visibility === 'public'
      ? { index: true, follow: true }
      : { index: false, follow: false, noarchive: true },
  };
}

export default async function MessageSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadShare(token);
  if (result.status === 'missing') notFound();
  if (result.status === 'private') {
    const next = encodeURIComponent(`/share/${token}`);
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f4f1] px-4 text-[#111] dark:bg-[#090a0d] dark:text-[#f5f5f3]">
        <section className="w-full max-w-sm rounded-[24px] bg-white p-6 text-center shadow-[0_30px_90px_-60px_rgba(0,0,0,.5)] dark:bg-[#111318]">
          <Image src="/brand/xroga-mark.png" alt="" width={34} height={34} className="mx-auto mb-4 rounded-xl" />
          <h1 className="text-lg font-semibold">This share is private</h1>
          <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">Only the Xroga account that created it can open this page.</p>
          <Link href={`/auth/login?next=${next}`} className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-[#111] px-4 text-xs font-semibold text-white dark:bg-white dark:text-[#111]">Continue with the owner account</Link>
        </section>
      </main>
    );
  }
  const { share } = result;

  return (
    <main className="min-h-screen bg-[#f4f4f1] px-4 py-6 text-[#111] sm:px-6 sm:py-12 dark:bg-[#090a0d] dark:text-[#f5f5f3]">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-4 flex items-center justify-between rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#111318]">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <Image src="/brand/xroga-mark.png" alt="" width={24} height={24} className="rounded-lg" />
            Xroga
          </Link>
          <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[.12em] text-black/55 dark:bg-white/10 dark:text-white/55">
            {share.visibility === 'private' ? 'Private link' : 'Public share'}
          </span>
        </header>

        <article className="overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-[0_30px_90px_-60px_rgba(0,0,0,.5)] dark:border-white/10 dark:bg-[#111318]">
          {share.scope === 'exchange' && share.prompt && (
            <section className="border-b border-black/10 px-5 py-5 dark:border-white/10 sm:px-8 sm:py-7">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-black/45 dark:text-white/45">Prompt</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-black/75 dark:text-white/75">{share.prompt}</p>
            </section>
          )}
          <section className="px-5 py-6 sm:px-8 sm:py-8">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.16em] text-black/45 dark:text-white/45">Response</p>
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-black/90 dark:text-white/90">{share.response}</p>
          </section>
        </article>

        <p className="mt-4 text-center text-xs text-black/45 dark:text-white/45">
          Shared exactly as selected. No reactions, view counts, or generated activity.
        </p>
      </div>
    </main>
  );
}
