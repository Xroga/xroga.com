import { AiCodingAgentLanding } from '@/components/marketing/AiCodingAgentLanding';
import { CAPABILITY_PAGES } from '@/lib/capabilityPages';
import { buildMetadata } from '@/lib/seo';

// This route has a landing of its own rather than the shared CapabilityPage, which the
// other five capability routes still render unchanged. The copy is unchanged too: the
// landing reads the same CAPABILITY_PAGES entry this metadata does.
const data = CAPABILITY_PAGES['ai-coding-agent'];

export const metadata = buildMetadata({
  title: data.title,
  description: data.description,
  path: `/${data.slug}`,
  keywords: data.keywords,
});

export default function Page() {
  return <AiCodingAgentLanding />;
}
