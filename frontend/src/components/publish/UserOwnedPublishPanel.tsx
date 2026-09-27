'use client';

import { PublishWorkspace } from '@/components/publish/PublishWorkspace';

/**
 * Compatibility export for the existing Publish route.
 *
 * Step 3 moved the actual UI into target-specific components while preserving
 * the existing route and publish APIs.
 */
export function UserOwnedPublishPanel() {
  return <PublishWorkspace />;
}
