import type { ProjectFile } from '../integrations/githubDeploy.js';
import { buildSupabaseProjectSql } from './supabaseProjectSql.js';
import { detectScaffoldFeatures } from './detectScaffold.js';
import { buildAgentFeatureFiles, buildCryptoFeatureFiles } from './featurePacks.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'xroga-app';
}

/**
 * Production-shaped Next.js App Router scaffold.
 * Env vars match Xroga vault → Vercel sync (OPENAI_*, SUPABASE_*, STRIPE_*, etc.).
 * Supabase data/auth/storage use the USER's project keys — never Xroga's platform DB.
 * Crypto + automation packs layer on when the prompt asks for them.
 */
export function buildNextjsScaffold(opts: {
  projectName: string;
  userPrompt?: string;
}): ProjectFile[] {
  const name = opts.projectName.trim() || 'Xroga App';
  const slug = slugify(name);
  const features = detectScaffoldFeatures(opts.userPrompt || '');
  const supabaseSql = buildSupabaseProjectSql({
    projectName: name,
    userPrompt: opts.userPrompt,
  });

  const vercelConfig: Record<string, unknown> = {
    framework: 'nextjs',
    buildCommand: 'npm run build',
    installCommand: 'npm install',
  };
  if (features.agent) {
    vercelConfig.crons = [{ path: '/api/cron/agent', schedule: '0 14 * * *' }];
  }

  const featureImports = [
    features.crypto ? `import { CryptoPrices } from '@/components/CryptoPrices';` : '',
    features.crypto ? `import { WalletConnectButton } from '@/components/WalletConnectButton';` : '',
    features.agent ? `import { AgentRunner } from '@/components/AgentRunner';` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const featureSections = [
    features.crypto
      ? `      <CryptoPrices />
      <WalletConnectButton />`
      : '',
    features.agent ? `      <AgentRunner />` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const base: ProjectFile[] = [
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: slug,
          version: '0.1.0',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
            lint: 'next lint',
          },
          dependencies: {
            next: '15.1.0',
            react: '^19.0.0',
            'react-dom': '^19.0.0',
            '@supabase/supabase-js': '^2.49.1',
            '@supabase/ssr': '^0.5.2',
          },
          devDependencies: {
            typescript: '^5.7.2',
            '@types/node': '^22.10.2',
            '@types/react': '^19.0.2',
            '@types/react-dom': '^19.0.2',
          },
        },
        null,
        2,
      ),
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2017',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            paths: { '@/*': ['./*'] },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2,
      ),
    },
    {
      path: 'next.config.ts',
      content: `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`,
    },
    {
      path: 'vercel.json',
      content: JSON.stringify(vercelConfig, null, 2),
    },
    {
      path: 'middleware.ts',
      content: `import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Refresh Supabase auth cookies on every request (user's project). */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
`,
    },
    {
      path: 'app/globals.css',
      content: `:root {
  --bg: #0b0f14;
  --fg: #f4f7fb;
  --muted: #9aa7b5;
  --card: #121821;
  --accent: #5b8cff;
  --border: rgba(255, 255, 255, 0.1);
}

* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: radial-gradient(1200px 600px at 10% -10%, #1a2740 0%, var(--bg) 55%);
  color: var(--fg);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
}
a { color: var(--accent); }
main { max-width: 960px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
.hero { display: grid; gap: 0.75rem; margin-bottom: 2rem; }
.hero h1 { font-size: clamp(2rem, 4vw, 3rem); margin: 0; letter-spacing: -0.03em; }
.hero p { margin: 0; color: var(--muted); line-height: 1.55; max-width: 42rem; }
.panel {
  background: color-mix(in srgb, var(--card) 92%, transparent);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 1.25rem;
  display: grid;
  gap: 0.85rem;
}
.row { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
button, .button {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 0.7rem 1.1rem;
  background: var(--accent);
  color: #061018;
  font-weight: 650;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
input {
  width: 100%;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(0,0,0,0.25);
  color: inherit;
}
`,
    },
    {
      path: 'app/layout.tsx',
      content: `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: ${JSON.stringify(name)},
  description: 'Built with Xroga AI — ships to your GitHub + Vercel; data on your Supabase.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    },
    {
      path: 'app/page.tsx',
      content: `${featureImports ? featureImports + '\n' : ''}import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Built with Xroga</p>
        <h1>${name.replace(/`/g, '')}</h1>
        <p>
          Live on your Vercel. Code on your GitHub. Auth, database, and storage use
          <strong> your Supabase project</strong> when connected in Xroga Integrations.
        </p>
        <div className="row">
          <Link className="button" href="/login">
            Sign in
          </Link>
          <a className="button" href="/api/health">
            Health
          </a>
        </div>
      </section>
      <section className="panel">
        <strong>Live features</strong>
        <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
          Connect Supabase (URL + anon + service role) and OpenAI/Stripe in Xroga
          Integrations — they sync into this Vercel project env and power{' '}
          <code>/api/*</code> routes. Prefer <strong>Ship setup → Authorize Supabase</strong> so
          Xroga applies schema automatically (or run{' '}
          <code>supabase/migrations/001_initial.sql</code> once).
        </p>
      </section>
${featureSections}
    </main>
  );
}
`,
    },
    {
      path: 'app/login/page.tsx',
      content: `export default function LoginPage() {
  return (
    <main>
      <section className="hero">
        <h1>Sign in</h1>
        <p>
          Magic link auth against <strong>your</strong> Supabase Auth
          (<code>NEXT_PUBLIC_SUPABASE_URL</code> from Xroga vault → Vercel).
        </p>
      </section>
      <form className="panel" action="/auth/sign-in" method="post">
        <label style={{ display: 'grid', gap: '0.4rem' }}>
          Email
          <input name="email" type="email" required placeholder="you@company.com" />
        </label>
        <div className="row">
          <button type="submit">Continue with magic link</button>
        </div>
      </form>
    </main>
  );
}
`,
    },
    {
      path: 'lib/supabase/client.ts',
      content: `import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createBrowserClient(url, key);
}
`,
    },
    {
      path: 'lib/supabase/server.ts',
      content: `import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Cookie-aware server client for the USER's Supabase project. */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase env — connect Supabase in Xroga Integrations → sync to Vercel');
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* called from a Server Component — middleware will refresh */
        }
      },
    },
  });
}

/** Service-role client for trusted server routes only (never import in client components). */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY — save service role in Xroga vault');
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
`,
    },
    {
      path: 'app/api/health/route.ts',
      content: `import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: ${JSON.stringify(name)},
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasSupabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    hasSupabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasStripe: Boolean(process.env.STRIPE_SECRET_KEY),
  });
}
`,
    },
    {
      path: 'app/api/chat/route.ts',
      content: `import { NextResponse } from 'next/server';

/**
 * Example live feature powered by vault → Vercel env.
 * Save OPENAI_API_KEY (or OPENROUTER_API_KEY) in Xroga Integrations.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const apiKey = openAiKey || openRouterKey;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'No AI key in Vercel env. Save openai or openrouter in Xroga Integrations, then redeploy.',
      },
      { status: 503 },
    );
  }

  const base = openAiKey ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1';
  const model = openAiKey ? 'gpt-4o-mini' : 'openai/gpt-4o-mini';

  const res = await fetch(\`\${base}/chat/completions\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${apiKey}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful product assistant.' },
        { role: 'user', content: message },
      ],
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err.slice(0, 300) }, { status: 502 });
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return NextResponse.json({
    reply: data.choices?.[0]?.message?.content ?? '',
  });
}
`,
    },
    {
      path: 'app/auth/callback/route.ts',
      content: `import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Supabase Auth callback — exchange code and persist cookies (user's project). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    try {
      const supabase = await createClient();
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      /* env may be missing until user syncs keys */
    }
  }
  return NextResponse.redirect(new URL('/', url.origin));
}
`,
    },
    {
      path: 'app/auth/sign-in/route.ts',
      content: `import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get('email') || '').trim();
  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const origin = new URL(request.url).origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: \`\${origin}/auth/callback\` },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.redirect(new URL('/login?sent=1', origin), 303);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          (err as Error).message ||
          'Supabase not configured — connect project URL + anon key in Xroga Integrations',
      },
      { status: 503 },
    );
  }
}
`,
    },
    {
      path: 'app/auth/sign-out/route.ts',
      content: `import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }
  return NextResponse.redirect(new URL('/', origin), 303);
}
`,
    },
    {
      path: '.env.example',
      content: `# Synced from Xroga Integrations → Vercel env (never commit real secrets)
# Data/auth/storage use YOUR Supabase project when these are set.
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=
OPENROUTER_API_KEY=
STRIPE_SECRET_KEY=
# Lemon Squeezy (subscriptions in THIS app — save in Xroga Integrations vault)
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_VARIANT_ID=
# Automation agent (optional)
AGENT_MODEL=gpt-4o-mini
AGENT_CRON_SECRET=
CRON_SECRET=
AGENT_CRON_GOAL=
`,
    },
    {
      path: 'app/api/checkout/route.ts',
      content: `import { NextResponse } from 'next/server';

/** Create a Lemon Squeezy checkout for YOUR store (keys from Vercel env via Xroga vault). */
export async function POST(request: Request) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID;
  if (!apiKey || !storeId || !variantId) {
    return NextResponse.json(
      { error: 'Lemon Squeezy not configured — save keys in Xroga Integrations' },
      { status: 503 },
    );
  }

  let email: string | undefined;
  let userId: string | undefined;
  try {
    const body = (await request.json()) as { email?: string; userId?: string };
    email = body.email;
    userId = body.userId;
  } catch {
    /* optional body */
  }

  const checkoutData: Record<string, unknown> = {
    custom: { user_id: userId || 'anonymous', app: '${slug}' },
  };
  if (email) checkoutData.email = email;

  const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: \`Bearer \${apiKey}\`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: { checkout_data: checkoutData },
        relationships: {
          store: { data: { type: 'stores', id: String(storeId) } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text.slice(0, 200) }, { status: 502 });
  }

  const data = (await res.json()) as { data?: { attributes?: { url?: string } } };
  return NextResponse.json({ checkoutUrl: data.data?.attributes?.url });
}
`,
    },
    {
      path: 'app/api/webhooks/lemon-squeezy/route.ts',
      content: `import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const raw = await request.text();
  const signature = request.headers.get('x-signature') || '';

  if (secret) {
    const digest = createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(digest, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  const event = JSON.parse(raw) as {
    meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  };
  // Upgrade the signed-in user in YOUR Supabase (profiles.plan) using meta.custom_data.user_id
  console.log('[lemon-webhook]', event.meta?.event_name, event.meta?.custom_data);
  return NextResponse.json({ received: true });
}
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

Built with **Xroga AI** — coding agent that pushes to your GitHub and deploys on your Vercel.

## What you get
- Next.js App Router UI + middleware session refresh
- \`/api/health\` and \`/api/chat\`
- Supabase auth (\`/login\`, \`/auth/*\`) against **your** project
- \`supabase/migrations/001_initial.sql\` — profiles, RLS, optional storage
- Lemon Squeezy checkout (\`/api/checkout\`) + webhook (\`/api/webhooks/lemon-squeezy\`)
${features.crypto ? '- Crypto pack: live \`/api/prices\` + wallet connect demo — see CRYPTO.md\n' : ''}${features.agent ? '- Automation pack: \`/api/agent/run\` + Vercel Cron — see AGENT.md\n' : ''}
## Ship
1. Authorize GitHub + Vercel in Xroga Ship setup
2. Authorize Supabase (create or pick your project) — Xroga applies schema + memory + storage
3. Optional: save Lemon Squeezy API key / store / variant / webhook secret in Xroga Integrations
4. Build in Workspace — Xroga pushes, syncs vault → Vercel env when possible, deploys
5. Later prompts update the **same** GitHub repo automatically (we remember it after first ship)

${opts.userPrompt ? `## Prompt\n\n${opts.userPrompt.slice(0, 800)}\n` : ''}
`,
    },
    ...supabaseSql,
  ];

  if (features.crypto) base.push(...buildCryptoFeatureFiles(slug));
  if (features.agent) base.push(...buildAgentFeatureFiles(slug));
  return base;
}
