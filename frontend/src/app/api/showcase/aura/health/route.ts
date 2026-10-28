import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const configured = Boolean(process.env.GROQ_API_KEY && (process.env.NODE_ENV !== 'production' || process.env.REDIS_URL));
  return NextResponse.json(
    { configured, provider: 'Groq' },
    { status: configured ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
