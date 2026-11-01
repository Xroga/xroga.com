import { parseXrogaOutput } from './xrogaBlocks';
export interface ResearchHandoff {
  confirmationId: string;
  receiptId: string;
  text: string;
  sources: Array<{ title: string; url: string; snippet: string; source: string }>;
  omittedSourceCount: number;
}
interface Message {
  id: string;
  role: string;
  content: string;
  researchReceiptId?: string;
  featureOutput?: unknown;
  webSources?: Array<{ title: string; url: string; snippet: string }>;
}

const UNAVAILABLE_NOTICE = '\n\nThe approved research result is currently unavailable. Xroga has not repeated the search or charged for another request.';
export function markResearchUnavailable<T extends Message>(message: T, confirmationId: string): T {
  if (pendingResearchConfirmation(message) !== confirmationId || message.content.endsWith(UNAVAILABLE_NOTICE)) return message;
  return withContent(message, message.content + UNAVAILABLE_NOTICE);
}

/** Keep the existing ordered blocks and their source text while appending evidence. */
function withContent<T extends Message>(message: T, content: string): T {
  const raw = message.featureOutput as { type?: string } | undefined;
  if (raw?.type === 'chat') return { ...message, content, featureOutput: { ...raw, content } };
  const output = parseXrogaOutput(message.featureOutput);
  if (output?.composition === 'source-order') {
    const handoffId = `${message.id}-research-handoff`;
    const blocks = output.blocks.filter(block => block.id !== handoffId);
    const original = blocks.flatMap(block => block.type === 'narrative' ? [block.text] : []).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
    if (content.startsWith(original)) {
      const addition = content.slice(original.length).trim();
      return { ...message, content, featureOutput: { ...output, blocks: [...blocks,
        { schemaVersion: 1, id: handoffId, type: 'narrative', text: addition }],
      } };
    }
  }
  return { ...message, content };
}

export function pendingResearchConfirmation(message: Message): string | null {
  if (message.role !== 'assistant' || message.researchReceiptId || !/research|web search|live evidence/i.test(message.content)) return null;
  const links = [...message.content.matchAll(/\/dashboard\/actions\/confirm\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?![a-f0-9-])/gi)];
  return links.length === 1 ? links[0]![1]! : null;
}

export function attachResearchResult<T extends Message>(message: T, result: ResearchHandoff): T {
  if (pendingResearchConfirmation(message) !== result.confirmationId || !result.receiptId) return message;
  const escape = (s: string) => s.replace(/([\\`*_[\]<>])/g, '\\$1');
  const evidence = result.sources.map(source => `### ${escape(source.title)}\n\n${source.snippet.split('\n').map(line => `> ${line}`).join('\n')}\n\n[${escape(source.title)}](<${source.url}>)`).join('\n\n');
  const original = message.content.endsWith(UNAVAILABLE_NOTICE) ? message.content.slice(0, -UNAVAILABLE_NOTICE.length) : message.content;
  const content = [original, '## Approved research results',
    'The approved request has completed. The following source excerpts are quoted third-party material. No additional search was made.',
    result.text, evidence || (!result.text ? 'The provider returned no usable public sources.' : ''),
    result.omittedSourceCount ? `${result.omittedSourceCount} source entries were not displayed because their URLs failed validation.` : '',
  ].filter(Boolean).join('\n\n');
  const sources = new Map((message.webSources ?? []).map(source => [source.url, source]));
  for (const source of result.sources) if (!sources.has(source.url)) sources.set(source.url, source);
  return { ...withContent(message, content), webSources: [...sources.values()], researchReceiptId: result.receiptId };
}
