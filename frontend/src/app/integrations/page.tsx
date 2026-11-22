import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import {
  PUBLIC_INTEGRATION_CARDS,
  PUBLIC_INTEGRATION_CATEGORIES,
} from '@/lib/publicIntegrationsDirectory';
import { IntegrationsMarketplace } from './IntegrationsMarketplace';
import './integrations.css';

export const metadata: Metadata = buildMetadata({
  title: 'Xroga Integrations — Apps, AI Agents & MCP',
  description: 'Discover available apps in Xroga Connect, explore real provider logos and integration details, and learn how Xroga can work with AI agents, your workspace and compatible MCP servers.',
  path: '/integrations',
  keywords: [
    'Xroga integrations',
    'Xroga Connect',
    'Xroga AI apps',
    'AI agent integrations',
    'custom MCP server',
    'GitHub Vercel Xroga connections',
  ],
});

export default function IntegrationsPage() {
  return (
    <main className="xi-main">
      <PageJsonLd
        path="/integrations"
        name="Xroga Connect — Apps, AI Agents and MCP"
        description="Explore app integrations and technology examples, review provider details in your workspace, and learn GitHub-based handoffs with external AI agents."
        type="CollectionPage"
      />
      {/* The existing PublicMarketingChrome renders the site header and footer.
          Never insert another navigation bar on this marketing page. */}
      <IntegrationsMarketplace
        items={PUBLIC_INTEGRATION_CARDS}
        categories={PUBLIC_INTEGRATION_CATEGORIES}
      />
    </main>
  );
}
