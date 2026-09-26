'use client';

import { PluginMarketplace } from '@/components/integrations/PluginMarketplace';

/**
 * Canonical Plugins surface.
 *
 * The internal route/file names intentionally remain "integrations" so the
 * frontend can evolve without changing OAuth callbacks or backend contracts.
 */
export function IntegrationsPanel() {
  return <PluginMarketplace />;
}
