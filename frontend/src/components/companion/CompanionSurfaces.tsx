'use client';

import { usePathname } from 'next/navigation';
import { XrogaCompanion } from './XrogaCompanion';
import { useCompanionStore } from '@/store/useCompanionStore';

export function HomepageCompanionStage() {
  const name = useCompanionStore((state) => state.name);
  return (
    <div className="xv-home-companion-stage">
      <div className="xv-home-companion-copy">
        <span>MEET YOUR LIVING X-COMPANION</span>
        <strong>{name} follows real work, not fake timers.</strong>
        <p>Ask by text or optional voice. In Workspace, moods and gestures follow actual repository, build, test, repair, integration, and deployment events.</p>
      </div>
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
      <span className="xv-companion-composer-label">X-companion</span>
    </div>
  );
}
