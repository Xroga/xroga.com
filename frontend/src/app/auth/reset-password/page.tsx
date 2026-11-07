import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { RECOVERY_COOKIE, recoveryReady } from '@/lib/supabase/recoverySession';
import { ResetPasswordForm } from './ResetPasswordForm';

export const dynamic = 'force-dynamic';

/**
 * The form opens for a callback-mediated link only when the server itself redeemed that link for the
 * currently signed-in user (httpOnly marker). A plain signed-in session never opens it. A direct
 * `token_hash` link is redeemed in the form after an explicit click, as before.
 */
export default async function ResetPasswordPage() {
  const marker = (await cookies()).get(RECOVERY_COOKIE)?.value;
  let callbackVerified = false;
  if (marker) {
    const { data } = await (await createClient()).auth.getUser();
    callbackVerified = recoveryReady(data.user?.id, marker);
  }
  return <ResetPasswordForm callbackVerified={callbackVerified} />;
}
