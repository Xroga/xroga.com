import type { ProjectFile } from './patches.js';
import { htmlLooksTruncated, htmlTagBalance } from './htmlTruncation.js';

export interface StaticValidateResult {
  ok: boolean;
  issues: string[];
  fixHints: string[];
  kind: 'static' | 'nextjs' | 'expo' | 'chrome' | 'electron' | 'unknown';
}

function has(files: ProjectFile[], path: string): boolean {
  return files.some((f) => f.path === path || f.path.endsWith(`/${path}`));
}

function read(files: ProjectFile[], path: string): string {
  return files.find((f) => f.path === path)?.content ?? '';
}

/**
 * Empty stylesheets and scripts that an HTML page actually links.
 *
 * An unused empty file is untidy. An empty file the page loads is a broken product: the
 * markup promises styling or behaviour that does not exist, and the result looks like
 * the unstyled document a user screenshotted after run `85681d10` — a zero-byte
 * `styles.css` and `script.js` shipped next to a page that linked both.
 */
export function emptyReferencedAssets(files: ProjectFile[]): string[] {
  const html = files
    .filter((f) => /\.html$/i.test(f.path))
    .map((f) => f.content)
    .join('\n');
  if (!html.trim()) return [];

  return files
    .filter((f) => /\.(css|js)$/i.test(f.path) && !f.content?.trim())
    .filter((f) => {
      const name = f.path.split('/').pop() ?? f.path;
      // Matched on the file name so `./styles.css`, `/styles.css` and `styles.css` all
      // count as a reference.
      return new RegExp(`(?:src|href)\\s*=\\s*["'][^"']*${escapeRegExp(name)}["']`, 'i').test(html);
    })
    .map((f) => f.path);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  // Chrome MV3
  if (has(files, 'manifest.json')) {
    kind = 'chrome';
    const manifest = read(files, 'manifest.json');
    try {
      const m = JSON.parse(manifest) as { manifest_version?: number; name?: string };
      if (m.manifest_version !== 3) {
        issues.push('Chrome extension manifest_version must be 3');
        fixHints.push('Set "manifest_version": 3');
      }
      if (!m.name) {
        issues.push('Chrome extension manifest missing name');
        fixHints.push('Add name to manifest.json');
      }
    } catch {
      issues.push('manifest.json is not valid JSON');
      fixHints.push('Fix manifest.json syntax');
    }
    if (
      !has(files, 'background.js') &&
      !has(files, 'service_worker.js') &&
      !has(files, 'background.ts') &&
      !has(files, 'popup.html')
    ) {
      issues.push('Chrome extension missing background service worker or popup.html');
      fixHints.push('Add background.js or popup.html');
    }
  }

  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        main?: string;
        scripts?: Record<string, string>;
      };
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.electron && !deps.next) {
        kind = 'electron';
        if (!has(files, 'main.js') && !has(files, 'main.ts') && !(pkg.main && has(files, pkg.main))) {
          issues.push('Electron project missing main.js entry');
          fixHints.push('Add main.js as the Electron main process');
        }
        if (!has(files, '.github/workflows/release.yml')) {
          issues.push('Electron project missing .github/workflows/release.yml');
          fixHints.push('Add Desktop release workflow for unsigned GitHub Releases');
        }
      } else if (deps.next) {
        kind = 'nextjs';
        if (
          !has(files, 'app/page.tsx') &&
          !has(files, 'pages/index.tsx') &&
          !has(files, 'app/page.jsx')
        ) {
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
      } else if (kind === 'static') {
        kind = 'unknown';
      }
    } catch {
      issues.push('package.json is not valid JSON');
      fixHints.push('Fix package.json syntax');
      kind = 'unknown';
    }
  } else if (kind !== 'chrome') {
    if (!has(files, 'index.html')) {
      issues.push('No index.html and no package.json — nothing to preview');
      fixHints.push('Add index.html or a framework package.json');
    }
  }

  for (const f of files) {
    if (!f.content?.trim() && /\.(tsx?|jsx?|html|css|json)$/i.test(f.path)) {
      issues.push(`Empty file: ${f.path}`);
      fixHints.push(`Fill ${f.path} or delete it`);
    }
    if (/\.(tsx|jsx|html)$/i.test(f.path)) {
      // A document that stops mid-page is a broken product, not a style note. See
      // `htmlTruncation` for why the previous open/close count could not be trusted.
      if (/\.html$/i.test(f.path) && htmlLooksTruncated(f.content)) {
        issues.push(`Truncated document: ${f.path} is missing its closing tags`);
        fixHints.push(`Regenerate ${f.path} in full — the previous output stopped early`);
      } else if (htmlTagBalance(f.content).unclosed >= 2) {
        issues.push(`Possible unclosed tags in ${f.path}`);
        fixHints.push(`Check JSX/HTML structure in ${f.path}`);
      }
    }
  }

  // A truncated entry document and an empty file the page actually loads are both
  // shipped-and-broken, so they join the critical set. Run 85681d10 shipped an
  // index.html that ended mid-page alongside a zero-byte styles.css it linked, and
  // reported "Structure: ok" while doing it.
  const critical =
    issues.some(
      (i) =>
        /missing|not valid|nothing to preview|Empty file: (app\/page|index\.html|package\.json|manifest\.json|main\.js|app\.json)/i.test(
          i,
        ) || /manifest_version must be 3|^Truncated document:/i.test(i),
    ) || emptyReferencedAssets(files).length > 0;

  for (const path of emptyReferencedAssets(files)) {
    fixHints.push(`Write ${path} or remove the reference to it from the page`);
  }

  return {
    ok: !critical && issues.length < 8,
    issues,
    fixHints,
    kind,
  };
}
