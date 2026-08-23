import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicConfig } from './config';
import { isPublicPath, requiresUserLookup } from './routeAccess';

function authUnavailableResponse(request: NextRequest, isPublicPage: boolean) {
  if (isPublicPage) return NextResponse.next({ request });

  const url = request.nextUrl.clone();
  url.pathname = '/auth/login';
  url.search = '';
  url.searchParams.set('reason', 'authentication_unavailable');
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAuthPage = pathname.startsWith('/auth');
  const isPublicPage = isPublicPath(pathname);
  let supabaseResponse = NextResponse.next({ request });

  /*
   * Nothing below can change the response for a public, non-auth path, so the auth
   * round trip that used to happen here is skipped entirely — client included. For a
   * signed-in reader that removes one call to the auth server from every navigation
   * and every RSC prefetch of a public page.
   */
  if (!requiresUserLookup(pathname)) return supabaseResponse;

  let config: ReturnType<typeof getSupabasePublicConfig>;
  try {
    config = getSupabasePublicConfig();
  } catch {
    // Configuration details may contain deployment information. Keep the public
    // site available, fail protected routes closed, and log only a safe category.
    console.error('Authentication middleware unavailable', {
      category: 'invalid_public_auth_configuration',
      pathname,
    });
    return authUnavailableResponse(request, isPublicPage);
  }

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

  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    console.error('Authentication provider request failed', {
      category: 'authentication_provider_unavailable',
      pathname,
    });
    return authUnavailableResponse(request, isPublicPage);
  }

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
