import { NATIVE_SHARE_PREFIX, readNativeOpenUiShare } from '../../../../../backend/src/ai/nativeOpenUiShare';
import { NativeWorkspaceAnswer } from '@/components/native-openui/NativeWorkspaceAnswer';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SharedAnswerDownloads } from '@/components/terminal/SharedAnswerDownloads';
import { API_URL, fetchApiResponse } from '@/lib/api';
import SharedResponseV2 from '@/components/response-experience-v2/SharedResponseV2';
import { readRichShareSnapshot, RICH_SHARE_PREFIX } from '@/components/response-experience-v2/shareSnapshot';
import { responseV2Audience, responseV2Decision } from '@/components/response-experience-v2/access';

export const dynamic = 'force-dynamic';

type PublicShare = {
  token: string;
  visibility: 'private' | 'public';
  scope: 'response' | 'exchange';
  prompt: string;
  response: string;
  richResponse?: string;
  richUnavailable?: boolean;
};

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
    const response = await fetchApiResponse(`${API_URL}/api/message-shares/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(()=>undefined);
      return { status: response.status===403?'private':'missing' };
    }
    const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try{if(reader)for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>1024*1024)throw Error('Invalid share receipt');chunks.push(next.value);}}
    finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { share?: PublicShare };
    const share=payload?.share;
    if(!share||share.token!==token||!['public','private'].includes(share.visibility)||!['response','exchange'].includes(share.scope)
      ||typeof share.prompt!=='string'||share.prompt.length>20000||typeof share.response!=='string'||share.response.length>100000)return{status:'missing'};
    // Current API exposes text plus an optional snapshot. Older compatible API
    // revisions return the snapshot in response. Both retain the same share ACL.
    const snapshot = typeof share.richResponse === 'string' ? share.richResponse : share.response;
    if (snapshot.startsWith(NATIVE_SHARE_PREFIX)) {
      const native = readNativeOpenUiShare(snapshot);
      const wrapped = !share.richResponse && share.response.startsWith(NATIVE_SHARE_PREFIX);
      if (wrapped && !native) return { status: 'missing' };
      const matchingText = wrapped || native?.text === share.response;
      return { status: 'ok', share: { ...share,
        response: wrapped && native ? native.text : share.response,
        richResponse: native && matchingText ? snapshot : undefined,
        richUnavailable: !native || !matchingText,
      } };
    }
    const presentation = readRichShareSnapshot(snapshot);
    const matchingText = !share.richResponse || presentation.text === share.response;
    return { status: 'ok', share: { ...share,
      response: share.response.startsWith(RICH_SHARE_PREFIX) ? presentation.text : share.response,
      richResponse: presentation.document && matchingText ? snapshot : undefined,
      richUnavailable: snapshot.startsWith(RICH_SHARE_PREFIX) && (!presentation.document || !matchingText),
    } };
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
    robots: { index: false, follow: true, noarchive: true },
  };
}

async function canPresentRichShare(): Promise<boolean> {
  let richAllowed = false;
    try {
      const client = await createClient();
      const { data: { user } } = await client.auth.getUser();
      richAllowed = responseV2Audience(process.env.RESPONSE_EXPERIENCE_V2, user?.id ?? null, process.env.RESPONSE_EXPERIENCE_V2_USERS);
      if (!richAllowed && (process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development' || process.env.RESPONSE_EXPERIENCE_V2 === 'founder')) {
        const decision = await responseV2Decision(true, true, {
          getUser: async () => user,
          getRole: async () => { const { data, error } = await client.rpc('current_community_role'); return error ? null : data; },
          getAal: async () => { const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(); return error ? null : data.currentLevel; },
        });
        richAllowed = decision.allowed;
      }
    } catch { richAllowed = false; }
  return richAllowed;
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
          <Image src="/brand/xroga-orb-mark-v2.webp" alt="" width={34} height={34} className="mx-auto mb-4 rounded-xl" />
          <h1 className="text-lg font-semibold">This share is private</h1>
          <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">Only the Xroga account that created it can open this page.</p>
          <Link href={`/auth/login?next=${next}`} className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-[#111] px-4 text-xs font-semibold text-white dark:bg-white dark:text-[#111]">Continue with the owner account</Link>
        </section>
      </main>
    );
  }
  const { share } = result;
  const native = share.richResponse ? readNativeOpenUiShare(share.richResponse) : undefined;
  const richAllowed = Boolean(share.richResponse && (!native || native.program)) && await canPresentRichShare();
  const sources = native ? [...new Map(native.sources.map(source => [source.url, source])).values()] : [];

  return (
    <main className="min-h-screen bg-[#f4f4f1] px-4 py-6 text-[#111] sm:px-6 sm:py-12 dark:bg-[#090a0d] dark:text-[#f5f5f3]">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-4 flex items-center justify-between rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#111318]">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <Image src="/brand/xroga-orb-mark-v2.webp" alt="" width={24} height={24} className="rounded-lg" />
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
            {share.richUnavailable && <p role="status" className="mb-3 text-sm">The interactive view is unavailable. The complete saved text follows.</p>}
            {richAllowed && native ? <NativeWorkspaceAnswer answer={{ ...native, library: 'xroga-native-v1' }} sources={native.sources} /> : richAllowed && share.richResponse ? <SharedResponseV2 snapshot={share.richResponse} text={share.response} /> : <p className="whitespace-pre-wrap text-[15px] leading-7 text-black/90 dark:text-white/90">{share.response}</p>}
            {sources.length > 0 && <section aria-label="Sources" className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
              <h2 className="text-sm font-semibold">Sources</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {sources.map(source => <li key={source.url} className="break-words">
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.title}</a>
                </li>)}
              </ul>
            </section>}
            <SharedAnswerDownloads response={share.response} />
          </section>
        </article>

        <p className="mt-4 text-center text-xs text-black/45 dark:text-white/45">
          Shared exactly as selected. No reactions, view counts, or generated activity.
        </p>
      </div>
    </main>
  );
}
