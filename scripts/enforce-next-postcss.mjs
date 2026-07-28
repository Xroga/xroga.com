import { cp, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const frontendModules = join(repositoryRoot, 'frontend', 'node_modules');
const source = join(frontendModules, 'postcss');
const target = join(frontendModules, 'next', 'node_modules', 'postcss');

async function versionAt(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  return String(manifest.version ?? '0.0.0');
}

function isPatched(version) {
  const [major, minor, patch] = version.split('.').map((part) => Number.parseInt(part, 10));
  return major > 8 || (major === 8 && (minor > 5 || (minor === 5 && patch >= 18)));
}

const sourceVersion = await versionAt(source);
if (!isPatched(sourceVersion)) {
  throw new Error(`The approved PostCSS package is not patched: ${sourceVersion}`);
}

let targetVersion = 'missing';
try {
  targetVersion = await versionAt(target);
} catch {
  // A deduplicated install already uses the approved top-level package.
}

if (targetVersion !== 'missing' && !isPatched(targetVersion)) {
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true, force: true });
  targetVersion = await versionAt(target);
}

if (targetVersion !== 'missing' && !isPatched(targetVersion)) {
  throw new Error(`Next.js resolved an unsafe PostCSS package: ${targetVersion}`);
}

console.log(`verified_next_postcss=${targetVersion === 'missing' ? sourceVersion : targetVersion}`);
