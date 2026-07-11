'use client';

import { InfluencerPanel } from '@/components/dashboard/InfluencerPanel';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';

export function InfluencerView() {
  return (
    <PageFullscreenFrame>
      <InfluencerPanel />
    </PageFullscreenFrame>
  );
}
