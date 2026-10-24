import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Lightbulb, MessageSquareText, Star, TrendingUp } from 'lucide-react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { authorizeFounderRequest } from '@/lib/osFounderAccess';
import styles from './page.module.css';

type FeedbackRow = {
  id: string;
  user_id: string | null;
  submitter_email: string | null;
  display_name: string | null;
  rating: number;
  experience: string;
  ideas: string;
  page_path: string | null;
  created_at: string;
};

const ratingLabel = (rating: number) => {
  if (rating === 5) return 'Excellent';
  if (rating === 4) return 'Good';
  if (rating >= 2) return 'Fair';
  return 'Poor';
};

export const metadata: Metadata = {
  title: 'Feedback Admin — Xroga',
  robots: { index: false, follow: false },
};

export default async function FeedbackAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login?next=%2Fadmin%2Ffeedback');

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
  if (!decision.allowed) {
    return (
      <main className={styles.deniedPage}>
        <section className={styles.deniedCard}>
          <p>403 · Access denied</p>
          <h1>Feedback owner only</h1>
          <span>Use the confirmed founder account with its existing owner role and an MFA-verified session. Access remains closed until all checks pass.</span>
          <Link href="/dashboard">Return to dashboard</Link>
        </section>
      </main>
    );
  }

  const { data, error } = await supabase
    .from('product_feedback')
    .select('id,user_id,submitter_email,display_name,rating,experience,ideas,page_path,created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  const feedback = (data ?? []) as FeedbackRow[];
  const average = feedback.length
    ? feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length
    : 0;
  const positive = feedback.filter((item) => item.rating >= 4).length;
  const ideas = feedback.filter((item) => item.ideas.trim()).length;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.pageHeader}>
          <div>
            <Link href="/dashboard" className={styles.backLink}><ArrowLeft aria-hidden="true" /> Dashboard</Link>
            <p className={styles.eyebrow}>Private owner workspace</p>
            <h1>User feedback</h1>
            <span>Ideas and experience reports submitted across Xroga.</span>
          </div>
          <div className={styles.adminIdentity}>
            <span>Authorized account</span>
            <strong>{user.email}</strong>
          </div>
        </header>

        <section className={styles.stats} aria-label="Feedback summary">
          <article><MessageSquareText aria-hidden="true" /><span><strong>{feedback.length}</strong><small>Total responses</small></span></article>
          <article><Star aria-hidden="true" /><span><strong>{average.toFixed(1)}</strong><small>Average rating</small></span></article>
          <article><TrendingUp aria-hidden="true" /><span><strong>{feedback.length ? Math.round((positive / feedback.length) * 100) : 0}%</strong><small>Good or excellent</small></span></article>
          <article><Lightbulb aria-hidden="true" /><span><strong>{ideas}</strong><small>Improvement ideas</small></span></article>
        </section>

        {error ? (
          <section className={styles.emptyState}>
            <h2>Feedback could not be loaded</h2>
            <p>Please refresh the page. Database access remains protected.</p>
          </section>
        ) : feedback.length === 0 ? (
          <section className={styles.emptyState}>
            <MessageSquareText aria-hidden="true" />
            <h2>No feedback yet</h2>
            <p>New submissions will appear here as users share their experience.</p>
          </section>
        ) : (
          <section className={styles.feedbackList} aria-label="Feedback submissions">
            {feedback.map((item) => (
              <article className={styles.feedbackCard} key={item.id}>
                <header>
                  <div>
                    <strong>{item.display_name || item.submitter_email || 'Guest user'}</strong>
                    <span>{item.submitter_email || 'Anonymous submission'}</span>
                  </div>
                  <span className={styles.rating} data-rating={item.rating}>{ratingLabel(item.rating)} · {item.rating}/5</span>
                </header>
                <div className={styles.feedbackBody}>
                  <section>
                    <span>Experience</span>
                    <p>{item.experience || 'No experience note provided.'}</p>
                  </section>
                  <section>
                    <span>Future improvement</span>
                    <p>{item.ideas || 'No improvement idea provided.'}</p>
                  </section>
                </div>
                <footer>
                  <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</time>
                  <span>{item.page_path || 'Page not recorded'}</span>
                </footer>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
