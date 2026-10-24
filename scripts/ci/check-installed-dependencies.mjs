import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { npmCli, root } from './toolchain.mjs';

// Use semver shipped with the pinned npm runtime; no new dependency or install.
const semver = createRequire(npmCli())('semver');
export function validateInstalledVersion(name, version, range, overrides = {}) {
  const expected = typeof overrides[name] === 'string' ? overrides[name] : range;
  if (semver.validRange(expected) && !semver.satisfies(version, expected)) {
    throw new Error(`Installed dependency violates declared range: ${name} ${version} expected ${expected}`);
  }
}
export function installedDependencyState(repositoryRoot = root) {
  const read = path => JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8'));
  const manifest = read('package.json'), lock = read('package-lock.json');
  const direct = [];
  for (const workspace of ['', 'backend', 'frontend']) {
    const path = [workspace, 'package.json'].filter(Boolean).join('/');
    const owner = read(path), require = createRequire(join(repositoryRoot, path));
    for (const [name, range] of Object.entries({ ...owner.dependencies, ...owner.devDependencies })) {
      const packagePath = require.resolve.paths(name)?.map(directory => join(directory, name, 'package.json')).find(existsSync);
      if (!packagePath) throw new Error(`Required installed dependency is missing: ${workspace || 'root'} ${name}`);
      const installed = JSON.parse(readFileSync(packagePath, 'utf8'));
      if (installed.name !== name) throw new Error(`Installed package identity differs: ${name}`);
      validateInstalledVersion(name, installed.version, range, manifest.overrides);
      direct.push({ workspace: workspace || 'root', name, version: installed.version });
    }
  }
  const packages = [];
  for (const [path, record] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (record.link || !path.includes('node_modules/')) continue;
    const packagePath = join(repositoryRoot, path, 'package.json');
    if (!existsSync(packagePath)) {
      if (!record.optional) throw new Error(`Required locked package is missing: ${path}`);
      packages.push({ path, status: 'OPTIONAL_PLATFORM_ABSENT' });
      continue;
    }
    const installed = JSON.parse(readFileSync(packagePath, 'utf8'));
    const approvedOverride = typeof manifest.overrides?.[installed.name] === 'string' ? manifest.overrides[installed.name] : undefined;
    if (installed.version !== record.version && installed.version !== approvedOverride) throw new Error(`Installed package differs from frozen lock: ${path}`);
    packages.push({ path, name: installed.name, version: installed.version, status: 'PRESENT' });
  }
  return { result: 'PASS_INSTALLED_LOCK_INDEX_AND_DIRECT_RANGES', packages: packages.length,
    sha256: createHash('sha256').update(JSON.stringify({ direct, packages })).digest('hex'), direct };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(installedDependencyState()));
