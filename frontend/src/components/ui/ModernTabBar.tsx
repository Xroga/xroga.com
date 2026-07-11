'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModernTabItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface ModernTabBarProps {
  tabs: ModernTabItem[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  disabled?: boolean;
  className?: string;
  /** Display-only tabs (homepage) vs interactive (workspace) */
  interactive?: boolean;
}

export function ModernTabBar({
  tabs,
  activeId,
  onSelect,
  disabled,
  className,
  interactive = true,
}: ModernTabBarProps) {
  return (
    <div className={cn('xv-modern-tabs-wrap', className)}>
      <div className="xv-modern-tabs" role="tablist" aria-label="Quick actions">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeId === tab.id;
          const Tag = interactive ? 'button' : 'span';

          return (
            <Tag
              key={tab.id}
              type={interactive ? 'button' : undefined}
              role="tab"
              aria-selected={isActive}
              disabled={interactive ? disabled : undefined}
              onClick={
                interactive && onSelect
                  ? (e) => {
                      e.stopPropagation();
                      onSelect(tab.id);
                    }
                  : undefined
              }
              className={cn(
                'xv-modern-tab',
                isActive && 'xv-modern-tab--active',
                !interactive && 'xv-modern-tab--static',
                disabled && interactive && 'opacity-50 pointer-events-none'
              )}
            >
              <span className="xv-modern-tab__icon">
                <Icon className="w-3.5 h-3.5" aria-hidden />
              </span>
              <span className="xv-modern-tab__label">{tab.label}</span>
              {isActive && <span className="xv-modern-tab__dot" aria-hidden />}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
