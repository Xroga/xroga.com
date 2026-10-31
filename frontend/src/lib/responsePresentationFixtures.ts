import type { ChatMessage } from '@/context/TerminalChatContext';
import { enhanceAiResponse } from './xrogaResponseDocument';

/** Deterministic UI specimens, never provider output or execution evidence. */
export const responsePresentationCases = ['short', 'long', 'headings', 'sources', 'code', 'math', 'table', 'chart', 'calculator', 'diagram', 'streaming', 'approval'] as const;
export type ResponsePresentationCase = typeof responsePresentationCases[number];

export function responsePresentationFixture(name: string): ChatMessage[] | undefined {
  if (!responsePresentationCases.includes(name as ResponsePresentationCase)) return undefined;
  if (name === 'approval') return [
    { id: 'response-preview-approval-user', role: 'user', content: 'Presentation check: approval. Synthetic data, no model call.' },
    { id: 'response-preview-approval-assistant', role: 'assistant', content: 'Synthetic approval and file preview. No action is connected.', featureOutput: {
      type: 'xroga.output', schemaVersion: 1, id: 'response-preview-approval', status: 'partial', blocks: [
        { schemaVersion: 1, id: 'sample-file', type: 'file', title: 'Illustrative draft.txt', content: 'A synthetic draft for presentation testing.' },
        { schemaVersion: 1, id: 'sample-approval', type: 'approval', approval: { id: 'sample-only', action: 'none', title: 'Synthetic approval example', description: 'Display only. No account, publishing action or approval submission is connected.', status: 'requested', risk: 'low' } },
      ],
    } },
  ];
  const prose: Record<string, string> = {
    short: 'Yes. You can edit the draft before sending it.',
    long: 'Keep the original files and verify the result before publishing. This is a synthetic response used to inspect presentation, not a completed task.\n\n' + Array.from({ length: 4 }, (_, i) => `## ${['Review the source', 'Compare the options', 'Check the result', 'Preserve recovery'][i]}\n\nA readable response keeps the claim beside its evidence. It separates confirmed facts from assumptions and gives the reader enough context to decide what to do next.\n\n- Preserve the original wording.\n- Keep links and numbers intact.\n- Use a visual only when it helps.`).join('\n\n'),
    headings: '# A clear response\n\nA short introduction with **useful emphasis**, without a separate summary card.\n\n## Next steps\n\n1. Review the input.\n2. Verify the result.\n   - Keep the supporting evidence.\n   - Record uncertainty.\n\n### What to preserve\n\n> Original text, ownership and approvals.\n\nاردو متن اور English can share a paragraph. हिन्दी पाठ भी सुरक्षित रहे।',
    sources: 'Read the [original reference](https://example.com/reference) and keep the source beside its claim.\n\nA long URL should wrap without stretching the conversation: https://example.com/' + 'reference-'.repeat(25),
    code: '## Review the implementation\n\nKeep `account.ownerId` intact.\n\n```ts\nconst message = "Original punctuation — and exact values: 1.25";\nconst longValue = "' + 'long-source-value-'.repeat(15) + '";\n```\n\n<script>alert("untrusted")</script>\n\n[Unsafe link](javascript:alert(1))',
    math: '$$y = 2x + 3$$\n\nFor x = 4, y = 11. These are illustrative values.',
    table: '| Option | Time (minutes) | Cost (USD) | Note |\n| --- | ---: | ---: | --- |\n| A | 10 | 2 | Synthetic |\n| B | 15 | 1 | Synthetic |\n| C | 20 | 0.5 | Synthetic |',
    streaming: '## Streaming specimen\n\nThe response is arriving with **unfinished emphasis and an incomplete [reference](https://example.com',
    approval: 'This is an approval presentation specimen. No account is connected and no action will be submitted.',
  };
  const rich: Record<string, object> = {
    chart: { type: 'chart', title: 'Illustrative completion time', description: 'Synthetic fixture, minutes. No live measurements.', chartType: 'bar', xKey: 'option', data: [{ option: 'A', minutes: 10 }, { option: 'B', minutes: 15 }, { option: 'C', minutes: 20 }], series: [{ key: 'minutes', label: 'Time (minutes)' }], summary: 'A: 10 minutes, B: 15 minutes, C: 20 minutes. Synthetic values.' },
    calculator: { type: 'calculator', title: 'Illustrative budget calculator', description: 'Assumption: budget equals hours multiplied by hourly cost. No account access or financial action.', operation: 'product', inputs: [{ id: 'hours', label: 'Hours', value: 20, min: 0, max: 120, step: 1, unit: 'hours' }, { id: 'rate', label: 'Hourly cost', value: 25, min: 0, max: 100, step: 1, unit: 'USD/hour' }], resultLabel: 'Illustrative budget', resultUnit: 'USD', precision: 2 },
    diagram: { type: 'graph', title: 'Review before publishing', description: 'Illustrative workflow, not a running task.', nodes: [{ id: 'input', label: 'Input', detail: 'Preserve the request' }, { id: 'review', label: 'Review', detail: 'Verify the evidence' }, { id: 'approval', label: 'Approval', detail: 'Ask before consequential actions' }], edges: [{ source: 'input', target: 'review' }, { source: 'review', target: 'approval' }] },
  };
  const raw = rich[name] ? 'Synthetic presentation fixture.\n\n```xroga-ui\n' + JSON.stringify(rich[name]) + '\n```' : prose[name];
  const enhanced = name === 'streaming' ? { content: raw } : enhanceAiResponse(raw, `response-preview-${name}`);
  return [{ id: `response-preview-${name}-user`, role: 'user', content: `Presentation check: ${name}. Synthetic data, no model call.` }, { id: `response-preview-${name}-assistant`, role: 'assistant', content: enhanced.content, featureOutput: enhanced.output ? { type: 'xroga.output', ...enhanced.output } : undefined }];
}
