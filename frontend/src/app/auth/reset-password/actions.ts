'use server';

import { cookies } from 'next/headers';
import { RECOVERY_COOKIE } from '@/lib/supabase/recoverySession';

/** The marker is single-purpose: clear it as soon as the password has been changed. */
export async function clearRecoveryMarker(): Promise<void> {
  (await cookies()).delete({ name: RECOVERY_COOKIE, path: '/auth' });
}
