import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { OAUTH_NEXT_COOKIE } from '@/lib/supabase/oauthReturn';
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE_SECONDS, RECOVERY_PATH, redeemAuthCallback } from '@/lib/supabase/recoverySession';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createClient();
  const outcome = await redeemAuthCallback({
    code: searchParams.get('code'),
    tokenHash: searchParams.get('token_hash'),
    type: searchParams.get('type'),
    next: searchParams.get('next'),
    cookieNext: request.cookies.get(OAUTH_NEXT_COOKIE)?.value,
  }, supabase.auth);

  if (outcome.kind === 'failed') return NextResponse.redirect(`${origin}${outcome.path}`);

  let path = outcome.path;
  if (outcome.checkPhonePrompt) {
    const { data: needsPhonePrompt, error: phonePromptError } = await supabase.rpc('needs_current_contact_phone_prompt');
    if (!phonePromptError && needsPhonePrompt) path = `/auth/contact?next=${encodeURIComponent(outcome.path)}`;
  }
  const response = NextResponse.redirect(`${origin}${path}`);
  response.cookies.delete({ name: OAUTH_NEXT_COOKIE, path: '/auth/callback' });
  if (outcome.recoveryUserId) {
    // Server-set proof that this exact user just redeemed a recovery link. Never readable by page scripts.
    response.cookies.set({
      name: RECOVERY_COOKIE, value: outcome.recoveryUserId, httpOnly: true, sameSite: 'lax',
      secure: origin.startsWith('https:'), path: RECOVERY_PATH.replace('/reset-password', ''), maxAge: RECOVERY_MAX_AGE_SECONDS,
    });
  }
  return response;
}
