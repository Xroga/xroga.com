import { boundedPublicGet, publicHttpsUrl } from '../security/egress/urlPolicy.js';
const NETLIFY_NOT_FOUND = /site not found/i;
const GENERIC_NOT_FOUND = /<title>\s*404/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns true when the URL serves real HTML (not Netlify/Vercel placeholder 404 pages). */
export async function verifyLivePreviewUrl(url: string, maxWaitMs = 90_000): Promise<boolean> {
  try { publicHttpsUrl(url); } catch { return false; }
  if(!Number.isFinite(maxWaitMs)||maxWaitMs<1||maxWaitMs>90_000)return false;

  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    try {
      const res = await boundedPublicGet(url,{maxBytes:1024*1024,timeoutMs:12_000,maxRedirects:3,allowHttpErrors:true});

      if (res.statusCode<200||res.statusCode>=300) {
        await sleep(3000);
        continue;
      }

      const text = res.bytes.toString('utf8').slice(0, 12_000);
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
