import { NATIVE_SHARE_PREFIX, readNativeOpenUiShare, readNativeOpenUiShareText } from '../../../../../backend/src/ai/nativeOpenUiShare';
import { splitNativeOpenUiAnswer } from '../../../../../backend/src/ai/nativeOpenUi';
import { NativeWorkspaceAnswer } from '@/components/native-openui/NativeWorkspaceAnswer';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SharedAnswerDownloads } from '@/components/terminal/SharedAnswerDownloads';
import { API_URL, fetchApiResponse } from '@/lib/api';
import { hostedWorkspaceRequest } from '@/lib/hostedWorkspaceBridge.mjs';
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
    const path = `/api/message-shares/${encodeURIComponent(token)}`;
    const options = {
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    } satisfies RequestInit;
    const response = process.env.NEXT_PUBLIC_XROGA_WORKSPACE_STAGING_ORIGIN
      ? await hostedWorkspaceRequest(new Request(`${API_URL}${path}`, options), path)
      : await fetchApiResponse(`${API_URL}${path}`, options);
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
      const responseText = wrapped ? readNativeOpenUiShareText(snapshot) : splitNativeOpenUiAnswer(share.response).text;
      const matchingText = wrapped || native?.text === responseText;
      return { status: 'ok', share: { ...share,
        response: responseText || 'The shared answer has no readable text.',
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
      <main className="grid min-h-screen place-items-center bg-[var(--surface-page)] px-4 text-[var(--text-primary)]">
        <section className="w-full max-w-sm rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 text-center shadow-[var(--shadow-elevated)]">
          <Image src="/brand/xroga-orb-mark-v2.webp" alt="" width={34} height={34} className="mx-auto mb-4 rounded-xl" />
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">This share is private</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Only the Xroga account that created it can open this page.</p>
          <Link href={`/auth/login?next=${next}`} className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-[var(--text-primary)] px-4 text-xs font-semibold text-[var(--surface-page)]">Continue with the owner account</Link>
        </section>
      </main>
    );
  }
  const { share } = result;
  const native = share.richResponse ? readNativeOpenUiShare(share.richResponse) : undefined;
  // The API has already enforced the saved link's visibility. A validated
  // native snapshot must reopen independently of the older V2 rollout flag.
  const legacyRichAllowed = !native && Boolean(share.richResponse) && await canPresentRichShare();

  return (
    <main className="min-h-screen bg-[var(--surface-page)] px-4 py-6 text-[var(--text-primary)] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-4 flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 shadow-sm">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <Image src="/brand/xroga-orb-mark-v2.webp" alt="" width={24} height={24} className="rounded-lg" />
            Xroga
          </Link>
          <span className="rounded-full bg-[var(--surface-inset)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[.12em] text-[var(--text-secondary)]">
            {share.visibility === 'private' ? 'Private link' : 'Public share'}
          </span>
        </header>

        <article className="overflow-hidden rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-elevated)]">
          {share.scope === 'exchange' && share.prompt && (
            <section className="border-b border-[var(--border-subtle)] px-5 py-5 sm:px-8 sm:py-7">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--text-secondary)]">Prompt</p>
              <p className="whitespace-pre-wrap text-sm leading-6">{share.prompt}</p>
            </section>
          )}
          <section className="px-5 py-6 sm:px-8 sm:py-8">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--text-secondary)]">Response</p>
            {share.richUnavailable && <p role="status" className="mb-3 text-sm">The interactive view is unavailable. The complete saved text follows.</p>}
            {native ? <NativeWorkspaceAnswer answer={{ ...native, library: 'xroga-native-v1' }} sources={native.sources} sourceReferral={false} /> : legacyRichAllowed && share.richResponse ? <SharedResponseV2 snapshot={share.richResponse} text={share.response} /> : <p className="whitespace-pre-wrap text-[15px] leading-7">{share.response}</p>}
            <SharedAnswerDownloads response={share.response} />
          </section>
        </article>

        <p className="mt-4 text-center text-xs text-[var(--text-secondary)]">
          Shared exactly as selected. No reactions, view counts, or generated activity.
        </p>
      </div>
    </main>
  );
}
