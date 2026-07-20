import type { ProjectFile } from '../integrations/githubDeploy.js';
import type { ScaffoldKind } from './detectScaffold.js';

const CRITICAL: Record<ScaffoldKind, string[]> = {
  static: ['index.html'],
  nextjs: ['package.json', 'app/layout.tsx', 'app/page.tsx'],
  expo: ['package.json', 'app.json', 'app/index.tsx'],
  chrome: ['manifest.json', 'popup.html', 'background.js'],
  electron: ['package.json', 'main.js', 'preload.js', '.github/workflows/release.yml'],
};

/**
 * If the LLM emptied or deleted critical scaffold files, restore them from the
 * scaffold baseline so ship structure stays valid.
 */
export function ensureScaffoldIntegrity(
  kind: ScaffoldKind,
  scaffoldFiles: ProjectFile[],
  merged: ProjectFile[],
): { files: ProjectFile[]; restored: string[] } {
  const byPath = new Map(merged.map((f) => [f.path, f]));
  const scaffoldByPath = new Map(scaffoldFiles.map((f) => [f.path, f]));
  const restored: string[] = [];
  const critical = CRITICAL[kind] || [];

  for (const path of critical) {
    const cur = byPath.get(path);
    const base = scaffoldByPath.get(path);
    if (!base) continue;
    if (!cur || !cur.content?.trim()) {
      byPath.set(path, base);
      restored.push(path);
    }
  }

  // Always keep release workflow / zip script if scaffold had them and AI dropped them
  for (const f of scaffoldFiles) {
    if (
      f.path.startsWith('.github/workflows/') ||
      f.path === 'scripts/zip-extension.mjs' ||
      f.path === 'PUBLISH.md'
    ) {
      const cur = byPath.get(f.path);
      if (!cur || !cur.content?.trim()) {
        byPath.set(f.path, f);
        if (!restored.includes(f.path)) restored.push(f.path);
      }
    }
  }

  return { files: Array.from(byPath.values()), restored };
}
