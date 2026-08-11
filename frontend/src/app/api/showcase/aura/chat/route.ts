import { NextResponse } from 'next/server';
import { parseAuraInput, requestGroqStream } from '@/lib/showcase/auraGroq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const windows = new Map<string, { count: number; resetAt: number }>();

function clientAddress(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const requestHost = request.headers.get('host');
    return originHost === forwardedHost || originHost === requestHost || originHost === new URL(request.url).host;
  } catch {
    return false;
  }
}

function isRateLimited(address: string) {
  const now = Date.now();
  const current = windows.get(address);
  if (!current || current.resetAt <= now) {
    windows.set(address, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 20;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  if (isRateLimited(clientAddress(request))) {
    return NextResponse.json({ error: 'The public demo is busy. Please try again in a minute.' }, { status: 429 });
  }

  const length = Number(request.headers.get('content-length') || 0);
  if (length > 210_000) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const input = parseAuraInput(payload);
  if (!input) return NextResponse.json({ error: 'Add a message before sending.' }, { status: 400 });

  try {
    const result = await requestGroqStream(input, request.signal);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
    return new Response(result.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return new Response(null, { status: 499 });
    console.error('Aura showcase request failed', { category: 'groq_upstream_failure' });
    return NextResponse.json({ error: 'The AI provider could not complete this request.' }, { status: 502 });
  }
}
