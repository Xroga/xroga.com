'use client';

import React from 'react';
import { safeSourceUrl } from '@/lib/xrogaCitations';
import { SourceCitation, type CitationPage } from './SourceCitation';
import { useInlineCitations } from './ResponseSourceScope';
import styles from './ResponseSources.module.css';

export function ResponseSources({ sources, label = 'Sources', referral = true }: {
  sources: ReadonlyArray<CitationPage>;
  label?: string;
  referral?: boolean;
}) {
  const inline = useInlineCitations();
  const unique = new Map<string, CitationPage>();
  for (const source of sources) {
    const url = safeSourceUrl(source.url);
    if (url && !inline.has(url) && !unique.has(url)) unique.set(url, source);
  }
  if (!unique.size) return null;
  return <section className={styles.root} aria-label={label}>
    <h3>{label}</h3>
    <ul>{[...unique].map(([url, source]) => <li key={url}><SourceCitation source={source} showTitle referral={referral} /></li>)}</ul>
  </section>;
}
