'use client';

import { usePathname } from 'next/navigation';
import { XrogaCompanion } from './XrogaCompanion';
import { useCompanionStore } from '@/store/useCompanionStore';

export function HomepageCompanionStage() {
  return (
    <div className="xv-home-companion-stage">
      <XrogaCompanion variant="hero" />
    </div>
  );
}

export function CompanionGlobalDock() {
  const pathname = usePathname();
  const dock = useCompanionStore((state) => state.dock);
  const appSurface = pathname.startsWith('/dashboard') || pathname.startsWith('/settings');
  const workspaceCorner = pathname.startsWith('/workspace') && dock === 'corner';
  if (!appSurface && !workspaceCorner) return null;
  return <XrogaCompanion variant="floating" />;
}

export function CompanionComposerAnchor() {
  const dock = useCompanionStore((state) => state.dock);
  if (dock !== 'composer') return null;
  return (
    <div className="xv-companion-composer-anchor">
      <XrogaCompanion variant="composer" />
    </div>
  );
}
