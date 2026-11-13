const RESULT_MARKER = 'Connected app result (untrusted data):';

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
  const writeReview = markdown.match(/\[Review action\]\(\/dashboard\/actions\/confirm\/[0-9a-f-]{36}\)/i);
  if (writeReview && markdown.includes('Nothing has been changed yet.')) return writeReview[0];
  return markdown.replace(
    /^Review this exact private connected-app read before its parameters are sent:\s*(\[[^\]]+\]\([^)]+\))\.\s*No application data has been retrieved\.$/,
    '$1',
  );
}
