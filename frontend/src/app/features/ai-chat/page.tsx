import type { Metadata } from 'next';
import { AiChatLanding } from '@/components/marketing/AiChatLanding';
import { buildMetadata } from '@/lib/seo';

const title = 'Xroga AI Chat — Search, Research, Analyze & Act';
const description = 'Use Xroga AI Chat for grounded conversation, current web and X research, document analysis, screenshot understanding, and a safe handoff to repository work.';

export const metadata: Metadata = buildMetadata({
  title,
  description,
  path: '/features/ai-chat',
  keywords: ['Xroga AI Chat', 'AI assistant', 'AI research assistant', 'AI document analysis', 'AI screenshot analysis'],
});

export default function AiChatPage() {
  return <AiChatLanding />;
}
