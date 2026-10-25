import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './toolchain.mjs';

function packageVersion(entry, name) {
  let directory = dirname(entry);
  while (true) {
    try { const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')); if (manifest.name === name) return manifest.version; } catch { /* Walk to the package root. */ }
    const parent = dirname(directory); if (parent === directory) throw new Error(`Package identity not found: ${name}`);
    directory = parent;
  }
}
const backendRequire = createRequire(join(root, 'backend/package.json'));
const backendZod = packageVersion(backendRequire.resolve('zod'), 'zod');
// Cline exposes an import-only entry. Resolve its installed identity through
// Node's backend search paths instead of incorrectly requiring a CJS export.
const clineManifest = backendRequire.resolve.paths('@cline/sdk')
  .map(directory => join(directory, '@cline/sdk/package.json')).find(existsSync);
if (!clineManifest) throw new Error('Backend Cline SDK installation is missing');
const cline = packageVersion(clineManifest, '@cline/sdk');
if (backendZod !== '3.25.76' || cline !== '0.0.82') throw new Error('Backend Agent V2 application dependency versions differ from approved locks');
const promptEntry = backendRequire.resolve('@sap-ai-sdk/prompt-registry');
const promptRequire = createRequire(promptEntry);
const promptZod = packageVersion(promptRequire.resolve('zod'), 'zod');
if (!promptZod.startsWith('4.')) throw new Error('SAP prompt registry must resolve its own Zod 4 dependency');
if (!process.argv.includes('--standalone')) {
  const rootRequire = createRequire(join(root, 'package.json'));
  if (packageVersion(rootRequire.resolve('zod'), 'zod') !== '4.6.5') throw new Error('Workspace root Zod version differs from the approved lock');
}
await import(pathToFileURL(promptEntry).href);
console.log(JSON.stringify({ result: 'PASS_AGENT_DEPENDENCY_RESOLUTION', cline, backendZod, promptZod, standalone: process.argv.includes('--standalone') }));
