import { describe, expect, it } from 'vitest';
import { clip, fitRequest, MAX_DESCRIPTION, MAX_TEXT } from '../fit-request';

describe('fitRequest', () => {
  it('keeps the start and the end of an over-long message and says what was cut', () => {
    const long = 'A'.repeat(30_000) + 'MIDDLE' + 'B'.repeat(30_000);
    const out = clip(long, MAX_TEXT);
    expect(out.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(out.startsWith('AAAA')).toBe(true);
    expect(out.endsWith('BBBB')).toBe(true);
    expect(out).toContain('characters cut to fit the request');
  });

  it('leaves a request that already fits unchanged', () => {
    const request = { messages: [{ role: 'user', content: 'hello' }], tools: [{ type: 'function', function: { name: 'a', description: 'b', parameters: {} } }] };
    expect(fitRequest(request)).toEqual(request);
  });

  it('fits long string content, text parts, tool descriptions and over-long call arguments', () => {
    const request = {
      messages: [
        { role: 'user', content: 'x'.repeat(70_000) },
        { role: 'tool', content: [{ type: 'text', text: 'y'.repeat(70_000) }] },
        { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'f', arguments: 'z'.repeat(20_000) } }] },
      ],
      tools: [{ type: 'function', function: { name: 'f', description: 'd'.repeat(9_000), parameters: {} } }],
    };
    const out = fitRequest(request) as any;
    expect(out.messages[0].content.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(out.messages[1].content[0].text.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(() => JSON.parse(out.messages[2].tool_calls[0].function.arguments)).not.toThrow();
    expect(out.tools[0].function.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
  });
});
