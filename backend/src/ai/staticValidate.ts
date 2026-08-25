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

/**
 * Remove zero-byte CSS/JS placeholders that no HTML document loads.
 *
 * Some builder responses contain a complete, standalone `index.html` followed by
 * empty classic `styles.css` and `script.js` fences. Keeping those files makes the
 * independent reviewer report defects that do not exist in the runnable product.
 * Referenced assets are deliberately preserved so `emptyReferencedAssets` can keep
 * blocking a page that promises CSS or JavaScript it does not contain.
 */
export function pruneUnusedEmptyAssets(files: ProjectFile[]): ProjectFile[] {
  const html = files
    .filter((f) => /\.html$/i.test(f.path))
    .map((f) => f.content)
    .join('\n');
  if (!html.trim()) return files;

  const referenced = new Set(emptyReferencedAssets(files));
  return files.filter(
    (f) =>
      !(
        isClassicOptionalAsset(f.path) &&
        !f.content?.trim() &&
        !referenced.has(f.path)
      ),
  );
}

const STATIC_FALLBACK_CSS = `:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #07111f;
  color: #f8fbff;
}

* { box-sizing: border-box; }

html { min-height: 100%; scroll-behavior: smooth; }

body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  padding: clamp(1.25rem, 5vw, 5rem);
  background:
    radial-gradient(circle at 15% 10%, rgba(38, 132, 255, 0.28), transparent 34rem),
    linear-gradient(145deg, #07111f 0%, #0d1d35 52%, #07111f 100%);
}

main, body > div, body > section {
  width: min(100%, 72rem);
}

h1, h2, h3, p { text-wrap: balance; }

h1 {
  margin: 0 0 1rem;
  font-size: clamp(2.6rem, 8vw, 6.5rem);
  line-height: 0.95;
  letter-spacing: -0.055em;
}

p {
  max-width: 44rem;
  color: #b8c8dc;
  font-size: clamp(1rem, 2vw, 1.25rem);
  line-height: 1.7;
}

button, .button, [role="button"] {
  min-height: 3rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  padding: 0.75rem 1.25rem;
  background: #2087ff;
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 0.75rem 2rem rgba(32, 135, 255, 0.25);
  transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

button:hover, .button:hover, [role="button"]:hover {
  transform: translateY(-2px);
  background: #0d6fdf;
  box-shadow: 0 1rem 2.5rem rgba(32, 135, 255, 0.34);
}

button:focus-visible, .button:focus-visible, [role="button"]:focus-visible {
  outline: 3px solid rgba(130, 195, 255, 0.9);
  outline-offset: 4px;
}

button[data-activated="true"] { background: #0faf78; }

@media (max-width: 40rem) {
  body { place-items: start center; padding-top: 4rem; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}`;

const STATIC_FALLBACK_JS = `document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.xrogaReady = 'true';

  document.querySelectorAll('button:not([type="submit"])').forEach((button) => {
    if (button.dataset.xrogaBound === 'true') return;
    button.dataset.xrogaBound = 'true';
    button.addEventListener('click', () => {
      button.dataset.activated = 'true';
      button.setAttribute('aria-pressed', 'true');
    });
  });
});`;

/**
 * Complete the two conventional static-site assets when a model emitted their
 * references but left the files empty.
 *
 * This is intentionally narrow: it never rewrites authored content, framework
 * entrypoints, or arbitrary script names. It only makes the well-known
 * `styles.css` and `script.js` contract truthful for a standalone HTML build.
 */
export function repairReferencedEmptyClassicAssets(files: ProjectFile[]): ProjectFile[] {
  const referenced = new Set(emptyReferencedAssets(files));
  if (!referenced.size) return files;

  return files.map((file) => {
    if (file.content?.trim() || !referenced.has(file.path)) return file;

    const name = file.path.replace(/\\/g, '/').split('/').pop()?.toLowerCase();
    if (name === 'styles.css') return { ...file, content: STATIC_FALLBACK_CSS };
    if (name === 'script.js') return { ...file, content: STATIC_FALLBACK_JS };
    return file;
  });
}

function isClassicOptionalAsset(path: string): boolean {
  return path === 'styles.css' || path === 'script.js';
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
          !has(files, 'app/page.jsx') &&
          !has(files, 'pages/index.jsx') &&
          !has(files, 'app/page.js') &&
          !has(files, 'pages/index.js')
        ) {
          issues.push('Next.js project missing an app/page or pages/index entry');
          fixHints.push('Add an app/page or pages/index home route');
        }
        if (
          !has(files, 'app/layout.tsx') &&
          !has(files, 'app/layout.jsx') &&
          !has(files, 'app/layout.js')
        ) {
          issues.push('Next.js App Router missing app/layout');
          fixHints.push('Add an app/layout file wrapping children');
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

  const referencedEmptyAssets = new Set(emptyReferencedAssets(files));
  const hasHtmlDocument = files.some((f) => /\.html$/i.test(f.path) && f.content.trim());

  for (const f of files) {
    const unusedEmptyWebAsset =
      hasHtmlDocument &&
      isClassicOptionalAsset(f.path) &&
      !f.content?.trim() &&
      !referencedEmptyAssets.has(f.path);
    if (
      !unusedEmptyWebAsset &&
      !f.content?.trim() &&
      /\.(tsx?|jsx?|html|css|json)$/i.test(f.path)
    ) {
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
    ) || referencedEmptyAssets.size > 0;

  for (const path of referencedEmptyAssets) {
    fixHints.push(`Write ${path} or remove the reference to it from the page`);
  }

  return {
    ok: !critical && issues.length < 8,
    issues,
    fixHints,
    kind,
  };
}
