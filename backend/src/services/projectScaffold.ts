import { normalizeBuildFiles } from '../lib/normalizeBuildSource.js';
import { buildInlinePreviewDocument } from '../lib/landingPreview.js';
import { vercelStaticSiteJson } from '../lib/vercelStaticConfig.js';
import {
  ensureLiveAiScriptTag,
  liveAiProjectFiles,
  mergeLiveAiIntoJs,
  needsLiveAiRuntime,
} from '../lib/liveAiRuntime.js';
import type { ProjectFile } from './integrations/githubDeploy.js';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'xroga-app';
}

export type ProjectScaffoldKind = 'static' | 'crm' | 'saas';

function detectKind(prompt: string): ProjectScaffoldKind {
  const t = prompt.toLowerCase();
  if (/\b(crm|contacts|deals pipeline|sales pipeline)\b/.test(t)) return 'crm';
  if (/\b(saas|dashboard|subscription|kanban|project management|next\.?js app)\b/.test(t)) return 'saas';
  return 'static';
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
];

function staticSiteFiles(opts: {
  html: string;
  css: string;
  js: string;
  projectName: string;
  userPrompt?: string;
}): ProjectFile[] {
  const title = opts.projectName.slice(0, 80) || 'XROGA Build';
  const prompt = opts.userPrompt ?? '';
  const jsWithLive = mergeLiveAiIntoJs(opts.js, prompt);
  const htmlWithTag = needsLiveAiRuntime(prompt) ? ensureLiveAiScriptTag(opts.html) : opts.html;
  const normalized = normalizeBuildFiles(htmlWithTag, opts.css, jsWithLive);
  const livePreview = buildInlinePreviewDocument(normalized.html, normalized.css, normalized.js);
  const liveExtras = liveAiProjectFiles(prompt);

  return [
    { path: 'index.html', content: livePreview },
    { path: 'styles.css', content: normalized.css },
    { path: 'script.js', content: normalized.js },
    { path: 'public/index.html', content: livePreview },
    { path: 'vercel.json', content: vercelStaticSiteJson() },
    {
      path: '.gitignore',
      content: 'node_modules/\n.vercel/\n.env\n.env.local\n',
    },
    {
      path: 'README.md',
      content: `# ${title}

[![Built with XROGA AI](https://xroga.com/icon.png)](https://xroga.com)

Built with [XROGA AI](https://xroga.com) — Black Hole V∞.

## Live preview
\`index.html\` is the exact site XROGA generated — same file Vercel deploys to your account.

## Structure
\`\`\`
index.html    ← live site (CSS/JS inlined — matches sandbox preview)
styles.css    ← source for AI updates
script.js     ← source for AI updates
vercel.json   ← static deploy config (no build step)
\`\`\`

## Deploy
Connect Vercel in XROGA — deploys to **your** Vercel account and domain.
`,
    },
    // Keep runtime helpers; never include *.md marketing docs (AI_LIVE.md etc.)
    ...liveExtras.filter((f) => !/\.md$/i.test(f.path) && !/^AI_LIVE/i.test(f.path)),
  ];
}

function nextAppScaffold(title: string, slug: string, kind: ProjectScaffoldKind): ProjectFile[] {
  const files: ProjectFile[] = [];
  const scaffold = kind === 'crm' ? CRM_FILES : [];
  for (const f of scaffold) {
    files.push({ path: f.path, content: f.content(title) });
  }
  files.push(
    { path: 'package.json', content: packageJson(title, slug) },
    {
      path: 'vercel.json',
      content: JSON.stringify({ framework: 'nextjs', buildCommand: 'npm run build', installCommand: 'npm install' }, null, 2),
    },
    {
      path: 'next.config.js',
      content: `/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
module.exports = nextConfig;`,
    },
    {
      path: 'README.md',
      content: `# ${title}\n\nNext.js app scaffold + static preview in \`index.html\`.\n`,
    }
  );
  return files;
}

/** GitHub + Vercel project files — static sites match sandbox preview exactly. */
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

  if (kind === 'static') {
    return staticSiteFiles({
      html: opts.html,
      css: opts.css,
      js: opts.js,
      projectName: title,
      userPrompt: opts.userPrompt,
    });
  }

  const staticBase = staticSiteFiles({
    html: opts.html,
    css: opts.css,
    js: opts.js,
    projectName: title,
    userPrompt: opts.userPrompt,
  });
  return [...staticBase, ...nextAppScaffold(title, slug, kind)];
}

export function scaffoldFilePaths(prompt: string): string[] {
  const kind = detectKind(prompt);
  const staticPaths = [
    'index.html',
    'styles.css',
    'script.js',
    'public/index.html',
    'vercel.json',
    '.gitignore',
    'README.md',
  ];
  if (kind === 'static') return staticPaths;
  const extra =
    kind === 'crm'
      ? CRM_FILES.map((f) => f.path)
      : [];
  return [...staticPaths, ...extra, 'package.json', 'next.config.js'];
}
