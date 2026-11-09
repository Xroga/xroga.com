'use client';

import { lazy, Suspense } from 'react';
import { parseXrogaOutput } from '@/lib/xrogaBlocks';
import { ModernResponseText } from '@/components/terminal/ReasoningAndFollowUps';
import type { NativeAnswer } from './NativeSurface';

export { buildNativeOpenUiShare } from '../../../../backend/src/ai/nativeOpenUiShare';

const Surface = lazy(() => import('./NativeSurface').then(module => ({ default: module.NativeSurface })));

export function readNativeWorkspaceAnswer(output: unknown): NativeAnswer | undefined {
  if ((output as { responseSource?: { format?: unknown } } | null)?.responseSource?.format !== 'xroga-openui-v1') return;
  const document = parseXrogaOutput(output);
  if (document?.responseSource?.format !== 'xroga-openui-v1' || !document.sourceText) return;
  return {
    format: 'xroga-openui-v1',
    library: 'xroga-native-v1',
    text: document.sourceText,
    ...(document.status === 'completed' && document.responseSource.text ? { program: document.responseSource.text } : {}),
  };
}

export function NativeWorkspaceAnswer({ answer, sources }: { answer: NativeAnswer; sources?: Array<{ title: string; url: string }> }) {
  const fallback = <ModernResponseText content={answer.text} />;
  const evidence = sources?.map((source, index) => ({ ...source, id: 'source-' + (index + 1) }));
  return <Suspense fallback={fallback}><Surface answer={answer} sources={evidence} /></Suspense>;
}
