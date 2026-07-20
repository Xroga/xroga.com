import type { ProjectFile } from '../integrations/githubDeploy.js';

/** Crypto / market + wallet demo files for Next.js scaffolds. */
export function buildCryptoFeatureFiles(slug: string): ProjectFile[] {
  return [
    {
      path: 'app/api/prices/route.ts',
      content: `import { NextResponse } from 'next/server';

/** Live market prices via CoinGecko (public API — no key required for basic quotes). */
const IDS = ['bitcoin', 'ethereum', 'solana'] as const;

export async function GET() {
  try {
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=' +
      IDS.join(',') +
      '&vs_currencies=usd&include_24hr_change=true';
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Price feed unavailable', status: res.status },
        { status: 502 },
      );
    }
    const data = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number }
    >;
    const prices = IDS.map((id) => ({
      id,
      usd: data[id]?.usd ?? null,
      change24h: data[id]?.usd_24h_change ?? null,
    }));
    return NextResponse.json({
      prices,
      disclaimer:
        'Market data only — not financial advice. Xroga does not custody funds or execute trades.',
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Price fetch failed' },
      { status: 502 },
    );
  }
}
`,
    },
    {
      path: 'lib/crypto/walletStub.ts',
      content: `/**
 * Wallet connect stub — UI + typed helpers only.
 * Real signing / custody / DeFi needs a wallet SDK + audits + compliance.
 * Xroga ships the product shell; you own on-chain risk.
 */

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'unavailable';

export interface WalletSession {
  status: WalletStatus;
  address: string | null;
  chainId: number | null;
  message: string;
}

export function initialWalletSession(): WalletSession {
  return {
    status: 'disconnected',
    address: null,
    chainId: null,
    message: 'Connect a browser wallet to continue (demo stub — no keys leave this device).',
  };
}

/** Demo-only connect: reads window.ethereum if present; never asks for seed phrases. */
export async function connectBrowserWallet(): Promise<WalletSession> {
  if (typeof window === 'undefined') {
    return {
      status: 'unavailable',
      address: null,
      chainId: null,
      message: 'Wallet connect runs in the browser.',
    };
  }
  const eth = (
    window as unknown as {
      ethereum?: { request: (args: { method: string }) => Promise<unknown> };
    }
  ).ethereum;
  if (!eth?.request) {
    return {
      status: 'unavailable',
      address: null,
      chainId: null,
      message: 'No browser wallet detected. Install MetaMask or similar to try the connect flow.',
    };
  }
  try {
    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
    const chainHex = (await eth.request({ method: 'eth_chainId' })) as string;
    const address = accounts[0] ?? null;
    const chainId = chainHex ? parseInt(chainHex, 16) : null;
    return {
      status: address ? 'connected' : 'disconnected',
      address,
      chainId,
      message: address
        ? 'Connected (read-only demo). Trading / signing is not enabled by this scaffold.'
        : 'No account returned.',
    };
  } catch (err) {
    return {
      status: 'disconnected',
      address: null,
      chainId: null,
      message: err instanceof Error ? err.message : 'User rejected connect',
    };
  }
}
`,
    },
    {
      path: 'components/CryptoPrices.tsx',
      content: `'use client';

import { useEffect, useState } from 'react';

type PriceRow = { id: string; usd: number | null; change24h: number | null };

export function CryptoPrices() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/prices');
        const data = (await res.json()) as {
          prices?: PriceRow[];
          disclaimer?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || 'Failed to load prices');
          return;
        }
        setPrices(data.prices || []);
        setDisclaimer(data.disclaimer || '');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Market snapshot</h2>
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
        {prices.map((p) => (
          <li
            key={p.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid #e5e7eb',
              textTransform: 'capitalize',
            }}
          >
            <span>{p.id}</span>
            <span>
              {p.usd != null ? \`$\${p.usd.toLocaleString()}\` : '—'}
              {p.change24h != null ? (
                <span style={{ marginLeft: 8, color: p.change24h >= 0 ? '#15803d' : '#b91c1c' }}>
                  {p.change24h.toFixed(2)}%
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {disclaimer ? (
        <p style={{ fontSize: 12, color: '#6b7280', maxWidth: 480 }}>{disclaimer}</p>
      ) : null}
    </section>
  );
}
`,
    },
    {
      path: 'components/WalletConnectButton.tsx',
      content: `'use client';

import { useState } from 'react';
import {
  connectBrowserWallet,
  initialWalletSession,
  type WalletSession,
} from '@/lib/crypto/walletStub';

export function WalletConnectButton() {
  const [session, setSession] = useState<WalletSession>(initialWalletSession);

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={async () => {
          setSession({ ...session, status: 'connecting', message: 'Requesting wallet…' });
          setSession(await connectBrowserWallet());
        }}
        style={{
          padding: '10px 16px',
          borderRadius: 8,
          border: '1px solid #111',
          background: '#111',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        {session.status === 'connected'
          ? \`\${session.address?.slice(0, 6)}…\${session.address?.slice(-4)}\`
          : session.status === 'connecting'
            ? 'Connecting…'
            : 'Connect wallet (demo)'}
      </button>
      <p style={{ fontSize: 13, color: '#4b5563', marginTop: 8, maxWidth: 420 }}>{session.message}</p>
    </div>
  );
}
`,
    },
    {
      path: 'CRYPTO.md',
      content: `# Crypto / Web3 — what Xroga ships vs what you own

This scaffold gives you a **working product shell**:

- \`/api/prices\` — live CoinGecko quotes (no API key for basic usage)
- Wallet connect **demo** (\`lib/crypto/walletStub.ts\`) — browser \`ethereum\` only
- Honest UI copy so users are not misled

## What this is NOT

- Not a custodian, exchange, or DeFi protocol
- Not audited smart contracts, bridging, or KYC/AML
- Not financial advice

## To go further (you + counsel)

1. Pick chain(s) and a wallet SDK (wagmi / RainbowKit / WalletConnect)
2. Legal + compliance for your jurisdiction before taking deposits
3. Security review before any signing / spend path
4. Keep secrets in Xroga Integrations → synced to **your** Vercel env

Built for **${slug}** by Xroga AI.
`,
    },
  ];
}

/** Automation agent runner + cron + UI for Next.js scaffolds. */
export function buildAgentFeatureFiles(slug: string): ProjectFile[] {
  return [
    {
      path: 'lib/agent/runner.ts',
      content: `/**
 * Automation agent runner — real control flow, honest scope.
 * Runs on YOUR Vercel with YOUR OpenAI key from env.
 * Scaffolded worker — not a guaranteed always-on ops team.
 */

export type AgentStep = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
};

export type AgentRunResult = {
  ok: boolean;
  steps: AgentStep[];
  output: string;
  model?: string;
  disclaimer: string;
};

export type AgentRunInput = {
  goal: string;
  context?: string;
};

async function callLlm(goal: string, context?: string): Promise<{ text: string; model: string }> {
  const key = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!key) {
    return {
      text:
        'No OPENAI_API_KEY / OPENROUTER_API_KEY in env. Save it in Xroga Integrations so Vercel can run this agent.',
      model: 'none',
    };
  }
  const base =
    process.env.OPENAI_BASE_URL ||
    (process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');
  const model = process.env.AGENT_MODEL || 'gpt-4o-mini';
  const res = await fetch(\`\${base}/chat/completions\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${key}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a focused automation agent. Produce a short actionable plan and result summary. Never claim you moved money or changed production systems unless tools prove it.',
        },
        {
          role: 'user',
          content: context ? \`Goal: \${goal}\\n\\nContext:\\n\${context}\` : \`Goal: \${goal}\`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(\`LLM error \${res.status}: \${errText.slice(0, 200)}\`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return {
    text: data.choices?.[0]?.message?.content?.trim() || '(empty)',
    model,
  };
}

/** Run one agent cycle: plan → LLM → summarize. Default: no side effects beyond LLM. */
export async function runAgentOnce(input: AgentRunInput): Promise<AgentRunResult> {
  const steps: AgentStep[] = [
    { id: 'validate', label: 'Validate goal', status: 'pending' },
    { id: 'think', label: 'Reason with LLM', status: 'pending' },
    { id: 'summarize', label: 'Summarize result', status: 'pending' },
  ];

  const mark = (id: string, status: AgentStep['status'], detail?: string) => {
    const s = steps.find((x) => x.id === id);
    if (s) {
      s.status = status;
      s.detail = detail;
    }
  };

  const disclaimer =
    'Scaffold agent: one-shot reasoning on your infra. Always-on ops, payments, and crypto execution need extra wiring + monitoring you own.';

  const goal = (input.goal || '').trim();
  if (!goal) {
    mark('validate', 'failed', 'Empty goal');
    return { ok: false, steps, output: 'Provide a goal.', disclaimer };
  }
  mark('validate', 'done', goal.slice(0, 120));

  mark('think', 'running');
  try {
    const { text, model } = await callLlm(goal, input.context);
    mark('think', 'done', model);
    mark('summarize', 'done');
    return { ok: true, steps, output: text, model, disclaimer };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    mark('think', 'failed', msg);
    mark('summarize', 'failed');
    return { ok: false, steps, output: msg, disclaimer };
  }
}
`,
    },
    {
      path: 'app/api/agent/run/route.ts',
      content: `import { NextResponse } from 'next/server';
import { runAgentOnce } from '@/lib/agent/runner';

/** Manual or Zapier-triggered agent run. POST { goal, context? } */
export async function POST(request: Request) {
  let body: { goal?: string; context?: string } = {};
  try {
    body = (await request.json()) as { goal?: string; context?: string };
  } catch {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
  }

  const secret = process.env.AGENT_CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== \`Bearer \${secret}\`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = await runAgentOnce({
    goal: body.goal || '',
    context: body.context,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/agent/run',
    method: 'POST',
    hint: 'Send { goal } — optional AGENT_CRON_SECRET bearer auth',
  });
}
`,
    },
    {
      path: 'app/api/cron/agent/route.ts',
      content: `import { NextResponse } from 'next/server';
import { runAgentOnce } from '@/lib/agent/runner';

/** Vercel Cron entry — schedule in vercel.json. */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET || process.env.AGENT_CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== \`Bearer \${cronSecret}\`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const goal =
    process.env.AGENT_CRON_GOAL ||
    'Check health of this app and summarize any obvious follow-ups for the operator.';

  const result = await runAgentOnce({
    goal,
    context: \`Scheduled run for ${slug} at \${new Date().toISOString()}\`,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
`,
    },
    {
      path: 'components/AgentRunner.tsx',
      content: `'use client';

import { useState } from 'react';

type Step = { id: string; label: string; status: string; detail?: string };

export function AgentRunner() {
  const [goal, setGoal] = useState('Summarize what this product should do next for users');
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [disclaimer, setDisclaimer] = useState('');

  async function run() {
    setBusy(true);
    setOutput('');
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      const data = (await res.json()) as {
        output?: string;
        steps?: Step[];
        disclaimer?: string;
        error?: string;
      };
      setSteps(data.steps || []);
      setOutput(data.output || data.error || '');
      setDisclaimer(data.disclaimer || '');
    } catch (e) {
      setOutput(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Automation agent</h2>
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        rows={3}
        style={{ width: '100%', maxWidth: 520, marginTop: 8, padding: 10, borderRadius: 8 }}
      />
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid #111',
            background: busy ? '#9ca3af' : '#111',
            color: '#fff',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Running…' : 'Run agent'}
        </button>
      </div>
      {steps.length ? (
        <ol style={{ fontSize: 13, color: '#374151', marginTop: 12 }}>
          {steps.map((s) => (
            <li key={s.id}>
              {s.label}: <strong>{s.status}</strong>
              {s.detail ? \` — \${s.detail}\` : ''}
            </li>
          ))}
        </ol>
      ) : null}
      {output ? (
        <pre
          style={{
            marginTop: 12,
            padding: 12,
            background: '#f9fafb',
            borderRadius: 8,
            whiteSpace: 'pre-wrap',
            maxWidth: 560,
            fontSize: 13,
          }}
        >
          {output}
        </pre>
      ) : null}
      {disclaimer ? (
        <p style={{ fontSize: 12, color: '#6b7280', maxWidth: 520, marginTop: 8 }}>{disclaimer}</p>
      ) : null}
    </section>
  );
}
`,
    },
    {
      path: 'AGENT.md',
      content: `# Automation agents — guide

Xroga scaffolds a **real agent loop** on your stack:

| Piece | Path | Role |
|-------|------|------|
| Runner | \`lib/agent/runner.ts\` | Validate → LLM → summarize |
| Manual API | \`POST /api/agent/run\` | Trigger from UI or Zapier |
| Cron | \`GET /api/cron/agent\` | Vercel Cron schedule |
| UI | \`components/AgentRunner.tsx\` | One-click demo run |

## Setup (easy)

1. Authorize GitHub + Vercel in Xroga
2. Save \`OPENAI_API_KEY\` (or OpenRouter) in Integrations — synced to Vercel when possible
3. Optional: \`AGENT_CRON_SECRET\` / \`CRON_SECRET\` + \`AGENT_CRON_GOAL\`
4. Ship — then open the live site and click **Run agent**

## Honesty

- Scaffold ≠ always-on ops team. Cron needs a Vercel plan that supports Cron (or an external scheduler).
- Agents do not auto-trade crypto, send emails, or change other products unless **you** add those tools.
- For production: add logging, retries, human approval for irreversible actions.

Project: **${slug}**
`,
    },
  ];
}
