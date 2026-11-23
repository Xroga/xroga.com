const RESULT_MARKER = 'Connected app result (untrusted data):';
const ACTION_REVIEW_PATH = /^\/dashboard\/actions\/confirm\/([\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12})\/?$/i;
const SAVED_SEARCH_REVIEW = /^(?:Review the request before Xroga searches the web|Review the exact (?:external )?research request(?: before it is sent)?):\s*(\[[^\]]+\]\(([^()\s]+)\))\.?\s*(?:No live evidence has been retrieved\.)?$/i;
const LEGACY_PUBLIC_SEARCH_LEAD = /^Review the request before Xroga searches the web:/i;
export const WEB_SEARCH_NOT_RUN = 'Web search didn’t run for this request. Try sending the prompt again.';

export function workspaceReviewId(href?: string): string | null {
  return href?.match(ACTION_REVIEW_PATH)?.[1] ?? null;
}

export function readableActionSpend(microUsd: string | null, currency: string | null): string | null {
  if (currency !== 'USD' || microUsd === null || !/^\d+$/.test(microUsd)) return null;
  const amount = Number(microUsd);
  return Number.isSafeInteger(amount) ? new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 6,
  }).format(amount / 1_000_000) : null;
}

type AppResultPreview = {
  summary: string;
  details: string | null;
};

function itemNames(value: unknown, depth = 0): string[] {
  if (!value || typeof value !== 'object' || depth > 3) return [];
  if (Array.isArray(value)) {
    const names = value.slice(0, 3).map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const name = record.name ?? record.title ?? record.subject;
      return typeof name === 'string' && name.trim() ? name.trim() : null;
    }).filter((name): name is string => Boolean(name));
    if (names.length) return names;
    return [];
  }
  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if (/^(?:owners|permissions|lastModifyingUser|metadata)$/i.test(key)) continue;
    const names = itemNames(nested, depth + 1);
    if (names.length) return names;
  }
  return [];
}

/** Keep raw provider payload available for inspection, but never put it in the compact card by default. */
export function previewConnectedAppResult(response: string): AppResultPreview {
  const marker = response.indexOf(RESULT_MARKER);
  if (marker < 0) return { summary: response, details: null };

  const raw = response.slice(marker + RESULT_MARKER.length).trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(raw);
  let names: string[] = [];
  if (fenced) {
    try {
      names = itemNames(JSON.parse(fenced[1]));
    } catch {
      // The provider result may be truncated or non-JSON. Keep it inspectable below.
    }
  }

  return {
    summary: names.length ? `Completed · ${names.join(' · ')}` : 'Completed',
    details: response,
  };
}

export function compactConnectedAppConfirmationMarkdown(markdown: string): string {
  const legacyPublicSearch = markdown.trim().replace(/\s*\n\nThe saved research result is currently unavailable\.$/, '');
  if (isLegacyPublicSearchReview(legacyPublicSearch)) return WEB_SEARCH_NOT_RUN;
  const search = savedSearchReviewLink(markdown);
  if (search) return search;
  const writeReview = markdown.match(/\n\nNothing has been changed yet\.\n\n(\[Review action\]\(\/dashboard\/actions\/confirm\/[0-9a-f-]{36}\))$/i);
  if (writeReview) return writeReview[1];
  return markdown.replace(
    /^Review this exact private connected-app read before its parameters are sent:\s*(\[[^\]]+\]\([^)]+\))\.\s*No application data has been retrieved\.$/,
    '$1',
  );
}

export function savedSearchReviewLink(markdown: string): string | null {
  const search = markdown.trim().match(SAVED_SEARCH_REVIEW);
  return search && workspaceReviewId(search[2]) ? search[1] : null;
}

export function isLegacyPublicSearchReview(markdown: string): boolean {
  return LEGACY_PUBLIC_SEARCH_LEAD.test(markdown.trim()) && Boolean(savedSearchReviewLink(markdown));
}

/** Keep the useful outcome while omitting the route's internal receipt identifier. */
export function readableActionResult(response: string): string {
  return previewConnectedAppResult(response).summary.replace(
    /^The provider reported completion: ([^\r\n]*?)\. Receipt [\da-f-]{36}\./i,
    'The provider reported completion: $1.',
  );
}
