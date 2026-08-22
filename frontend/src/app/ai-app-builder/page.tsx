import { AiAppBuilderLanding } from '@/components/marketing/AiAppBuilderLanding';
import { CAPABILITY_PAGES } from '@/lib/capabilityPages';
import { buildMetadata } from '@/lib/seo';

// Metadata still comes from the same capability entry, so title, description, keywords
// and canonical path are unchanged. Only the rendered page differs: this route now has
// a landing of its own instead of the shared CapabilityPage, which the other five
// capability routes continue to use untouched.
const data = CAPABILITY_PAGES['ai-app-builder'];

export const metadata = buildMetadata({
  title: data.title,
  description: data.description,
  path: `/${data.slug}`,
  keywords: data.keywords,
});

export default function Page() {
  return <AiAppBuilderLanding data={data} />;
}
