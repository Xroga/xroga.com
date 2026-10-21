import { NextResponse } from 'next/server';
import {webReleaseIdentity} from '../../../lib/releaseIdentity';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      service: 'xroga-web',
      release: webReleaseIdentity({XROGA_RELEASE_SHA:process.env.XROGA_RELEASE_SHA,
        VERCEL_GIT_COMMIT_SHA:process.env.VERCEL_GIT_COMMIT_SHA,GITHUB_SHA:process.env.GITHUB_SHA}),
      environment: process.env.VERCEL_ENV ?? 'local',
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
