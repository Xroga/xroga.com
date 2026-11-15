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
  title: 'Xroga Connect — Integrations, Apps & Custom MCP',
  description: 'Discover Xroga integration guides, browse the software technology catalog, and explore authorized app actions, triggers, and custom MCP connections.',
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
    <main>
      <PageJsonLd
        path="/integrations"
        name="Xroga Connect — Apps and Integrations"
        description="Browse Xroga's technology catalog and supported app setup guides. Authorized connections, tool actions and triggers are verified in the workspace."
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
