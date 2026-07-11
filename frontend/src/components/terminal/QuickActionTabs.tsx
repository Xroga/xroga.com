'use client';

import { useState } from 'react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { QUICK_ACTIONS } from '@/lib/quickActions';
import { ModernTabBar } from '@/components/ui/ModernTabBar';

export function QuickActionTabs() {
  const { setPrompt, loading } = useTerminalChat();
  const [activeId, setActiveId] = useState<string>('chat');

  function handleSelect(id: string) {
    const action = QUICK_ACTIONS.find((a) => a.id === id);
    if (!action) return;
    setActiveId(id);
    setPrompt(action.prompt);
  }

  return (
    <ModernTabBar
      tabs={QUICK_ACTIONS.map(({ id, label, icon }) => ({ id, label, icon }))}
      activeId={activeId}
      onSelect={handleSelect}
      disabled={loading}
      interactive
    />
  );
}
