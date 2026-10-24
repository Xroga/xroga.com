/**
 * Supply-chain pins of the browser worker images (INFRA-005: "pinned Chromium/Playwright/Stagehand").
 *
 * What is pinned, and how a change is noticed:
 *  - Chromium comes from the base image, which is pinned by digest, and whose tag version must equal the pinned Playwright version (a mismatch
 *    leaves Playwright looking for a browser build the image does not contain).
 *  - Playwright and Stagehand are exact versions in `deploy/browser-worker/package.json`, locked in `package-lock.json` with integrity hashes from the
 *    npm registry, installed with `npm ci --ignore-scripts` (no dependency runs code at install time).
 *  - Every locked package has an allowed licence.
 *  - Stagehand is pinned but NOT wired: nothing in the probe imports it (that is INFRA-007). Its hosted-Browserbase SDK arrives as a transitive
 *    dependency; it is inert here, and the browser network has no route out for it to use.
 */
/** the only file allowed to use Stagehand, and only in local mode */
export const STAGEHAND_RUNTIME = 'runJob.mjs';

export interface PinProblem { code: 'EXACT_VERSION' | 'LOCK_OUT_OF_SYNC' | 'LOCK_VERSION' | 'LOCK_INTEGRITY' | 'LOCK_SOURCE' | 'LICENSE' | 'INSTALL_SCRIPT' | 'BASE_IMAGE' | 'BASE_TAG_MISMATCH' | 'NPM_CI_FLAGS' | 'STAGEHAND_WIRED'; detail: string }

export const ALLOWED_LICENSES: readonly string[] = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'BlueOak-1.0.0'];
const EXACT = /^\d+\.\d+\.\d+$/;

interface Pkg { dependencies?: Record<string, string> }
interface LockPackage { version?: string; resolved?: string; integrity?: string; license?: string; hasInstallScript?: boolean }
interface Lock { packages?: Record<string, LockPackage & { dependencies?: Record<string, string> }> }

export function checkImagePins(input: { pkg: Pkg; lock: Lock; dockerfile: string; proxyDockerfile?: string; probeSources?: Record<string, string>; allowedLicenses?: readonly string[] }): PinProblem[] {
  const out: PinProblem[] = [];
  const add = (code: PinProblem['code'], detail: string) => out.push({ code, detail });
  const deps = input.pkg.dependencies ?? {};
  const allowed = input.allowedLicenses ?? ALLOWED_LICENSES;

  for (const [name, range] of Object.entries(deps)) if (!EXACT.test(range)) add('EXACT_VERSION', `${name} is "${range}", not an exact version`);

  const packages = input.lock.packages ?? {};
  const root = packages[''] as { dependencies?: Record<string, string> } | undefined;
  if (JSON.stringify(Object.entries(root?.dependencies ?? {}).sort()) !== JSON.stringify(Object.entries(deps).sort())) add('LOCK_OUT_OF_SYNC', 'the lockfile root does not list the same dependencies as package.json');
  for (const [name, range] of Object.entries(deps)) {
    const locked = packages[`node_modules/${name}`]?.version;
    if (locked !== range) add('LOCK_VERSION', `${name} is locked at ${locked ?? 'nothing'}, pinned at ${range}`);
  }
  for (const [path, p] of Object.entries(packages)) {
    if (!path) continue;
    const name = path.replace(/^.*node_modules\//, '');
    if (!p.integrity || !/^sha512-/.test(p.integrity)) add('LOCK_INTEGRITY', `${name} has no sha512 integrity hash`);
    if (!p.resolved || !p.resolved.startsWith('https://registry.npmjs.org/')) add('LOCK_SOURCE', `${name} does not resolve from the npm registry`);
    if (!p.license || !allowed.includes(p.license)) add('LICENSE', `${name} has licence "${p.license ?? 'none'}"`);
    if (p.hasInstallScript) add('INSTALL_SCRIPT', `${name} runs code at install time`);
  }

  const base = /^FROM\s+mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-[a-z]+@sha256:[0-9a-f]{64}\s*$/m.exec(input.dockerfile);
  if (!base) add('BASE_IMAGE', 'the browser image must start FROM the Playwright image pinned by tag and digest');
  else if (base[1] !== deps['playwright-core']) add('BASE_TAG_MISMATCH', `base image is Playwright ${base[1]} but playwright-core is pinned at ${deps['playwright-core'] ?? 'nothing'}`);
  if (input.proxyDockerfile !== undefined && !/^FROM\s+\S+@sha256:[0-9a-f]{64}\s*$/m.test(input.proxyDockerfile)) add('BASE_IMAGE', 'the proxy image base is not pinned by digest');
  if (!/npm ci\b[^\n]*--ignore-scripts/.test(input.dockerfile)) add('NPM_CI_FLAGS', 'the Dockerfile must install with npm ci --ignore-scripts');

  // INFRA-007 wires Stagehand into exactly one file, the job runtime, and only in local mode: it attaches to the Chromium the hardened
  // launch policy started (localBrowser.connect), never launches its own (its defaults include --remote-allow-origins=*), never uses the
  // hosted Browserbase launcher, and never configures a Stagehand API key or API URL (Browserbase's managed gateway).
  for (const [file, text] of Object.entries(input.probeSources ?? {})) {
    if (!/stagehand/i.test(text)) continue;
    if (file !== STAGEHAND_RUNTIME) { add('STAGEHAND_WIRED', `${file} references Stagehand: only ${STAGEHAND_RUNTIME} may`); continue; }
    if (/\bbrowserbase\s*\.|\{[^}]*\bbrowserbase\b[^}]*\}\s*=\s*await import/.test(text)) add('STAGEHAND_WIRED', `${file} uses the hosted Browserbase launcher`);
    if (/localBrowser\s*\.\s*launch/.test(text)) add('STAGEHAND_WIRED', `${file} lets Stagehand launch its own Chromium`);
    if (!/localBrowser\s*\.\s*connect/.test(text)) add('STAGEHAND_WIRED', `${file} does not attach Stagehand to the policy-launched Chromium`);
    if (/\bapi(Key|Url)\s*:/.test(text)) add('STAGEHAND_WIRED', `${file} configures a Stagehand API key or URL`);
  }
  return out;
}
