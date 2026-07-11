'use client';

import { QUICK_ACTIONS } from '@/lib/quickActions';
import { cn } from '@/lib/utils';

export function HomepageTagMarquee() {
  const items = [...QUICK_ACTIONS, ...QUICK_ACTIONS];

  return (
    <div className="xv-home-tags-wrap w-full max-w-3xl mx-auto">
      <div className="hidden md:flex flex-wrap justify-center gap-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <span
              key={action.id}
              className="xv-capsule-tag flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-medium border backdrop-blur-md"
              style={{
                borderColor: `${action.color}55`,
                background: `${action.color}18`,
                color: 'rgba(255,255,255,0.95)',
              }}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: action.color }} />
              {action.label}
            </span>
          );
        })}
      </div>

      <div className="md:hidden overflow-hidden">
        <div className={cn('xv-home-tags-track flex flex-col gap-2 w-max')}>
          <div className="flex gap-2 xv-home-tags-row">
            {items.map((action, i) => {
              const Icon = action.icon;
              return (
                <span
                  key={`${action.id}-a-${i}`}
                  className="xv-capsule-tag flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-medium border backdrop-blur-md shrink-0"
                  style={{
                    borderColor: `${action.color}55`,
                    background: `${action.color}18`,
                    color: 'rgba(255,255,255,0.95)',
                  }}
                >
                  <Icon className="w-3 h-3 shrink-0" style={{ color: action.color }} />
                  {action.label}
                </span>
              );
            })}
          </div>
          <div className="flex gap-2 xv-home-tags-row xv-home-tags-row--reverse">
            {[...items].reverse().map((action, i) => {
              const Icon = action.icon;
              return (
                <span
                  key={`${action.id}-b-${i}`}
                  className="xv-capsule-tag flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-medium border backdrop-blur-md shrink-0"
                  style={{
                    borderColor: `${action.color}44`,
                    background: `${action.color}14`,
                    color: 'rgba(255,255,255,0.9)',
                  }}
                >
                  <Icon className="w-3 h-3 shrink-0" style={{ color: action.color }} />
                  {action.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
