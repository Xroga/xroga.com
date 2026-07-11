/** File paths pushed to GitHub — mirrors backend projectScaffold.ts */

const CRM_PATHS = [
  'index.html',
  'styles.css',
  'script.js',
  'public/preview/index.html',
  'src/app/layout.tsx',
  'src/app/globals.css',
  'src/app/page.tsx',
  'src/app/dashboard/page.tsx',
  'src/app/api/contacts/route.ts',
  'src/app/api/deals/route.ts',
  'src/app/api/tasks/route.ts',
  'src/components/ContactsList.tsx',
  'src/components/DealsPipeline.tsx',
  'src/components/TasksBoard.tsx',
  'src/components/AnalyticsCharts.tsx',
  'src/lib/supabase/client.ts',
  'prisma/schema.prisma',
  'package.json',
  'tailwind.config.ts',
  'tsconfig.json',
  'next.config.js',
  '.env.example',
  'README.md',
];

const GENERIC_PATHS = [
  'index.html',
  'styles.css',
  'script.js',
  'public/preview/index.html',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/lib/supabase/client.ts',
  'package.json',
  'tailwind.config.ts',
  'tsconfig.json',
  'next.config.js',
  '.env.example',
  'README.md',
];

function detectKind(prompt: string): 'crm' | 'generic' {
  const t = prompt.toLowerCase();
  if (/\b(crm|contacts|deals pipeline|sales pipeline)\b/.test(t)) return 'crm';
  return 'generic';
}

export function scaffoldPathsForPrompt(prompt: string): string[] {
  return detectKind(prompt) === 'crm' ? CRM_PATHS : GENERIC_PATHS;
}
