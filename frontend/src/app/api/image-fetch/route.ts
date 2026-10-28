import { NextResponse } from 'next/server';
import {imageProxyHeaders} from '@/lib/untrustedProxyResponse';
import {boundedPublicGet,publicHttpsUrl} from '@/lib/server/publicEgress';
export const runtime='nodejs';

/** Same-origin proxy so clipboard copy can fetch image bytes without CORS blocks. */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  try { publicHttpsUrl(url); } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  try {
    const res = await boundedPublicGet(url,{maxBytes:16*1024*1024,timeoutMs:25_000,maxRedirects:3});
    const contentType = res.contentType;
    if(!/^image\/[a-z0-9.+-]+(?:\s*;|$)/i.test(contentType)){
      return NextResponse.json({error:'The upstream response is not an image.'},{status:415,headers:imageProxyHeaders});
    }
    const blob = new Uint8Array(res.bytes);
    return new NextResponse(blob, {
      headers: {
        ...imageProxyHeaders,
        'Content-Type': contentType.split(';')[0] ?? 'image/png',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'The image could not be retrieved.' }, { status: 502,headers:imageProxyHeaders });
  }
}
