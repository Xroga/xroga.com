const NETLIFY_NOT_FOUND = /site not found/i;
const GENERIC_NOT_FOUND = /<title>\s*404/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns true when the URL serves real HTML (not Netlify/Vercel placeholder 404 pages). */
export async function verifyLivePreviewUrl(url: string, maxWaitMs = 90_000): Promise<boolean> {
  if (!url?.startsWith('http')) return false;

  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'XROGA-Deploy-Verify/1.0' },
        signal: AbortSignal.timeout(12_000),
      });

      if (!res.ok) {
        await sleep(3000);
        continue;
      }

      const text = (await res.text()).slice(0, 12_000);
      if (NETLIFY_NOT_FOUND.test(text)) {
        await sleep(3000);
        continue;
      }
      if (GENERIC_NOT_FOUND.test(text) && text.length < 8000) {
        await sleep(3000);
        continue;
      }
      if (text.includes('<!DOCTYPE') || text.includes('<html')) return true;
    } catch {
      await sleep(3000);
    }
  }

  return false;
}
