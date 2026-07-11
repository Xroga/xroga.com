'use client';

import { useTerminalChat } from '@/context/TerminalChatContext';
import { QUICK_ACTIONS } from '@/lib/quickActions';
import { StaticQuickTab } from '@/components/ui/Uiverse';

export function QuickActionTabs() {
  const { setPrompt, loading } = useTerminalChat();

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-1 px-1 pb-2">
      <div className="flex gap-2 min-w-max">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <StaticQuickTab
              key={action.id}
              disabled={loading}
              icon={<Icon className="w-3.5 h-3.5 shrink-0" style={{ color: action.color }} />}
              onClick={(e) => {
                e.stopPropagation();
                setPrompt(action.prompt);
              }}
            >
              {action.label}
            </StaticQuickTab>
          );
        })}
      </div>
    </div>
  );
}
