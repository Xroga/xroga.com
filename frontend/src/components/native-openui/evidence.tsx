'use client';

import React, { createContext, useContext, type ReactNode } from 'react';
import { SourceCitation, type CitationPage } from '../terminal/SourceCitation';
import { safeSourceUrl } from '@/lib/xrogaCitations';

export type AnswerSource = CitationPage & { id: string };
export const EvidenceContext = createContext<ReadonlyMap<string, AnswerSource>>(new Map());
export type RenderEvidenceCitation = (number: number, href?: string, cluster?: Set<string>) => ReactNode;

/** Group only adjacent verified citations. The saved evidence and URL stay exact. */
function evidenceChip(source: AnswerSource, number: number | undefined, cluster?: Set<string>) {
  const url = safeSourceUrl(source.url);
  const compact = Boolean(cluster?.size);
  if (url) {
    if (cluster?.has(url)) return false;
    cluster?.add(url);
  } else {
    cluster?.clear();
  }
  return <SourceCitation source={source} number={number} compact={compact} />;
}

export function evidenceCitation(evidence: ReadonlyMap<string, AnswerSource>, number: number, href?: string, cluster?: Set<string>) {
  const source = evidence.get('source-' + number);
  if (!source) return null;
  if (href !== undefined) {
    const url = safeSourceUrl(href);
    if (!url || url !== safeSourceUrl(source.url)) return null;
  }
  return evidenceChip(source, number, cluster);
}

export function evidenceSource(evidence: ReadonlyMap<string, AnswerSource>, id: string, cluster?: Set<string>) {
  const source = evidence.get(id);
  if (!source) return null;
  const number = cluster?.size ? /^source-(\d{1,3})$/.exec(id)?.[1] : undefined;
  return evidenceChip(source, number === undefined ? undefined : Number(number), cluster);
}

export function useRenderEvidenceCitation(): RenderEvidenceCitation {
  const evidence = useContext(EvidenceContext);
  return (number, href, cluster) => evidenceCitation(evidence, number, href, cluster);
}
