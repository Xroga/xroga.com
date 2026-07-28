import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function safeRelease(value: string | undefined): string {
  return value?.match(/^[a-f0-9]{7,40}$/i)?.[0] ?? 'unavailable';
}

export async function GET() {
  return NextResponse.json(
    {
      service: 'xroga-web',
      release: safeRelease(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA),
      environment: process.env.VERCEL_ENV ?? 'local',
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
