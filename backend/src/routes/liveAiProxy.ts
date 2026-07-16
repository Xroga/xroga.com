/**
 * Authenticated live AI proxy — uses user's encrypted BYOK keys when present,
 * else free platform endpoints. Never returns raw API keys to the client.
 */

import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getUserProviderKey } from '../services/integrations/userProviderKeys.js';
import { getSecret } from '../config/envSecrets.js';
import { webSearch } from '../lib/webSearch.js';

const router = Router();

const rate = new Map<string, { n: number; reset: number }>();
function allow(userId: string, limit = 40): boolean {
  const now = Date.now();
  const row = rate.get(userId);
  if (!row || now > row.reset) {
    rate.set(userId, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (row.n >= limit) return false;
  row.n += 1;
  return true;
}

async function chatWithGroq(apiKey: string, messages: Array<{ role: string; content: string }>, system: string) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 1024,
      temperature: 0.5,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function chatWithOpenRouter(apiKey: string, messages: Array<{ role: string; content: string }>, system: string) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://xroga.com',
      'X-Title': 'Xroga Live AI',
    },
    body: JSON.stringify({
      model: 'openrouter/auto',
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function chatPollinations(messages: Array<{ role: string; content: string }>, system: string) {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const prompt = `${system ? system + '\n\n' : ''}${last}`.slice(0, 1800);
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`;
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  return (await res.text()).trim();
}

/** POST /api/integrations/live-ai/chat */
router.post('/live-ai/chat', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  if (!allow(userId)) {
    res.status(429).json({ error: 'Rate limit — try again in a minute' });
    return;
  }
  const { messages, system } = req.body as {
    messages?: Array<{ role: string; content: string }>;
    system?: string;
  };
  if (!Array.isArray(messages) || !messages.length) {
    res.status(400).json({ error: 'messages required' });
    return;
  }
  const sys = String(system || 'You are a helpful assistant.');
  const turns = messages.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 4000),
  }));

  try {
    const groqKey =
      (await getUserProviderKey(userId, 'groq')) || getSecret('GROQ_API_KEY') || null;
    if (groqKey) {
      const reply = await chatWithGroq(groqKey, turns, sys);
      res.json({ reply, provider: 'groq', freeTier: !!(await getUserProviderKey(userId, 'groq')) });
      return;
    }
    const orKey = await getUserProviderKey(userId, 'openrouter');
    if (orKey) {
      const reply = await chatWithOpenRouter(orKey, turns, sys);
      res.json({ reply, provider: 'openrouter', freeTier: true });
      return;
    }
    const reply = await chatPollinations(turns, sys);
    res.json({ reply, provider: 'pollinations', freeTier: true, note: 'No key — using free Pollinations. Paste a Groq key in Integrations for faster replies.' });
  } catch (err) {
    try {
      const reply = await chatPollinations(turns, sys);
      res.json({ reply, provider: 'pollinations', freeTier: true });
    } catch {
      res.status(502).json({ error: (err as Error).message || 'Live AI unavailable' });
    }
  }
});

/** POST /api/integrations/live-ai/search — free SearXNG (platform) */
router.post('/live-ai/search', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  if (!allow(userId, 30)) {
    res.status(429).json({ error: 'Rate limit — try again in a minute' });
    return;
  }
  const query = String((req.body as { query?: string }).query || '').trim();
  if (query.length < 2) {
    res.status(400).json({ error: 'query required' });
    return;
  }
  try {
    const results = await webSearch(query.slice(0, 200), { maxResults: 5 });
    res.json({
      results: results.map((r) => ({ title: r.title, url: r.url, snippet: r.content })),
      provider: 'searxng',
      free: true,
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
