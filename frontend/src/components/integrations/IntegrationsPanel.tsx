'use client';

import { PluginMarketplace } from '@/components/integrations/PluginMarketplace';

/**
 * Public Plugins surface.
 *
 * The internal route and legacy component name stay stable so OAuth callbacks,
 * deep links and existing imports do not churn while the user-facing experience
 * is the Plugins marketplace.
 */
export function IntegrationsPanel() {
  return <PluginMarketplace />;
}
