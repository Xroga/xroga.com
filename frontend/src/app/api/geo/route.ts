import { NextResponse } from 'next/server';
import { isBlockedRegion } from '@/lib/currency';

export async function GET(request: Request) {
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    'US';
  const code = country.toUpperCase();
  return NextResponse.json({
    country: code,
    blocked: isBlockedRegion(code),
    message: isBlockedRegion(code)
      ? 'Xroga does not operate in this region.'
      : undefined,
  });
}
