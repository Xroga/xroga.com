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
              className="border border-white/10 bg-[#0f1117] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/20 hover:bg-[#151924]"
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
