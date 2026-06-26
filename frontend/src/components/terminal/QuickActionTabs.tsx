'use client';

import { useTerminalChat } from '@/context/TerminalChatContext';
import { QUICK_ACTIONS } from '@/lib/quickActions';
import { FrutigerButton } from '@/components/ui/Uiverse';

export function QuickActionTabs() {
  const { setPrompt, loading } = useTerminalChat();

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-1 px-1 pb-2">
      <div className="flex gap-2 min-w-max">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <FrutigerButton
              key={action.id}
              disabled={loading}
              icon={<Icon className="w-3.5 h-3.5 text-white relative z-10" />}
              onClick={(e) => {
                e.stopPropagation();
                setPrompt(action.prompt);
              }}
            >
              {action.label}
            </FrutigerButton>
          );
        })}
      </div>
    </div>
  );
}
