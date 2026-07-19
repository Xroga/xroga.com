import type { ProjectFile } from './patches.js';

export interface StaticValidateResult {
  ok: boolean;
  issues: string[];
  fixHints: string[];
  kind: 'static' | 'nextjs' | 'expo' | 'unknown';
}

function has(files: ProjectFile[], path: string): boolean {
  return files.some((f) => f.path === path || f.path.endsWith(`/${path}`));
}

function read(files: ProjectFile[], path: string): string {
  return files.find((f) => f.path === path)?.content ?? '';
}

/**
 * Structural compile-ish checks without running npm (safe on API hosts).
 * Catches missing entrypoints, broken package.json, empty critical files.
 */
export function staticValidateProject(files: ProjectFile[]): StaticValidateResult {
  const issues: string[] = [];
  const fixHints: string[] = [];
  const pkgRaw = read(files, 'package.json');
  let kind: StaticValidateResult['kind'] = 'static';

  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as {
        dependencies?: Record<string, string>;
        main?: string;
        scripts?: Record<string, string>;
      };
      const deps = { ...(pkg.dependencies || {}) };
      if (deps.next) {
        kind = 'nextjs';
        if (!has(files, 'app/page.tsx') && !has(files, 'pages/index.tsx') && !has(files, 'app/page.jsx')) {
          issues.push('Next.js project missing app/page.tsx (or pages/index.tsx)');
          fixHints.push('Add app/page.tsx as the home route');
        }
        if (!has(files, 'app/layout.tsx') && !has(files, 'app/layout.jsx')) {
          issues.push('Next.js App Router missing app/layout.tsx');
          fixHints.push('Add app/layout.tsx wrapping children');
        }
        if (!pkg.scripts?.build) {
          issues.push('package.json missing "build" script');
          fixHints.push('Add "build": "next build"');
        }
      } else if (deps.expo || deps['react-native']) {
        kind = 'expo';
        if (!has(files, 'app.json') && !has(files, 'app.config.js')) {
          issues.push('Expo project missing app.json');
          fixHints.push('Add app.json with ios/android bundle ids');
        }
        if (!has(files, 'app/index.tsx') && !has(files, 'App.tsx') && !has(files, 'App.js')) {
          issues.push('Expo project missing app/index.tsx or App.tsx');
          fixHints.push('Add app/index.tsx entry screen');
        }
      } else {
        kind = 'unknown';
      }
    } catch {
      issues.push('package.json is not valid JSON');
      fixHints.push('Fix package.json syntax');
      kind = 'unknown';
    }
  } else {
    if (!has(files, 'index.html')) {
      issues.push('No index.html and no package.json — nothing to preview');
      fixHints.push('Add index.html or a framework package.json');
    }
  }

  for (const f of files) {
    if (!f.content?.trim() && /\.(tsx?|jsx?|html|css)$/i.test(f.path)) {
      issues.push(`Empty file: ${f.path}`);
      fixHints.push(`Fill ${f.path} or delete it`);
    }
    // Obvious unclosed JSX/HTML tags (heuristic)
    if (/\.(tsx|jsx|html)$/i.test(f.path)) {
      const opens = (f.content.match(/<[A-Za-z][\w.-]*[^>]*>/g) || []).length;
      const closes = (f.content.match(/<\/[A-Za-z][\w.-]*>/g) || []).length;
      if (opens > closes + 8) {
        issues.push(`Possible unclosed tags in ${f.path}`);
        fixHints.push(`Check JSX/HTML structure in ${f.path}`);
      }
    }
  }

  // Critical = missing entry; warnings alone don't fail ok for static sites with html
  const critical = issues.some(
    (i) =>
      /missing|not valid|nothing to preview|Empty file: (app\/page|index\.html|package\.json)/i.test(
        i,
      ),
  );

  return {
    ok: !critical && issues.length < 8,
    issues,
    fixHints,
    kind,
  };
}
