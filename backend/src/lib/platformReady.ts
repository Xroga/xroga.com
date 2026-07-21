/**
 * Platform readiness — boolean checks only (never leak secret values).
 * Used by operators before inviting users to build.
 */

import { getSecret } from '../config/envSecrets.js';
import { vercelOAuthConfigured } from '../services/integrations/vercelAuth.js';
import { supabaseOAuthConfigured } from '../services/integrations/supabaseAuth.js';

export type ReadyCheck = {
  id: string;
  label: string;
  ok: boolean;
  required: boolean;
  hint?: string;
};

export function computePlatformReady(): {
  ready: boolean;
  requiredOk: number;
  requiredTotal: number;
  checks: ReadyCheck[];
} {
  const has = (key: string) => Boolean(getSecret(key) || process.env[key]?.trim());

  const checks: ReadyCheck[] = [
    {
      id: 'supabase_url',
      label: 'Supabase URL',
      ok: has('SUPABASE_URL'),
      required: true,
      hint: 'SUPABASE_URL',
    },
    {
      id: 'supabase_service',
      label: 'Supabase service role',
      ok: has('SUPABASE_SERVICE_ROLE_KEY'),
      required: true,
      hint: 'SUPABASE_SERVICE_ROLE_KEY',
    },
    {
      id: 'supabase_jwt',
      label: 'Supabase JWT (or service role)',
      ok: has('SUPABASE_JWT_SECRET') || has('SUPABASE_SERVICE_ROLE_KEY'),
      required: true,
    },
    {
      id: 'github_oauth',
      label: 'GitHub OAuth app',
      ok: has('GITHUB_CLIENT_ID') && has('GITHUB_CLIENT_SECRET'),
      required: true,
      hint: 'GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET',
    },
    {
      id: 'vercel_oauth',
      label: 'Vercel OAuth app',
      ok: vercelOAuthConfigured(),
      required: true,
      hint: 'VERCEL_CLIENT_ID + VERCEL_CLIENT_SECRET',
    },
    {
      id: 'supabase_oauth',
      label: 'Supabase OAuth (user projects)',
      ok: supabaseOAuthConfigured(),
      required: false,
      hint: 'Needed for one-click user Supabase connect',
    },
    {
      id: 'ai_openrouter',
      label: 'OpenRouter (DeepSeek)',
      ok: has('OPENROUTER_API_KEY'),
      required: true,
    },
    {
      id: 'ai_kimi',
      label: 'Kimi / Moonshot',
      ok: has('KIMI_API_KEY'),
      required: true,
    },
    {
      id: 'ai_glm',
      label: 'GLM / Zhipu',
      ok: has('GLM_API_KEY'),
      required: true,
    },
    {
      id: 'ai_grok',
      label: 'Grok / xAI',
      ok: has('GROK_API_KEY'),
      required: true,
    },
    {
      id: 'research',
      label: 'Research (Tavily or SearXNG)',
      ok: has('TAVILY_API_KEY') || Boolean(process.env.SEARXNG_URL?.trim()),
      required: false,
    },
    {
      id: 'billing',
      label: 'Lemon Squeezy billing',
      ok: has('LEMONSQUEEZY_API_KEY') && has('LEMONSQUEEZY_WEBHOOK_SECRET'),
      required: false,
      hint: 'Required before paid plans work',
    },
    {
      id: 'frontend_url',
      label: 'FRONTEND_URL',
      ok: has('FRONTEND_URL'),
      required: true,
    },
  ];

  const required = checks.filter((c) => c.required);
  const requiredOk = required.filter((c) => c.ok).length;
  return {
    ready: required.every((c) => c.ok),
    requiredOk,
    requiredTotal: required.length,
    checks,
  };
}
