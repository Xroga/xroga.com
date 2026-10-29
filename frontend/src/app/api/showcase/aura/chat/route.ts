import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {NextResponse} from 'next/server';
import {parseAuraInput, requestGroqStream, readAuraBoundedText} from '@/lib/showcase/auraGroq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const COOKIE = '__Host-xroga-aura-guest';

function clientAddress(request: Request): string | null {
  // Vercel overwrites this header at the platform boundary. Arbitrary forwarded
  // headers outside that deployment never create a new quota identity.
  if (process.env.VERCEL === '1') {
    const address = request.headers.get('x-vercel-forwarded-for')?.trim() || '';
    return isIP(address) ? address : null;
  }
  if (process.env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost'].includes(new URL(request.url).hostname)) return '127.0.0.1';
  return null;
}

function sameOrigin(request: Request) {
  try {
    const url = new URL(request.url), origin = request.headers.get('origin');
    if (!origin || origin !== url.origin) return false;
    if (process.env.NODE_ENV !== 'production') return ['localhost', '127.0.0.1'].includes(url.hostname);
    const hosts = ['xroga.com', 'www.xroga.com', 'xrogaai.com', 'www.xrogaai.com', process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL];
    return url.protocol === 'https:' && hosts.includes(url.host);
  } catch { return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({error: 'Invalid origin.'}, {status: 403});
  const address = clientAddress(request);
  if (!address) return NextResponse.json({error: 'Live AI is temporarily unavailable.'}, {status: 503});
  const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  let input;
  try {
    const text = await readAuraBoundedText(request.body, deadline, 210000);
    input = parseAuraInput(JSON.parse(text));
  } catch { return NextResponse.json({error: 'Invalid or oversized request.'}, {status: 400}); }
  if (!input) return NextResponse.json({error: 'Add a message before sending.'}, {status: 400});
  const rawCookie = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const sessionId = rawCookie && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawCookie) ? rawCookie : randomUUID();
  const result = await requestGroqStream(input, request.signal, {sessionId, address});
  const headers = {'Cache-Control': 'no-store', 'Set-Cookie': `${COOKIE}=${sessionId}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400`};
  if (!result.ok) return NextResponse.json({error: result.message}, {status: result.status, headers});
  return new Response(result.body, {headers: {...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no'}});
}
