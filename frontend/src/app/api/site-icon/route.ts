import { NextResponse } from 'next/server';
import {imageProxyHeaders} from '@/lib/untrustedProxyResponse';
import {boundedPublicGet} from '@/lib/server/publicEgress';
import {ICON_HOST,MAX_ICON_BYTES,isIconDomain,sniffRasterImage} from '@/lib/siteIcon';
export const runtime='nodejs';

/**
 * Site logo for a cited source. DeepSeek Search already provides a site icon for every result, served from its own
 * icon host by domain. This route only ever connects to that one fixed host with a validated hostname, so a caller
 * cannot choose where the server connects. The reply is used only when the bytes really are a small raster image, and
 * is cached because a site's logo is public and the same for every user.
 */
export async function GET(request: Request) {
  const domain = (new URL(request.url).searchParams.get('d') ?? '').trim().toLowerCase();
  if (!isIconDomain(domain)) return NextResponse.json({ error: 'Invalid domain' }, { status: 400, headers: imageProxyHeaders });
  try {
    const res = await boundedPublicGet(`${ICON_HOST}${domain}`, { maxBytes: MAX_ICON_BYTES, timeoutMs: 6_000, maxRedirects: 0 });
    const bytes = new Uint8Array(res.bytes);
    const type = sniffRasterImage(bytes);
    if (!type) return NextResponse.json({ error: 'No icon' }, { status: 404, headers: imageProxyHeaders });
    return new NextResponse(bytes, { headers: { ...imageProxyHeaders, 'Content-Type': type, 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400' } });
  } catch {
    return NextResponse.json({ error: 'No icon' }, { status: 404, headers: imageProxyHeaders });
  }
}
