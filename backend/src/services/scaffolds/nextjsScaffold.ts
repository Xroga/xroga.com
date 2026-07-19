import type { ProjectFile } from '../integrations/githubDeploy.js';

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
 */
export function buildNextjsScaffold(opts: {
  projectName: string;
  userPrompt?: string;
}): ProjectFile[] {
  const name = opts.projectName.trim() || 'Xroga App';
  const slug = slugify(name);

  return [
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
      content: JSON.stringify(
        {
          framework: 'nextjs',
          buildCommand: 'npm run build',
          installCommand: 'npm install',
        },
        null,
        2,
      ),
    },
    {
      path: 'next-env.d.ts',
      content: `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`,
    },
    {
      path: 'app/layout.tsx',
      content: `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: ${JSON.stringify(name)},
  description: 'Built with Xroga AI — coding agent that ships to GitHub + Vercel',
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
      path: 'app/globals.css',
      content: `:root {
  --bg: #0b1220;
  --fg: #f4f7fb;
  --accent: #3d9cf0;
  --muted: #9db0c7;
  --panel: rgba(255, 255, 255, 0.05);
}

* { box-sizing: border-box; }
html, body {
  margin: 0;
  min-height: 100%;
  font-family: "Segoe UI", "Avenir Next", Georgia, sans-serif;
  color: var(--fg);
  background:
    radial-gradient(1200px 600px at 10% -10%, #1a3a5c 0%, transparent 55%),
    radial-gradient(900px 500px at 90% 0%, #12324a 0%, transparent 50%),
    var(--bg);
}
a { color: var(--accent); }
main { max-width: 920px; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
.hero h1 { font-size: clamp(2rem, 5vw, 3.4rem); letter-spacing: -0.03em; margin: 0 0 0.75rem; }
.hero p { color: var(--muted); font-size: 1.1rem; line-height: 1.6; max-width: 38rem; }
.panel {
  margin-top: 2rem;
  padding: 1.25rem 1.4rem;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 18px;
  background: var(--panel);
}
.row { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.25rem; }
button, .btn {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 0.7rem 1.15rem;
  font-weight: 650;
  cursor: pointer;
  background: var(--accent);
  color: #041018;
  text-decoration: none;
}
button.ghost, .btn.ghost {
  background: transparent;
  color: var(--fg);
  border: 1px solid rgba(255,255,255,0.2);
}
`,
    },
    {
      path: 'app/page.tsx',
      content: `import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <h1>${name.replace(/`/g, '')}</h1>
        <p>
          Shipped by Xroga AI — working code on your GitHub, live on your Vercel.
          API routes and auth read secrets from Vercel env (never hardcoded).
        </p>
        <div className="row">
          <Link className="btn" href="/login">Sign in</Link>
          <a className="btn ghost" href="/api/health">Health API</a>
        </div>
      </section>
      <section className="panel">
        <strong>Live features</strong>
        <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
          Connect Supabase + OpenAI (or Stripe) keys in Xroga Integrations — they sync into
          this Vercel project env and power <code>/api/*</code> routes.
        </p>
      </section>
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
          Wire Supabase Auth with <code>NEXT_PUBLIC_SUPABASE_URL</code> and
          <code> NEXT_PUBLIC_SUPABASE_ANON_KEY</code> from your Xroga vault.
        </p>
      </section>
      <form className="panel" action="/auth/sign-in" method="post">
        <label style={{ display: 'grid', gap: '0.4rem' }}>
          Email
          <input
            name="email"
            type="email"
            required
            style={{
              padding: '0.7rem 0.85rem',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.25)',
              color: 'inherit',
            }}
          />
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
      content: `import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/** Server-only client — uses service role when available, else anon. */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase env — sync keys from Xroga Integrations → Vercel');
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
    hasSupabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
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
import { createServerClient } from '@/lib/supabase/server';

/** Supabase Auth callback — exchange code for session when configured. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    try {
      const supabase = createServerClient();
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
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get('email') || '').trim();
  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
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
          'Supabase not configured — sync supabase + supabase_anon keys from Xroga',
      },
      { status: 503 },
    );
  }
}
`,
    },
    {
      path: '.env.example',
      content: `# Synced from Xroga Integrations → Vercel env (never commit real secrets)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=
OPENROUTER_API_KEY=
STRIPE_SECRET_KEY=
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

Built with **Xroga AI** — coding agent that pushes to your GitHub and deploys on your Vercel.

## What you get
- Next.js App Router UI
- \`/api/health\` and \`/api/chat\` (uses \`OPENAI_API_KEY\` / \`OPENROUTER_API_KEY\` from Vercel env)
- Supabase auth scaffolding (\`/login\`, \`/auth/*\`)

## Secrets
1. Save keys in Xroga → Integrations (openai, supabase, stripe, …)
2. Connect Vercel (Full Account PAT recommended for env write)
3. Redeploy — Xroga syncs vault → Vercel env (never into Git)

${opts.userPrompt ? `## Prompt\n\n${opts.userPrompt.slice(0, 800)}\n` : ''}
`,
    },
  ];
}
