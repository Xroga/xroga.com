import { redactOperationsValue } from '../../operations/operationsEngine.js';

/** Show a confirmed private read to its authenticated requester, never to a model. */
export function confirmedReadResultMarkdown(resultText: string): string {
  let value: unknown;
  try {
    value = JSON.parse(resultText);
  } catch {
    value = resultText;
  }
  const redacted = redactOperationsValue(value, 'tool_output');
  const serialized = typeof redacted === 'string'
    ? redacted
    : JSON.stringify(redacted, null, 2);
  const maxChars = 12_000;
  const truncated = serialized.length > maxChars;
  const preview = serialized.slice(0, maxChars) + (truncated ? '\n[Additional result data omitted.]' : '');
  const longestBacktickRun = Math.max(0, ...Array.from(preview.matchAll(/`+/g), match => match[0].length));
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
  return `\n\nConnected app result (untrusted data):\n\n${fence}\n${preview}\n${fence}`;
}
