import type { ChatMessage } from '@/context/TerminalChatContext';
import { isSimpleChat } from '@/lib/promptClassifier';

const MAX_CONTEXT_TURNS = 8;
const MAX_SNIPPET = 280;

/** Inject recent thread context for conversational memory (chat-only prompts). */
export function buildPromptWithMemory(prompt: string, messages: ChatMessage[]): string {
  if (!isSimpleChat(prompt) || messages.length < 2) return prompt;

  const recent = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.content || m.featureOutput))
    .slice(-MAX_CONTEXT_TURNS);

  if (recent.length === 0) return prompt;

  const lines = recent.map((m) => {
    const label = m.role === 'user' ? 'User' : 'Assistant';
    let body = m.content?.trim() ?? '';
    if (!body && m.featureOutput && typeof m.featureOutput === 'object') {
      const o = m.featureOutput as { type?: string; title?: string; prompt?: string };
      if (o.type === 'image') body = `[Generated image: ${o.prompt ?? o.title ?? 'image'}]`;
      else if (o.type === 'video_studio') body = `[Generated video: ${o.title ?? 'video'}]`;
    }
    return `${label}: ${body.slice(0, MAX_SNIPPET)}`;
  });

  return `[Previous conversation for context — refer when user asks about earlier messages]\n${lines.join('\n')}\n\n[Current message]\n${prompt}`;
}
