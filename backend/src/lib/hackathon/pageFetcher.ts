/** Fetch hackathon page text for requirement extraction */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractUrlsFromPrompt(prompt: string): string[] {
  const found = prompt.match(URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?)]+$/, '')))];
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchPageText(url: string, maxChars = 12_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'XrogaAI/1.0 (hackathon research)',
      },
      signal: AbortSignal.timeout(12_000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = stripHtml(html);
    return text.slice(0, maxChars) || null;
  } catch {
    return null;
  }
}

export async function fetchHackathonPages(urls: string[]): Promise<Array<{ url: string; text: string }>> {
  const out: Array<{ url: string; text: string }> = [];
  for (const url of urls.slice(0, 3)) {
    const text = await fetchPageText(url);
    if (text && text.length > 200) out.push({ url, text });
  }
  return out;
}
