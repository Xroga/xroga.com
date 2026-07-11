import { normalizeBuildFiles } from '../lib/normalizeBuildSource.js';
import type { ProjectFile } from './integrations/githubDeploy.js';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'xroga-app';
}

function fullHtmlDocument(html: string, css: string, js: string, title: string): string {
  const normalized = normalizeBuildFiles(html, css, js);
  if (/<!DOCTYPE/i.test(normalized.html)) return normalized.html;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
${normalized.html}
<script src="script.js"></script>
</body>
</html>`;
}

function detectKind(prompt: string): 'crm' | 'saas' | 'ecommerce' | 'website' {
  const t = prompt.toLowerCase();
  if (/\b(crm|contacts|deals pipeline|sales pipeline)\b/.test(t)) return 'crm';
  if (/\b(ecommerce|e-commerce|store|shop|cart|checkout)\b/.test(t)) return 'ecommerce';
  if (/\b(saas|dashboard|subscription|kanban|project management)\b/.test(t)) return 'saas';
  return 'website';
}

function packageJson(name: string, slug: string): string {
  return JSON.stringify(
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
        next: '^15.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        '@supabase/supabase-js': '^2.45.0',
        zod: '^3.23.0',
      },
      devDependencies: {
        typescript: '^5.5.0',
        tailwindcss: '^3.4.0',
        '@types/node': '^20.0.0',
        '@types/react': '^19.0.0',
      },
    },
    null,
    2
  );
}

const CRM_FILES: Array<{ path: string; content: (name: string) => string }> = [
  {
    path: 'src/app/layout.tsx',
    content: (name) => `import './globals.css';
export const metadata = { title: '${name}', description: 'Built with XROGA AI' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="min-h-screen bg-slate-50 text-slate-900">{children}</body></html>);
}`,
  },
  {
    path: 'src/app/globals.css',
    content: () => `@tailwind base;
@tailwind components;
@tailwind utilities;`,
  },
  {
    path: 'src/app/page.tsx',
    content: (name) => `import Link from 'next/link';
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">${name}</h1>
      <p className="text-slate-600">Corporate CRM — contacts, deals, tasks & analytics</p>
      <Link href="/dashboard" className="rounded-lg bg-blue-600 px-4 py-2 text-white">Open dashboard</Link>
    </main>
  );
}`,
  },
  {
    path: 'src/app/dashboard/page.tsx',
    content: () => `import { ContactsList } from '@/components/ContactsList';
import { DealsPipeline } from '@/components/DealsPipeline';
import { TasksBoard } from '@/components/TasksBoard';
import { AnalyticsCharts } from '@/components/AnalyticsCharts';
export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">CRM Dashboard</h1>
      <AnalyticsCharts />
      <div className="grid gap-6 lg:grid-cols-2">
        <ContactsList /><DealsPipeline />
      </div>
      <TasksBoard />
    </div>
  );
}`,
  },
  {
    path: 'src/app/api/contacts/route.ts',
    content: () => `import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ contacts: [] });
}
export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json({ contact: body }, { status: 201 });
}`,
  },
  {
    path: 'src/app/api/deals/route.ts',
    content: () => `import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ deals: [] });
}`,
  },
  {
    path: 'src/app/api/tasks/route.ts',
    content: () => `import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ tasks: [] });
}`,
  },
  {
    path: 'src/components/ContactsList.tsx',
    content: () => `'use client';
export function ContactsList() {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold">Contacts</h2>
      <ul className="space-y-2 text-sm text-slate-600"><li>Sample contact — Acme Corp</li></ul>
    </section>
  );
}`,
  },
  {
    path: 'src/components/DealsPipeline.tsx',
    content: () => `'use client';
export function DealsPipeline() {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold">Deals pipeline</h2>
      <div className="flex gap-2 text-xs"><span className="rounded bg-blue-100 px-2 py-1">Lead</span><span className="rounded bg-amber-100 px-2 py-1">Proposal</span><span className="rounded bg-emerald-100 px-2 py-1">Won</span></div>
    </section>
  );
}`,
  },
  {
    path: 'src/components/TasksBoard.tsx',
    content: () => `'use client';
export function TasksBoard() {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold">Tasks</h2>
      <p className="text-sm text-slate-600">Follow up with leads, send proposals, schedule demos.</p>
    </section>
  );
}`,
  },
  {
    path: 'src/components/AnalyticsCharts.tsx',
    content: () => `'use client';
export function AnalyticsCharts() {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      {['Revenue', 'Deals won', 'Tasks done'].map((l) => (
        <div key={l} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{l}</p><p className="text-2xl font-bold">—</p></div>
      ))}
    </section>
  );
}`,
  },
  {
    path: 'src/lib/supabase/client.ts',
    content: () => `import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);`,
  },
  {
    path: 'prisma/schema.prisma',
    content: () => `generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
model Contact { id String @id @default(cuid()) name String email String? company String? createdAt DateTime @default(now()) }
model Deal { id String @id @default(cuid()) title String stage String value Float? contactId String? createdAt DateTime @default(now()) }
model Task { id String @id @default(cuid()) title String done Boolean @default(false) createdAt DateTime @default(now()) }`,
  },
];

function genericAppFiles(name: string): Array<{ path: string; content: string }> {
  return [
    {
      path: 'src/app/layout.tsx',
      content: `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}`,
    },
    {
      path: 'src/app/page.tsx',
      content: `export default function Page() {
  return (<main className="p-8"><h1>${name}</h1><p>Built with XROGA AI</p></main>);
}`,
    },
    {
      path: 'src/lib/supabase/client.ts',
      content: `import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);`,
    },
  ];
}

/** Real multi-file project pushed to GitHub — preview HTML + Next.js scaffold. */
export function buildFullProjectFiles(opts: {
  html: string;
  css: string;
  js: string;
  projectName: string;
  userPrompt: string;
}): ProjectFile[] {
  const title = opts.projectName.slice(0, 80) || 'XROGA Build';
  const slug = slugify(title);
  const kind = detectKind(opts.userPrompt);
  const normalized = normalizeBuildFiles(opts.html, opts.css, opts.js);

  const files: ProjectFile[] = [
    { path: 'index.html', content: fullHtmlDocument(normalized.html, normalized.css, normalized.js, title) },
    { path: 'styles.css', content: normalized.css },
    { path: 'script.js', content: normalized.js },
    { path: 'public/preview/index.html', content: fullHtmlDocument(normalized.html, normalized.css, normalized.js, title) },
  ];

  const scaffold = kind === 'crm' ? CRM_FILES : genericAppFiles(title).map((f) => ({ path: f.path, content: () => f.content }));
  for (const f of scaffold) {
    files.push({ path: f.path, content: f.content(title) });
  }

  files.push(
    { path: 'package.json', content: packageJson(title, slug) },
    {
      path: 'tailwind.config.ts',
      content: `import type { Config } from 'tailwindcss';
const config: Config = { content: ['./src/**/*.{js,ts,jsx,tsx}'], theme: { extend: {} }, plugins: [] };
export default config;`,
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify(
        { compilerOptions: { target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], jsx: 'preserve', module: 'esnext', strict: true, paths: { '@/*': ['./src/*'] } }, include: ['**/*.ts', '**/*.tsx'], exclude: ['node_modules'] },
        null,
        2
      ),
    },
    {
      path: 'next.config.js',
      content: `/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
module.exports = nextConfig;`,
    },
    {
      path: '.env.example',
      content: `NEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_ANON_KEY=\nDATABASE_URL=\n`,
    },
    {
      path: 'README.md',
      content: `# ${title}\n\nBuilt with [XROGA AI](https://xroga.com).\n\n## Preview\nOpen \`index.html\` for the live static preview, or run \`npm run dev\` for the Next.js app.\n\n## Stack\nNext.js 15 · Supabase · Tailwind CSS\n`,
    }
  );

  return files;
}

export function scaffoldFilePaths(prompt: string): string[] {
  const kind = detectKind(prompt);
  const base = ['index.html', 'styles.css', 'script.js', 'public/preview/index.html'];
  const extra = kind === 'crm' ? CRM_FILES.map((f) => f.path) : genericAppFiles('App').map((f) => f.path);
  return [
    ...base,
    ...extra,
    'package.json',
    'tailwind.config.ts',
    'tsconfig.json',
    'next.config.js',
    '.env.example',
    'README.md',
  ];
}
