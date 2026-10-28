import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { OAUTH_NEXT_COOKIE, safeAuthNextPath } from '@/lib/supabase/oauthReturn';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const recoveryType = searchParams.get('type');
  const cookieNext = request.cookies.get(OAUTH_NEXT_COOKIE)?.value;
  let decodedCookieNext: string | undefined;
  try { decodedCookieNext = cookieNext ? decodeURIComponent(cookieNext) : undefined; } catch { decodedCookieNext = undefined; }
  const requestedNext = searchParams.get('next') ?? decodedCookieNext;
  const next = safeAuthNextPath(requestedNext, '/dashboard');

  if (code || (tokenHash && recoveryType === 'recovery')) {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: 'recovery' });
    if (!error) {
      if (next !== '/auth/reset-password') {
        const { data: hasPhone, error: phoneError } = await supabase.rpc('has_current_contact_phone');
        if (phoneError || !hasPhone) {
          const response = NextResponse.redirect(`${origin}/auth/contact?next=${encodeURIComponent(next)}`);
          response.cookies.delete({ name: OAUTH_NEXT_COOKIE, path: '/auth/callback' });
          return response;
        }
      }
      const response = NextResponse.redirect(`${origin}${next}`);
      response.cookies.delete({ name: OAUTH_NEXT_COOKIE, path: '/auth/callback' });
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`);
}
