import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import {
  DEFAULT_ONBOARDING,
  normalizeOnboarding,
  shouldRouteToOnboarding,
} from '@/lib/onboarding';

export const metadata = {
  title: 'Set up Xroga',
  description: 'Tell Xroga what you are building and connect your tools.',
  robots: { index: false, follow: false },
};

/**
 * Onboarding sits outside the app shell on purpose: no sidebar, no composer, no
 * workspace chrome. It is the one screen whose whole job is to be finished and left.
 *
 * Gated the same way the shell is, with the same server-side session check, so it
 * cannot be reached by a signed-out visitor typing the path.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const phone = await supabase.rpc('has_current_contact_phone');
  if (phone.error) throw new Error('Contact setup unavailable');
  if (!phone.data) redirect('/auth/contact?next=%2Fonboarding');

  const { data: profile, error } = await supabase.rpc('read_current_profile_setup');
  if (error || (profile && profile.id !== user.id)) throw new Error('Profile setup unavailable');

  const state = profile ? normalizeOnboarding(profile.onboarding) : { ...DEFAULT_ONBOARDING };

  // An account that has already finished or skipped does not get asked again, even
  // if it comes back to the URL directly.
  if (!shouldRouteToOnboarding(state)) redirect('/workspace');

  return <OnboardingFlow initial={state} />;
}
