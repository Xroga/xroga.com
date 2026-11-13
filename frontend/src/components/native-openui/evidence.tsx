'use client';

import { createContext, useContext } from 'react';
import { SourceCitation, type CitationPage } from '../terminal/SourceCitation';

export type AnswerSource = CitationPage & { id: string };
export const EvidenceContext = createContext<ReadonlyMap<string, AnswerSource>>(new Map());

export function useRenderEvidenceCitation() {
  const evidence = useContext(EvidenceContext);
  return function renderCitation(number: number) {
    const source = evidence.get('source-' + number);
    return source ? <SourceCitation source={source} number={number} /> : null;
  };
}
