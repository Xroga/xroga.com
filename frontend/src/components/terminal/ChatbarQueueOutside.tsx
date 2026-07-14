'use client';

import { ChatPromptQueue } from '@/components/terminal/ChatPromptQueue';
import { useTerminalChat } from '@/context/TerminalChatContext';

/** Queued prompts — attached above the chatbar shell */
export function ChatbarQueueOutside() {
  const {
    promptQueue,
    continueQueuedWhenReady,
    holdQueuedBuild,
    editQueuedPrompt,
    removeFromQueue,
    clearQueue,
    heavyBuildActive,
  } = useTerminalChat();

  if (promptQueue.length === 0) return null;

  return (
    <div className="xv-chatbar-queue-outside mb-1.5">
      <ChatPromptQueue
        queue={promptQueue}
        onContinue={continueQueuedWhenReady}
        onHold={holdQueuedBuild}
        onEdit={editQueuedPrompt}
        onRemove={removeFromQueue}
        onClear={clearQueue}
        heavyBuildActive={heavyBuildActive}
      />
    </div>
  );
}
