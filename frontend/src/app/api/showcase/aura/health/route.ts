import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const configured = Boolean(process.env.GROQ_API_KEY);
  return NextResponse.json(
    { configured, provider: 'Groq' },
    { status: configured ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
