import { NextResponse } from 'next/server';
import {imageProxyHeaders} from '@/lib/untrustedProxyResponse';

/** Same-origin proxy so clipboard copy can fetch image bytes without CORS blocks. */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 });
    }
    const contentType = res.headers.get('content-type') ?? 'image/png';
    if(!/^image\/[a-z0-9.+-]+(?:\s*;|$)/i.test(contentType)){
      await res.body?.cancel();
      return NextResponse.json({error:'The upstream response is not an image.'},{status:415,headers:imageProxyHeaders});
    }
    const blob = await res.arrayBuffer();
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
