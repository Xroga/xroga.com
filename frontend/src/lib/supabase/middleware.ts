import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicConfig } from './config';
import { isPublicPath, requiresUserLookup } from './routeAccess';
import { authorizeFounderRequest } from '../osFounderAccess';

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

  // This private binary route independently server-validates getUser before any API read.
  // Let it return safe JSON 401/503, never redirect a signed link into a login URL.
  // It is NOT a public-route grant; cookies alone or possession of the URL cannot authorize it.
  if(pathname.startsWith('/api/private-files/'))return supabaseResponse;

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

  // Deny before Next begins streaming HTML/RSC. A layout notFound() alone can
  // otherwise produce an HTTP 200 stream even though its children are withheld.
  // The server layout independently rechecks this same policy; navigation is not
  // authority and this never broadens the existing admin policy.
  if (pathname === '/os-preview' || pathname.startsWith('/os-preview/')) {
    const decision = await authorizeFounderRequest({
      getUser: async () => user,
      getRole: async () => {
        const { data, error } = await supabase.rpc('current_community_role');
        return error ? null : data;
      },
      getAal: async () => {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        return error ? null : data.currentLevel;
      },
    });
    if (!decision.allowed) return new NextResponse('Access denied.', {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' },
    });
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
