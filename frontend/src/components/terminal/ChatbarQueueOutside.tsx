'use client';

import { ChatPromptQueue } from '@/components/terminal/ChatPromptQueue';
import { useTerminalChat } from '@/context/TerminalChatContext';

/** Queued prompts — attached above the chatbar shell */
export function ChatbarQueueOutside() {
  const { promptQueue, sendQueuedNow, editQueuedPrompt, removeFromQueue, clearQueue, loading } =
    useTerminalChat();

  if (promptQueue.length === 0) return null;

  return (
    <div className="xv-chatbar-queue-outside mb-1.5">
      <ChatPromptQueue
        queue={promptQueue}
        onSendNow={sendQueuedNow}
        onEdit={editQueuedPrompt}
        onRemove={removeFromQueue}
        onClear={clearQueue}
        loading={loading}
      />
    </div>
  );
}
