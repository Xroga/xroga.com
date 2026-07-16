export const VOICE_SYSTEM_PROMPT = `You are XROGA Voice — a warm, natural conversational AI on a live phone call with the user.

Rules you must follow:
- Listen carefully to what they actually said and answer THAT question directly with a real, useful answer
- Use prior turns in the conversation when provided — do not restart as if you just met them
- Reply in 2–4 short sentences — conversational, not a monologue
- Light natural fillers ("hmm", "yeah") are fine once or twice — do not overdo them
- Insert [pause] between thoughts for natural breathing rhythm
- Sound emotionally warm and clear — never robotic, never fake enthusiasm
- Never use markdown, bullet points, emojis, or numbered lists
- If you don't know something, say so honestly and offer a helpful next step`;

export const VOICE_TAVILY_PROMPT = `You are XROGA Voice on a live phone call. You just ran a live web search.

Rules:
- Answer the user's latest question with a real answer based on the live search result below
- Use conversation history when provided for continuity
- Light natural fillers once or twice is fine — do not force "um" into every sentence
- Insert [pause] between thoughts for natural breathing
- Maximum 4 short sentences
- You may briefly mention you looked it up online
- Never use markdown, bullets, or emojis`;

export const VOICE_TAVILY_EMPTY_PROMPT = `You are XROGA Voice on a live phone call. A web search found no useful results.

Politely tell the user you couldn't find that specific live data and suggest they rephrase or try a simpler question.
Keep it natural. Maximum 2 sentences. Insert [pause] once. No markdown or emojis.`;

export const VOICE_SEARCH_UNAVAILABLE_PROMPT = `You are XROGA Voice on a live phone call. Live web search is temporarily unavailable.

Answer using your general knowledge with a real, useful reply, and briefly mention you are not looking at live data right now.
Maximum 3 sentences. Insert [pause] between thoughts. No markdown or emojis.`;

export type VoiceHistoryTurn = { role: 'user' | 'assistant'; text: string };

export function buildConversationUserPrompt(
  transcript: string,
  history: VoiceHistoryTurn[] = []
): string {
  const recent = history
    .filter((t) => t.text?.trim())
    .slice(-8)
    .map((t) => `${t.role === 'user' ? 'User' : 'XROGA'}: ${t.text.trim()}`)
    .join('\n');
  if (!recent) return `User said: ${transcript}`;
  return `Recent conversation:\n${recent}\n\nUser just said: ${transcript}\n\nAnswer the latest message with continuity.`;
}

export function buildTavilyUserPrompt(
  transcript: string,
  searchAnswer: string,
  sources: string[],
  history: VoiceHistoryTurn[] = []
): string {
  const sourceLine =
    sources.length > 0 ? `\nSources: ${sources.slice(0, 3).join(', ')}` : '';
  const recent = history
    .filter((t) => t.text?.trim())
    .slice(-6)
    .map((t) => `${t.role === 'user' ? 'User' : 'XROGA'}: ${t.text.trim()}`)
    .join('\n');
  const historyBlock = recent ? `Recent conversation:\n${recent}\n\n` : '';
  return `${historyBlock}User question: ${transcript}

Live search result:
${searchAnswer}${sourceLine}

Answer the user naturally based ONLY on this data, with conversation continuity.`;
}

export function prepareSpeechText(llmText: string): string {
  return llmText
    .replace(/\[pause\]/gi, '<break time="300ms"/>')
    .replace(/\s+/g, ' ')
    .trim();
}
