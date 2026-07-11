import type { ChatMessage } from '@/context/TerminalChatContext';

/** Reconstruct terminal messages from a saved swarm run (Cursor-style history restore). */
export function messagesFromSwarmRun(run: {
  id: string;
  prompt: string;
  output: unknown;
  created_at?: string;
}): ChatMessage[] {
  const createdAt = run.created_at ? new Date(run.created_at).getTime() : Date.now();
  const out = run.output as Record<string, unknown> | null;
  if (!out) {
    return [
      { id: `run-${run.id}-user`, role: 'user', content: run.prompt, createdAt },
      { id: `run-${run.id}-assistant`, role: 'assistant', content: 'Build completed.', createdAt: createdAt + 1 },
    ];
  }

  const snapshot = out.messagesSnapshot as ChatMessage[] | undefined;
  if (Array.isArray(snapshot) && snapshot.length > 0) {
    return snapshot.map((m, i) => ({
      ...m,
      id: m.id ?? `run-${run.id}-${i}`,
      createdAt: m.createdAt ?? createdAt + i,
    }));
  }

  const featureOutput =
    (out.featureOutput as Record<string, unknown> | undefined) ??
    (out.output as Record<string, unknown> | undefined);

  const userId = `run-${run.id}-user`;
  const assistantId = `run-${run.id}-assistant`;

  if (featureOutput?.type === 'landing_page') {
    return [
      { id: userId, role: 'user', content: run.prompt, createdAt },
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        featureOutput,
        createdAt: createdAt + 1,
      },
    ];
  }

  const polished =
    typeof out.polishedReply === 'string'
      ? out.polishedReply
      : typeof featureOutput?.content === 'string'
        ? featureOutput.content
        : 'Task completed.';

  return [
    { id: userId, role: 'user', content: run.prompt, createdAt },
    { id: assistantId, role: 'assistant', content: polished, createdAt: createdAt + 1 },
  ];
}
