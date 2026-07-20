/** File paths pushed to GitHub — mirrors backend projectScaffold.scaffoldFilePaths */

const STATIC_PATHS = [
  'index.html',
  'styles.css',
  'script.js',
  'vercel.json',
  'README.md',
];

const NEXT_PATHS = [
  'package.json',
  'app/page.tsx',
  'app/layout.tsx',
  'app/api/health/route.ts',
  'app/api/chat/route.ts',
  '.env.example',
  'README.md',
];

const EXPO_PATHS = [
  'package.json',
  'app.json',
  'app/index.tsx',
  'app/_layout.tsx',
  'index.html',
  'README.md',
  'PUBLISH.md',
];

const CHROME_PATHS = [
  'manifest.json',
  'background.js',
  'popup.html',
  'package.json',
  'PUBLISH.md',
  'README.md',
];

const ELECTRON_PATHS = [
  'package.json',
  'main.js',
  'renderer/index.html',
  'PUBLISH.md',
  'README.md',
];

function detectKind(
  prompt: string,
): 'chrome' | 'electron' | 'expo' | 'nextjs' | 'static' {
  const t = prompt.toLowerCase();
  if (/\b(chrome\s*extension|browser\s*extension|mv3|manifest\s*v3)\b/.test(t)) return 'chrome';
  if (/\b(electron|tauri|desktop\s*app)\b/.test(t) && !/\b(android|ios|expo)\b/.test(t)) {
    return 'electron';
  }
  if (/\b(android|ios|expo|react\s*native|mobile\s*app)\b/.test(t)) return 'expo';
  if (
    /\b(next\.?js|saas|dashboard|auth|supabase|full[- ]?stack|stripe)\b/.test(t) ||
    /\b(crypto|web3|wallet|agent|automation|cron)\b/.test(t)
  ) {
    return 'nextjs';
  }
  return 'static';
}

export function scaffoldPathsForPrompt(prompt: string): string[] {
  const kind = detectKind(prompt);
  if (kind === 'chrome') return CHROME_PATHS;
  if (kind === 'electron') return ELECTRON_PATHS;
  if (kind === 'expo') return EXPO_PATHS;
  if (kind === 'nextjs') return NEXT_PATHS;
  return STATIC_PATHS;
}
