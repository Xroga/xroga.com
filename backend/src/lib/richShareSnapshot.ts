const PREFIX = 'XROGA_RESPONSE_V2\n';

/** Backward-compatible text projection of a read-only presentation snapshot.
 * This never authorizes an action or validates model factual claims. The V2
 * frontend separately validates every presentation node before rendering it. */
export function projectRichShare(value: string): { response: string; richResponse?: string } {
  if (!value.startsWith(PREFIX) || value.length > 100_000) return { response: value };
  try {
    const data = JSON.parse(value.slice(PREFIX.length));
    if (data?.version === 2 && typeof data.text === 'string' && data.text.length > 0 && data.document?.version === 2 && Array.isArray(data.document.nodes)) {
      return { response: data.text, richResponse: value };
    }
  } catch { /* Preserve the original literal text on malformed snapshots. */ }
  return { response: value };
}
