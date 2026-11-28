'use client';

import { lazy, memo, Suspense, useMemo } from 'react';
import { parseXrogaOutput } from '@/lib/xrogaBlocks';
import { ModernResponseText } from '@/components/terminal/ReasoningAndFollowUps';
import type { NativeAnswer } from './NativeSurface';
import type { CitationSource } from '@/lib/xrogaCitations';
import { ResponseSources } from '@/components/terminal/ResponseSources';
import { ResponseSourceScope } from '@/components/terminal/ResponseSourceScope';
import { ChatErrorBoundary } from '@/components/terminal/ChatErrorBoundary';
import { SharedAnswerDownloads } from '@/components/terminal/SharedAnswerDownloads';
import { publicAnswerExportText } from '@/lib/publicAnswerText';
import { withoutGeneratedVisualCopy } from './generatedCopy';
import { loadPresentation } from '../response-experience-v2/loadPresentation';
import { splitNativeOpenUiAnswer } from '../../../../backend/src/ai/nativeOpenUi';

export { buildNativeOpenUiShare } from '../../../../backend/src/ai/nativeOpenUiShare';

const Surface = lazy(() => loadPresentation(() => import('./NativeSurface')).then(module => ({ default: module.NativeSurface })));

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
    ...(text && document.status === 'completed' ? { documentDownload: document.documentDownload } : {}),
  };
}

/** Clipboard and Share use the authoritative prose even when no native visual survived. */
export function readNativeWorkspaceProse(output: unknown): string | undefined {
  if ((output as { responseSource?: { format?: unknown } } | null)?.responseSource?.format !== 'xroga-openui-v1') return;
  const text = parseXrogaOutput(output)?.sourceText;
  return text ? splitNativeOpenUiAnswer(text).text || 'The saved answer has no readable text.' : undefined;
}

type NativeWorkspaceAnswerProps = {
  answer: NativeAnswer;
  sources?: Array<Pick<CitationSource, 'title' | 'url' | 'siteName'> & Partial<CitationSource>>;
  sourceReferral?: boolean;
};

export const NativeWorkspaceAnswer = memo(function NativeWorkspaceAnswer({ answer, sources, sourceReferral = true }: NativeWorkspaceAnswerProps) {
  const evidence = useMemo(() => sources?.map((source, index) => ({ ...source, id: 'source-' + (index + 1) })), [sources]);
  const written = (content: string) => <section aria-label="Answer" dir="auto">
    <ModernResponseText content={content} sources={sources?.map(source => ({ snippet: '', ...source }))} />
  </section>;
  // A failed visual leaves the complete saved answer. While visuals load, only what stays on screen is shown.
  const fallback = written(answer.text);
  const loading = answer.program ? written(withoutGeneratedVisualCopy(answer.text, answer.program)) : fallback;
  return <ResponseSourceScope>
    {answer.program ? <ChatErrorBoundary fallback={fallback} logErrorDetails={false}>
      <Suspense fallback={loading}><Surface answer={answer} sources={evidence} /></Suspense>
    </ChatErrorBoundary> : fallback}
    {answer.documentDownload ? <SharedAnswerDownloads
      response={publicAnswerExportText(answer.text)}
      requestedFormat={answer.documentDownload}
      verifiedLinks={sources?.map(source => source.url) ?? []}
    /> : null}
    {sources?.length ? <ResponseSources sources={sources} referral={sourceReferral} /> : null}
  </ResponseSourceScope>;
}, (previous, next) => {
  // History can recreate an answer object while the composer updates another turn.
  const before = previous.answer;
  const after = next.answer;
  return before.text === after.text
    && before.program === after.program
    && before.documentDownload === after.documentDownload
    && before.library === after.library
    && before.format === after.format
    && previous.sources === next.sources
    && previous.sourceReferral === next.sourceReferral;
});
