/**
 * Builds the egress proxy sidecar image from the production source.
 *
 *   tsx scripts/browser/build-proxy-image.mts [--tag xroga-egress-proxy:phase2-test] [--platform linux/arm64]
 *
 * The proxy (backend/src/workers/proxySidecar.ts) is bundled into one file with esbuild, copied into a temporary build context together with
 * deploy/browser-worker/Dockerfile.proxy, and built. The bundle is a build artifact: it is never committed.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n: string, d?: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const tag = arg('--tag', 'xroga-egress-proxy:phase2-test')!;
const platform = arg('--platform');

const ctx = mkdtempSync(join(tmpdir(), 'xroga-proxy-ctx-'));
try {
  mkdirSync(join(ctx, 'dist'));
  await build({
    entryPoints: [join(repoRoot, 'backend/src/workers/proxySidecar.ts')], outfile: join(ctx, 'dist/egress-proxy-sidecar.mjs'),
    bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'warning',
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  copyFileSync(join(repoRoot, 'deploy/browser-worker/Dockerfile.proxy'), join(ctx, 'Dockerfile'));
  const r = spawnSync('docker', ['build', ...(platform ? ['--platform', platform] : []), '-t', tag, ctx], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' }, timeout: 600_000 });
  if (r.status !== 0) { console.error(r.stderr.slice(-1500)); process.exitCode = 5; } else console.log(`built ${tag}`);
} finally { rmSync(ctx, { recursive: true, force: true }); }
