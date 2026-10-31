import { DashboardView } from '@/components/dashboard/DashboardView';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';
import { PAGE_SEO } from '@/lib/dashboard-metadata';
import { responsePresentationFixture, responsePresentationCases } from '@/lib/responsePresentationFixtures';

export const metadata = PAGE_SEO.dashboard;

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ responsePreview?: string }> }) {
  const requested = (await searchParams).responsePreview;
  const previewMessages = (process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development') && requested
    ? responsePresentationFixture(requested) : undefined;
  return (
    <DashboardErrorBoundary>
      <DashboardView responsePreview={previewMessages ? { messages: previewMessages, cases: [...responsePresentationCases], selected: requested! } : undefined} />
    </DashboardErrorBoundary>
  );
}
