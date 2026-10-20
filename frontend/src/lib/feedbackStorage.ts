import { createClient } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

export interface FeedbackSubmission {
  rating: number;
  experience: string;
  featuresWanted: string;
}

function displayNameFromSession(session: Session | null) {
  const metadata = session?.user.user_metadata;
  const name = metadata?.display_name ?? metadata?.full_name ?? metadata?.name;
  if (typeof name === 'string' && name.trim()) return name.trim().slice(0, 120);
  return null;
}

export async function addFeedback(entry: FeedbackSubmission): Promise<void> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const pagePath = typeof window === 'undefined'
    ? null
    : `${window.location.pathname}${window.location.search}`.slice(0, 500);

  const { error } = await supabase.from('product_feedback').insert({
    rating: entry.rating,
    experience: entry.experience.slice(0, 2000),
    ideas: entry.featuresWanted.slice(0, 2000),
    display_name: displayNameFromSession(session),
    page_path: pagePath,
  });

  if (error) throw new Error(error.message);
}
