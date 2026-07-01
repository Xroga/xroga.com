import { NextResponse } from 'next/server';

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
    const blob = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') ?? 'image/png';
    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType.split(';')[0] ?? 'image/png',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
