'use client';

import { useTerminalChat } from '@/context/TerminalChatContext';
import { QUICK_ACTIONS } from '@/lib/quickActions';
import { cn } from '@/lib/utils';

export function QuickActionTabs() {
  const { setPrompt, loading } = useTerminalChat();

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-1 px-1 pb-2">
      <div className="flex gap-2 min-w-max">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                setPrompt(action.prompt);
              }}
              className={cn(
                'quick-action-tab flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap',
                'border transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50'
              )}
              style={{
                borderColor: `${action.color}55`,
                background: `linear-gradient(135deg, ${action.color}22, ${action.color}08)`,
                color: 'var(--foreground)',
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: action.color }} />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
