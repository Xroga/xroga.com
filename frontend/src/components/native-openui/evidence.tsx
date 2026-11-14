'use client';

import React, { createContext, useContext } from 'react';
import { SourceCitation, type CitationPage } from '../terminal/SourceCitation';
import { safeSourceUrl } from '@/lib/xrogaCitations';

export type AnswerSource = CitationPage & { id: string };
export const EvidenceContext = createContext<ReadonlyMap<string, AnswerSource>>(new Map());

export function evidenceCitation(evidence: ReadonlyMap<string, AnswerSource>, number: number, href?: string) {
  const source = evidence.get('source-' + number);
  if (!source) return null;
  if (href !== undefined) {
    const url = safeSourceUrl(href);
    if (!url || url !== safeSourceUrl(source.url)) return null;
  }
  return <SourceCitation source={source} number={number} />;
}

export function useRenderEvidenceCitation() {
  const evidence = useContext(EvidenceContext);
  return (number: number, href?: string) => evidenceCitation(evidence, number, href);
}
