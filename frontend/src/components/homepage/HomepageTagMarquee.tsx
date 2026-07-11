'use client';

import { QUICK_ACTIONS } from '@/lib/quickActions';
import { ModernTabBar } from '@/components/ui/ModernTabBar';

export function HomepageTagMarquee() {
  return (
    <div className="w-full max-w-4xl mx-auto flex justify-center px-1">
      <ModernTabBar
        tabs={QUICK_ACTIONS.map(({ id, label, icon }) => ({ id, label, icon }))}
        activeId="chat"
        interactive={false}
      />
    </div>
  );
}
