/** File paths pushed to GitHub — mirrors backend projectScaffold.ts */

const STATIC_PATHS = [
  'index.html',
  'styles.css',
  'script.js',
  'public/index.html',
  'vercel.json',
  '.gitignore',
  'README.md',
];

const CRM_EXTRA = [
  'src/app/layout.tsx',
  'src/app/globals.css',
  'src/app/page.tsx',
  'src/app/dashboard/page.tsx',
  'src/app/api/contacts/route.ts',
  'src/components/ContactsList.tsx',
  'src/components/DealsPipeline.tsx',
  'src/components/TasksBoard.tsx',
  'src/components/AnalyticsCharts.tsx',
  'package.json',
  'next.config.js',
];

function detectKind(prompt: string): 'crm' | 'static' {
  const t = prompt.toLowerCase();
  if (/\b(crm|contacts|deals pipeline|sales pipeline)\b/.test(t)) return 'crm';
  return 'static';
}

export function scaffoldPathsForPrompt(prompt: string): string[] {
  if (detectKind(prompt) === 'crm') return [...STATIC_PATHS, ...CRM_EXTRA];
  return STATIC_PATHS;
}
