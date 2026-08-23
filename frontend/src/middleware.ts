import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

/*
 * Files that can never be gated are excluded here rather than being allowed to reach
 * the middleware and fall out of it unchanged. Production logs showed the middleware
 * running for `/robots.txt`, which no visitor state can affect.
 *
 * `.well-known` covers the probes browsers and clients make on their own
 * (traffic-advice, change-password, apple-app-site-association), which arrive
 * alongside real navigations and were each paying for a middleware invocation.
 *
 * This has to stay one literal string. Next reads the matcher by parsing the source
 * rather than evaluating it, and rejects anything it cannot read statically — a
 * concatenation of two string literals fails the build with "Unsupported node type
 * BinaryExpression at config.matcher[0]".
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|opengraph-image|manifest.webmanifest|robots.txt|sitemap.xml|llms.txt|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|woff|woff2|ttf)$).*)',
  ],
};
