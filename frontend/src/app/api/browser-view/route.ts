import { NextRequest, NextResponse } from 'next/server';
import {browserProxyHeaders, escapeProxyHtml} from '@/lib/untrustedProxyResponse';
import {boundedPublicGet,publicHttpsUrl} from '@/lib/server/publicEgress';
export const runtime='nodejs';

function browserHtml(message: string, detail: string, target?: string) {
  message=escapeProxyHtml(message);detail=escapeProxyHtml(detail);target=target===undefined?undefined:escapeProxyHtml(target);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Xroga Browser</title>
    <style>
      body{margin:0;font-family:Inter,system-ui,sans-serif;background:#0b0f17;color:#e5ecff}
      .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
      .card{max-width:760px;width:100%;background:#101726;border:1px solid rgba(96,165,250,.2);border-radius:18px;padding:24px;box-shadow:0 20px 70px rgba(0,0,0,.35)}
      h1{margin:0 0 10px;font-size:20px}
      p{margin:0 0 12px;color:#9fb0cc;line-height:1.6}
      a{color:#60a5fa}
      code{display:block;margin-top:12px;padding:12px;border-radius:12px;background:#0b1220;color:#cfe1ff;overflow:auto}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>${message}</h1>
        <p>${detail}</p>
        ${target ? `<p>Open externally if needed: <a href="${target}" target="_blank" rel="noopener noreferrer">${target}</a></p>` : ''}
        ${target ? `<code>${target}</code>` : ''}
      </div>
    </div>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('target')?.trim();
  if (!target) {
    return new NextResponse(browserHtml('No page selected', 'Enter a URL or search term in Xroga Browser.'), {
      headers: browserProxyHeaders,
    });
  }

  try {
    publicHttpsUrl(target);
    const response = await boundedPublicGet(target,{maxBytes:2*1024*1024,timeoutMs:20_000,maxRedirects:3,allowHttpErrors:true});

    const contentType = response.contentType;
    if (response.statusCode<200||response.statusCode>=300) {
      return new NextResponse(
        browserHtml('Could not open this page', `The site returned ${response.statusCode}.`, target),
        { headers: browserProxyHeaders, status: 200 }
      );
    }

    if (!contentType.includes('text/html')) {
      return NextResponse.redirect(response.finalUrl);
    }

    const html = response.bytes.toString('utf8');
    const base=escapeProxyHtml(response.finalUrl);
    const injectedBase = html.includes('<head>')
      ? html.replace(
          /<head>/i,
          `<head><base href="${base}"><meta name="referrer" content="no-referrer" />`
        )
      : `<base href="${base}">${html}`;

    return new NextResponse(injectedBase, {
      headers: browserProxyHeaders,
    });
  } catch {
    return new NextResponse(
      browserHtml(
        'Browser fetch failed',
        'This website blocked loading inside the built-in browser proxy, or the request failed. Try another page or open it externally.',
        target
      ),
      { headers: browserProxyHeaders, status: 200 }
    );
  }
}
