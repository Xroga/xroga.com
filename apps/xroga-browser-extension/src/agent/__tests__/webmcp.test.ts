import { describe, expect, it } from 'vitest';
import { WEBMCP_HOOK_SOURCE, WEBMCP_UNHOOK_SOURCE } from '../../browser-control/core/webmcp-hook';
import { WEBMCP_TOOL, describeCallResult, describeListing, describeSchema } from '../webmcp';

interface FakeTool { name: string; description?: string; execute: (input: unknown) => Promise<unknown>; annotations?: { readOnlyHint?: boolean } }
interface Hooked { tools: Map<string, FakeTool>; native: boolean; registered: number }

function page(nativeContext: boolean) {
  const win: Record<string, unknown> = {};
  const nav: Record<string, unknown> = {};
  const native: FakeTool[] = [];
  if (nativeContext) nav.modelContext = { registerTool: (t: FakeTool) => void native.push(t), unregisterTool: () => undefined, provideContext: () => undefined, clearContext: () => undefined };
  const doc: Record<string, unknown> = {};
  new Function('window', 'navigator', 'document', WEBMCP_HOOK_SOURCE)(win, nav, doc);
  return { win, nav, doc, native };
}

describe('webmcp hook', () => {
  it('supplies a modelContext where the browser has none, and keeps what a page registers', async () => {
    const { win, nav, doc } = page(false);
    const mc = nav.modelContext as { registerTool(t: FakeTool): unknown; unregisterTool(n: string): void; provideContext(c: { tools: FakeTool[] }): void; clearContext(): void };
    expect(mc).toBeDefined();
    // a page written for an earlier draft looks on document and window: the same object is there
    expect(doc.modelContext).toBe(mc);
    expect(win.modelContext).toBe(mc);
    const state = win.__xrogaWebMcp as Hooked;
    expect(state.native).toBe(false);
    mc.registerTool({ name: 'search', description: 'find', execute: async () => 'x', annotations: { readOnlyHint: true } });
    mc.registerTool({ name: 'broken' } as unknown as FakeTool); // no execute: ignored
    expect([...state.tools.keys()]).toEqual(['search']);
    mc.unregisterTool('search');
    expect(state.tools.size).toBe(0);
    mc.provideContext({ tools: [{ name: 'a', execute: async () => 1 }, { name: 'b', execute: async () => 2 }] });
    expect([...state.tools.keys()]).toEqual(['a', 'b']);
    mc.clearContext();
    expect(state.tools.size).toBe(0);
    expect(state.registered).toBe(3);
  });

  it('wraps the browser\'s own modelContext and still passes every call through', () => {
    const { win, nav, native } = page(true);
    const mc = nav.modelContext as { registerTool(t: FakeTool): unknown };
    const state = win.__xrogaWebMcp as Hooked;
    expect(state.native).toBe(true);
    const tool = { name: 'cart', description: 'add', execute: async () => 'ok' };
    mc.registerTool(tool);
    expect(native).toEqual([tool]);
    expect(state.tools.get('cart')).toBe(tool);
  });

  it('is installed once per document and can be taken out', () => {
    const win: Record<string, unknown> = {};
    const nav: Record<string, unknown> = {};
    const doc: Record<string, unknown> = {};
    const run = (src: string) => new Function('window', 'navigator', 'document', src)(win, nav, doc);
    run(WEBMCP_HOOK_SOURCE);
    const first = win.__xrogaWebMcp;
    run(WEBMCP_HOOK_SOURCE);
    expect(win.__xrogaWebMcp).toBe(first);
    run(WEBMCP_UNHOOK_SOURCE);
    expect(win.__xrogaWebMcp).toBeUndefined();
    expect(nav.modelContext).toBeUndefined();
  });
});

describe('webmcp text', () => {
  it('describes arguments, listings and results in a few plain lines', () => {
    expect(describeSchema({ type: 'object', properties: { query: { type: 'string', description: 'what to find' }, limit: { type: 'number' }, sort: { type: 'string', enum: ['new', 'old'] } }, required: ['query'] })).toBe('query string (what to find); limit? number; sort? string: new|old');
    expect(describeSchema(null)).toBe('no arguments');
    const listing = describeListing({ hooked: true, native: true, seen: 2, tools: [{ name: 'search', description: 'Find   flights', readOnly: true, schema: { properties: { to: { type: 'string' } }, required: ['to'] } }, { name: 'book', description: 'Book it', readOnly: false }] });
    expect(listing).toContain('2 tools offered by the page');
    expect(listing).toContain('- search [read-only]: Find flights | arguments: to string');
    expect(listing).toContain('- book [may change data]');
    expect(describeListing({ hooked: true, native: false, seen: 0, tools: [] })).toContain('registered no tools');
    expect(describeListing({ hooked: false, native: false, seen: 0, tools: [] })).toContain('reload true');
  });

  it('reads WebMCP results, plain values, errors and long text', () => {
    expect(describeCallResult({ content: [{ type: 'text', text: 'three flights' }, { type: 'image' }] })).toBe('three flights\n[image]');
    expect(describeCallResult({ content: [{ type: 'text', text: 'no seats' }], isError: true })).toBe("the page's tool reported an error: no seats");
    expect(describeCallResult({ total: 3 })).toBe('{"total":3}');
    expect(describeCallResult('plain')).toBe('plain');
    expect(describeCallResult(null)).toBe('null');
    expect(describeCallResult('x'.repeat(50), 10)).toContain('(40 more characters)');
  });

  it('is a reading-group tool needing only an action', () => {
    expect(WEBMCP_TOOL.name).toBe('webmcp');
    expect((WEBMCP_TOOL.parameters as { required: string[] }).required).toEqual(['action']);
  });
});
