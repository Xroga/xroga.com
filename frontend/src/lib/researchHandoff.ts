import { parseXrogaOutput } from './xrogaBlocks';
import {enhanceAiResponse} from './xrogaResponseDocument';
import { safeSourceUrl } from './xrogaCitations';
export const RESEARCH_RECEIPT_AVAILABLE = 'xroga:research-receipt-available';
export interface ResearchHandoff {
  confirmationId: string;
  receiptId: string;
  text: string;
  sources: Array<{ title: string; url: string; snippet: string; source: string }>;
  omittedSourceCount: number;
  answer?:{response:string;completion:{status:string;reason?:string};responseSource?:{format:string;text:string;contract?:unknown};webSources:Array<{title:string;url:string;snippet:string;source:string}>};
  answerFailure?:string;
}
interface Message {
  id: string;
  role: string;
  content: string;
  researchReceiptId?: string;
  publicWebRetrieved?: true;
  featureOutput?: unknown;
  webSources?: Array<{ title: string; url: string; snippet: string }>;
}

export function isResearchReceiptId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
}

/** Only a settled research handoff can distinguish retrieved evidence from ordinary links. */
export function retrievedWebSourceCount(message: Pick<Message, 'role' | 'researchReceiptId' | 'publicWebRetrieved' | 'webSources'>): number {
  if (message.role !== 'assistant' || (message.publicWebRetrieved !== true && !isResearchReceiptId(message.researchReceiptId))) return 0;
  return new Set((message.webSources ?? []).flatMap(source => safeSourceUrl(source.url) ?? [])).size;
}

const UNAVAILABLE_NOTICE = '\n\nThe saved research result is currently unavailable.';
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

function withoutSettledResearchReview<T extends Message>(message: T, confirmationId: string): T {
  const reviewUrl = '/dashboard/actions/confirm/' + confirmationId;
  const strip = (text: string) => text.split(/\n\s*\n/).filter(block => !(
    block.includes(reviewUrl) && /^\s*(?:Review the (?:exact (?:external )?research request|request before Xroga searches the web)|Research requires approval\.)/i.test(block)
  )).join('\n\n');
  const content = strip(message.content);
  if (message.content === content) return message;
  const output = parseXrogaOutput(message.featureOutput);
  if (output?.composition === 'source-order') {
    const blocks = output.blocks.flatMap((block): typeof output.blocks => {
      if (block.type !== 'narrative') return [block];
      const text = strip(block.text);
      return text ? [{ ...block, text }] : [];
    });
    return { ...message, content, featureOutput: { ...output, blocks } };
  }
  return withContent(message, content);
}

export function pendingResearchConfirmation(message: Message): string | null {
  if (message.role !== 'assistant' || message.researchReceiptId || !/research|web search|live evidence/i.test(message.content)) return null;
  const links = [...message.content.matchAll(/\/dashboard\/actions\/confirm\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?![a-f0-9-])/gi)];
  return links.length === 1 ? links[0]![1]! : null;
}

export function attachResearchResult<T extends Message>(message: T, result: ResearchHandoff): T {
  if (pendingResearchConfirmation(message) !== result.confirmationId || !result.receiptId) return message;
  if(result.answer&&result.receiptId===result.confirmationId&&typeof result.answer.response==='string'
    &&result.answer.response.length<=160_000&&['complete','partial'].includes(result.answer.completion?.status)){
    const answer=enhanceAiResponse(result.answer.response,message.id,result.answer.completion,result.answer.responseSource);
    return {...message,content:answer.content,featureOutput:answer.output??{type:'chat',content:answer.content},webSources:result.answer.webSources,researchReceiptId:result.receiptId};
  }
  if (result.answerFailure === 'NO_QUALIFYING_SOURCES' && !result.sources.length) {
    const content = 'I found no sources that met your request, so I couldn’t verify an answer.';
    return { ...message, content, featureOutput: { type: 'chat', content }, webSources: [], researchReceiptId: result.receiptId };
  }
  const escape = (s: string) => s.replace(/([\\`*_[\]<>])/g, '\\$1');
  const evidence = result.sources.map(source => `### ${escape(source.title)}\n\n${source.snippet.split('\n').map(line => `> ${line}`).join('\n')}\n\n[${escape(source.title)}](<${source.url}>)`).join('\n\n');
  const settledMessage = withoutSettledResearchReview(message, result.confirmationId);
  const original = settledMessage.content.endsWith(UNAVAILABLE_NOTICE)
    ? settledMessage.content.slice(0, -UNAVAILABLE_NOTICE.length)
    : settledMessage.content === UNAVAILABLE_NOTICE.trim() ? '' : settledMessage.content;
  const content = [original, '## Web sources',
    result.answerFailure ? 'I found sources, but couldn’t finish the answer.' : '',
    result.text, evidence || (!result.text ? 'I couldn’t find usable public sources.' : ''),
  ].filter(Boolean).join('\n\n');
  const sources = new Map((message.webSources ?? []).map(source => [source.url, source]));
  for (const source of result.sources) if (!sources.has(source.url)) sources.set(source.url, source);
  return { ...withContent(settledMessage, content), webSources: [...sources.values()], researchReceiptId: result.receiptId };
}
