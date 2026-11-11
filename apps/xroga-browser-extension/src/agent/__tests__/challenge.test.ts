import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { activeBranch, appendEntry, createConversation } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { challengeNote, detectChallenge } from '../challenge';
import { runSubagents } from '../subagents';
import { FakeHost, FakeLayer, ok } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('bot challenges and refusals', () => {
  it.each([
    [{ title: 'Just a moment...', text: 'Checking your browser before accessing example.com' }, 'Cloudflare', 'wait'],
    [{ title: 'Attention Required! | Cloudflare', text: 'Sorry, you have been blocked. You are unable to access example.com' }, 'Cloudflare', 'block'],
    [{ title: 'example.com', text: 'Verify you are human by completing the action below.' }, 'Cloudflare', 'person'],
    [{ title: 'https://www.google.com/search?q=x', text: "Our systems have detected unusual traffic from your computer network. This page checks to see if it's really you sending the requests, and not a robot." }, 'Google', 'person'],
    [{ title: 'DuckDuckGo', text: 'Unfortunately, bots use DuckDuckGo too. Please complete the following challenge. Select all squares containing a duck:' }, 'DuckDuckGo', 'person'],
    [{ title: 'Access Denied', text: 'Request unsuccessful. Incapsula incident ID: 1234-5678' }, 'Imperva', 'block'],
    [{ title: 'Please verify', text: 'Press & Hold to confirm you are a human' }, 'PerimeterX', 'person'],
    [{ title: 'x', text: "Please verify that you're not a robot. AWS WAF" }, 'AWS WAF', 'person'],
  ])('recognises %j', (page, vendor, kind) => {
    expect(detectChallenge(page)).toMatchObject({ vendor, kind });
  });

  it('does not mistake an article, a shop or a short normal page for a challenge', () => {
    const article = 'How to build a captcha: an essay about verify you are human flows and the history of bots. '.repeat(120);
    expect(detectChallenge({ title: 'A history of CAPTCHA', text: article })).toBeNull();
    expect(detectChallenge({ title: 'Laptops', text: 'Best laptops 2026. Add to cart. Free delivery. Reviews and prices.' })).toBeNull();
    expect(detectChallenge({ title: 'Example Domain', text: 'This domain is for use in illustrative examples in documents.' })).toBeNull();
    expect(detectChallenge({})).toBeNull();
  });

  it('tells the agent what to do for each kind, and never to solve a person check', () => {
    expect(challengeNote({ vendor: 'Cloudflare', kind: 'wait', signal: 'x' })).toContain('read the page once more');
    const person = challengeNote({ vendor: 'reCAPTCHA', kind: 'person', signal: 'x' });
    expect(person).toContain('ask_user');
    expect(person).toContain('Do not try to solve');
    expect(challengeNote({ vendor: 'Akamai', kind: 'block', signal: 'x' })).toContain('different source');
  });
});

describe('where it is told', () => {
  it('adds the note to a tool result that shows a bot check, in the run', async () => {
    const c = await createConversation({ mode: 'ask' });
    await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Read https://shop.example/page' }] } });
    const layer = new FakeLayer({ read: () => ok('read · tab 1 · «Just a moment...» · 80 characters\nChecking your browser before accessing shop.example') });
    const scripted = new ScriptedModel([
      { toolCalls: [{ name: 'read', input: {}, id: 'r1' }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'partial', summary: 'Blocked.' }, id: 'd' }] },
    ]);
    const loop = new AgentLoop({
      conversationId: c.id, runId: 'r1',
      model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
      system: 'sys', tools: toolsForRun({ disabled: ['hover'], vision: false }),
      layer, host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap: 5,
    });
    await loop.run();
    const text = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).map(p => ('text' in p ? p.text : '')).join('\n');
    expect(text).toContain('interstitial');
    expect(text).toContain('Cloudflare');
  });

  it('reports a blocked page as blocked in a delegated read, and still returns the others', async () => {
    let next = 10;
    const open = new Map<number, string>();
    const layer = new FakeLayer({
      tabs: args => { if (args.action !== 'open') return ok('ok'); const id = next++; open.set(id, String(args.url)); return ok('opened', { data: { opened: id } as never }); },
      read: args => {
        const url = open.get(Number(args.tabId))!;
        return url.includes('blocked')
          ? ok('read · tab 1 · «Attention Required! | Cloudflare» · 90 characters\n<<<page-content 000000000000>>>\nSorry, you have been blocked.\n<<<end-page-content 000000000000>>>')
          : ok(`read · tab 1 · «Fine» · 20 characters\n<<<page-content 000000000000>>>\nReal text of ${url}\n<<<end-page-content 000000000000>>>`);
      },
    });
    const r = await runSubagents({ layer, signal: new AbortController().signal }, [{ url: 'https://blocked.example' }, { url: 'https://fine.example' }]);
    expect(r.text).toContain('blocked the visit');
    expect(r.text).toContain('Real text of https://fine.example');
  });
});
