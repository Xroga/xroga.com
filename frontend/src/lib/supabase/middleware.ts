import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicConfig } from './config';

/** Paths crawlers and visitors can access without signing in */
const PUBLIC_PREFIXES = [
  '/features',
  '/integrations',
  '/droga',
  '/pricing',
  '/about',
  '/contact',
  '/docs',
  '/terms',
  '/privacy',
  '/refund',
];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  // This route reports authenticated=false as JSON; middleware must not replace
  // that contract with an HTML login redirect for signed-out callers.
  if (pathname === '/api/session') return true;
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml') return true;
  if (pathname.startsWith('/auth')) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const config = getSupabasePublicConfig();

  const supabase = createServerClient(
    config.url,
    config.publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  const isAuthPage = pathname.startsWith('/auth');
  const isPublicPage = isPublicPath(pathname);

  if (!user && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
