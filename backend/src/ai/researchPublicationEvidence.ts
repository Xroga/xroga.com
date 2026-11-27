import { publicHttpsUrl, type PublicGetResult } from '../security/egress/urlPolicy.js';
import { matchingPageParagraphs, matchesOfficialResearchDomain, type SearchResult } from './researchSearchProvider.js';
import { workspacePublicSearchQuery } from './workspacePublicSearch.js';

const supportingPage = /\/(?:presentations?|slides?|webinars?|events?|news|drafts?)(?:\/|$)|\.ipd\.pdf$/iu;
const catalogPage = /^\/(?:pubs|publications|standards|reports|records|tr)\/.+/iu;

function normalizedTitle(title: string) {
  return title.trim().replace(/^[A-Z][A-Z-]{1,15}\s+[\d.-]+[,:]\s+/u, '')
    .replace(/\s*\([A-Z]{2,16}\)/gu, '')
    .replace(/^the\s+/iu, '').replace(/\s+[|–—-]\s+.*$/u, '')
    .replace(/\sv(?=\d)/giu, ' ').replace(/\s+/gu, ' ').trim().toLowerCase();
}

export function requestedPublication(prompt: string) {
  const search = workspacePublicSearchQuery(prompt);
  if (!search?.originalSourceQuestion || !search.officialDomains.length) return;
  const work = /^"([^"]+)"\s+(v?\d+(?:\.\d+)+)(?=\s|$)/iu.exec(search.query);
  // A single-word name may be an acronym or a partial title.
  if (!work || !/\s/u.test(work[1])) return;
  return { title: normalizedTitle(work[1] + ' ' + work[2]), words: normalizedTitle(work[1]).match(/[\p{L}\p{N}]+/gu) ?? [],
    version: work[2].replace(/\D/gu, ''), domains: search.officialDomains, question: search.originalSourceQuestion };
}

type RequestedPublication = NonNullable<ReturnType<typeof requestedPublication>>;

function publisherUrl(value: string, work: RequestedPublication, base?: URL): URL | undefined {
  try {
    const url = publicHttpsUrl(value, base);
    if (!matchesOfficialResearchDomain(url.href, work.domains) || supportingPage.test(url.pathname)) return;
    return url;
  } catch { return undefined; }
}

export function isRequestedPublication(source: { url: string; title?: string }, work: RequestedPublication): boolean {
  return !!source.title && normalizedTitle(source.title) === work.title && !!publisherUrl(source.url, work);
}

function htmlAttribute(tag: string, name: string): string | undefined {
  const match = new RegExp('(?:^|\\s)' + name + '=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'iu').exec(tag);
  return (match?.[1] ?? match?.[2])?.replace(/&amp;/gi, '&');
}

function links(html: string): string[] {
  return Array.from(html.matchAll(/<a\b[^>]*>/giu), match => htmlAttribute(match[0], 'href') ?? '').filter(Boolean);
}

function citationTitle(html: string): string | undefined {
  for (const match of html.matchAll(/<meta\b[^>]*>/giu)) {
    if (htmlAttribute(match[0], 'name')?.toLowerCase() === 'citation_title') return htmlAttribute(match[0], 'content');
  }
}

function namedCatalogLink(url: URL, work: RequestedPublication): boolean {
  if (!catalogPage.test(url.pathname) || /\.pdf$/iu.test(url.pathname)) return false;
  const words = new Set(url.pathname.toLowerCase().match(/[\p{L}\p{N}]+/gu));
  return work.words.every(word => words.has(word)) && (words.has(work.version) ||
    url.pathname.replace(/[._-]/gu, '').includes(work.version));
}

export async function followOfficialPublication(
  work: RequestedPublication, sources: readonly SearchResult[],
  read: (url: string) => Promise<PublicGetResult | undefined>,
  pdfText: (bytes: Uint8Array) => Promise<string>,
): Promise<SearchResult | undefined> {
  if (sources.some(source => isRequestedPublication(source, work))) return;
  const catalogUrls = new Set<string>();
  for (const source of sources) {
    const url = publisherUrl(source.url, work);
    if (!url || !catalogPage.test(url.pathname) || /\.pdf$/iu.test(url.pathname)) continue;
    // Only public, stable catalog records can initiate a follow-up.
    url.search = '';
    catalogUrls.add(url.href);
    if (catalogUrls.size === 3) break;
  }
  const related = await Promise.all([...catalogUrls].map(async parent => {
    const page = await read(parent);
    if (!page || !/^text\/html(?:;|$)/iu.test(page.contentType)) return;
    for (const href of links(page.bytes.toString('utf8'))) {
      const target = publisherUrl(href, work, new URL(parent));
      if (target && !target.search && target.href !== parent && namedCatalogLink(target, work)) {
        return { parent, target };
      }
    }
  }));
  const choice = related.find(link => link !== undefined);
  if (!choice) return;
  const publication = await read(choice.target.href);
  if (!publication || !/^text\/html(?:;|$)/iu.test(publication.contentType)) return;
  const html = publication.bytes.toString('utf8');
  const title = citationTitle(html);
  if (!title || !isRequestedPublication({ title, url: choice.target.href }, work)) return;
  const pdf = links(html).map(href => publisherUrl(href, work, choice.target))
    .find(url => url && !url.search && /\.pdf$/iu.test(url.pathname));
  if (!pdf) return;
  const document = await read(pdf.href);
  if (!document || !/^application\/pdf(?:;|$)/iu.test(document.contentType)) return;
  const text = await pdfText(document.bytes);
  const titlePageWords = new Set(text.slice(0, 3500).toLowerCase().match(/[\p{L}\p{N}]+/gu));
  if (!work.words.every(word => titlePageWords.has(word))) return;
  const excerpt = matchingPageParagraphs(text, work.question);
  if (!excerpt) return;
  return { title, url: choice.target.href, publish_date: null, excerpts: [excerpt],
    publisherEvidence: { linkedFrom: choice.parent, documentUrl: pdf.href } };
}
