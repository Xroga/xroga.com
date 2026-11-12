'use client';

import { lazy, Suspense } from 'react';
import { parseXrogaOutput } from '@/lib/xrogaBlocks';
import { ModernResponseText } from '@/components/terminal/ReasoningAndFollowUps';
import type { NativeAnswer } from './NativeSurface';
import type { CitationSource } from '@/lib/xrogaCitations';
import { ResponseSources } from '@/components/terminal/ResponseSources';
import { ResponseSourceScope } from '@/components/terminal/ResponseSourceScope';
import { ChatErrorBoundary } from '@/components/terminal/ChatErrorBoundary';
import { splitNativeOpenUiAnswer } from '../../../../backend/src/ai/nativeOpenUi';

export { buildNativeOpenUiShare } from '../../../../backend/src/ai/nativeOpenUiShare';

const Surface = lazy(() => import('./NativeSurface').then(module => ({ default: module.NativeSurface })));

export function readNativeWorkspaceAnswer(output: unknown): NativeAnswer | undefined {
  if ((output as { responseSource?: { format?: unknown } } | null)?.responseSource?.format !== 'xroga-openui-v1') return;
  const document = parseXrogaOutput(output);
  if (document?.responseSource?.format !== 'xroga-openui-v1' || !document.sourceText ||
      (document.status !== 'completed' && document.status !== 'partial')) return;
  const { text } = splitNativeOpenUiAnswer(document.sourceText);
  return {
    format: 'xroga-openui-v1',
    library: 'xroga-native-v1',
    text: text || 'The saved answer has no readable text.',
    ...(document.responseSource.text ? { program: document.responseSource.text } : {}),
  };
}

/** Clipboard and Share use the authoritative prose even when no native visual survived. */
export function readNativeWorkspaceProse(output: unknown): string | undefined {
  if ((output as { responseSource?: { format?: unknown } } | null)?.responseSource?.format !== 'xroga-openui-v1') return;
  const text = parseXrogaOutput(output)?.sourceText;
  return text ? splitNativeOpenUiAnswer(text).text || 'The saved answer has no readable text.' : undefined;
}

export function NativeWorkspaceAnswer({ answer, sources, sourceReferral = true }: { answer: NativeAnswer; sources?: Array<Pick<CitationSource, 'title' | 'url' | 'siteName'> & Partial<CitationSource>>; sourceReferral?: boolean }) {
  const fallback = <section aria-label="Answer" dir="auto">
    <ModernResponseText content={answer.text} sources={sources?.map(source => ({ snippet: '', ...source }))} />
  </section>;
  const evidence = sources?.map((source, index) => ({ ...source, id: 'source-' + (index + 1) }));
  return <ResponseSourceScope>
    {answer.program ? <ChatErrorBoundary fallback={fallback} logErrorDetails={false}>
      <Suspense fallback={fallback}><Surface answer={answer} sources={evidence} showFullText /></Suspense>
    </ChatErrorBoundary> : fallback}
    {sources?.length ? <ResponseSources sources={sources} referral={sourceReferral} /> : null}
  </ResponseSourceScope>;
}
