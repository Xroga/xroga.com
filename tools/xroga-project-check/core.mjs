import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const SAFE_NAME = /^[A-Za-z0-9._/-]{1,240}$/;
const CATEGORY_WEIGHTS = Object.freeze({ foundation: 15, build: 20, quality: 25, deployment: 15, documentation: 15, agent: 5, security: 5 });

async function exists(root, relative) {
  try { await access(path.join(root, relative)); return true; } catch { return false; }
}

async function jsonFile(root, relative) {
  const raw = await readFile(path.join(root, relative), 'utf8');
  try { return JSON.parse(raw); } catch { throw new Error(`MALFORMED_PACKAGE_JSON: ${relative} is not valid JSON.`); }
}

function dependencyNames(pkg) {
  return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
}

function detectFrameworks(dependencies) {
  const matches = [
    ['next', 'Next.js'], ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['@angular/core', 'Angular'],
    ['express', 'Express'], ['fastify', 'Fastify'], ['expo', 'Expo'], ['electron', 'Electron'], ['nestjs', 'NestJS'],
    ['pytest', 'Pytest'], ['django', 'Django'], ['flask', 'Flask'],
  ];
  return matches.filter(([name]) => dependencies.has(name)).map(([, label]) => label);
}

function check(id, category, weight, passed, severity, message, evidence = []) {
  return { id, category, weight, passed, severity: passed ? 'PASS' : severity, message, evidence };
}

function envNames(raw) {
  return raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))
    .map((line) => line.split('=', 1)[0].trim()).sort();
}

export async function inspectRepository(requestedRoot) {
  const root = path.resolve(requestedRoot || '.');
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error('INVALID_PATH: repository path must be a readable directory.');
  const entries = new Set(await readdir(root));
  const hasPackage = entries.has('package.json');
  const pkg = hasPackage ? await jsonFile(root, 'package.json') : {};
  const scripts = pkg.scripts ?? {};
  const workspacePackages = [];
  for (const relative of Array.isArray(pkg.workspaces) ? pkg.workspaces : []) {
    if (typeof relative !== 'string' || relative.includes('*') || relative.includes('..') || path.isAbsolute(relative)) continue;
    if (await exists(root, `${relative}/package.json`)) workspacePackages.push(await jsonFile(root, `${relative}/package.json`));
  }
  const dependencies = new Set([dependencyNames(pkg), ...workspacePackages.map(dependencyNames)].flatMap((items) => [...items]));
  const locks = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'Cargo.lock', 'poetry.lock'].filter((name) => entries.has(name));
  const readme = ['README.md', 'README.MD', 'readme.md'].find((name) => entries.has(name));
  const workflowDir = path.join(root, '.github', 'workflows');
  const workflows = await readdir(workflowDir).catch(() => []);
  const deploymentFiles = ['vercel.json', 'netlify.toml', 'fly.toml', 'fly.api.toml', 'Dockerfile', 'docker-compose.yml', 'wrangler.toml', 'app.json', 'eas.json'].filter((name) => entries.has(name));
  const agentFiles = ['AGENTS.md', 'CLAUDE.md', '.cursorrules'].filter((name) => entries.has(name));
  const envExamples = ['.env.example', '.env.local.example', 'backend/.env.example', 'frontend/.env.local.example'];
  const declaredEnvironment = [];
  for (const relative of envExamples) {
    if (await exists(root, relative)) declaredEnvironment.push(...envNames(await readFile(path.join(root, relative), 'utf8')));
  }
  const allScripts = [scripts, ...workspacePackages.map((item) => item.scripts ?? {})];
  const hasScript = (...names) => allScripts.some((record) => names.some((name) => typeof record[name] === 'string'));
  const qualityScripts = { test: hasScript('test'), typecheck: hasScript('typecheck', 'type-check'), lint: hasScript('lint'), build: hasScript('build') };
  const checks = [
    check('foundation.manifest', 'foundation', 8, hasPackage || entries.has('pyproject.toml') || entries.has('Cargo.toml') || entries.has('go.mod'), 'CRITICAL', 'A recognized project manifest exists.', ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']),
    check('foundation.lockfile', 'foundation', 7, locks.length === 1, locks.length > 1 ? 'WARNING' : 'WARNING', locks.length === 1 ? `One dependency lockfile is present (${locks[0]}).` : locks.length ? `Multiple lockfiles are present: ${locks.join(', ')}.` : 'No recognized dependency lockfile is present.', locks),
    check('build.script', 'build', 20, qualityScripts.build, 'CRITICAL', qualityScripts.build ? 'A build script is declared.' : 'No build script is declared.', qualityScripts.build ? ['package.json#scripts.build'] : []),
    check('quality.test', 'quality', 10, qualityScripts.test, 'WARNING', qualityScripts.test ? 'A test script is declared.' : 'No test script is declared.', qualityScripts.test ? ['package.json#scripts.test'] : []),
    check('quality.typecheck', 'quality', 8, qualityScripts.typecheck || dependencies.has('typescript'), 'WARNING', qualityScripts.typecheck ? 'A typecheck script is declared.' : dependencies.has('typescript') ? 'TypeScript is present; type checking may run through build.' : 'No typecheck signal is present.', []),
    check('quality.lint', 'quality', 7, qualityScripts.lint, 'WARNING', qualityScripts.lint ? 'A lint script is declared.' : 'No lint script is declared.', qualityScripts.lint ? ['package.json#scripts.lint'] : []),
    check('deployment.config', 'deployment', 8, deploymentFiles.length > 0, 'INFO', deploymentFiles.length ? `Deployment configuration detected: ${deploymentFiles.join(', ')}.` : 'No recognized deployment configuration is present.', deploymentFiles),
    check('deployment.workflow', 'deployment', 7, workflows.length > 0, 'INFO', workflows.length ? `${workflows.length} GitHub workflow file(s) detected.` : 'No GitHub workflow is present.', workflows.map((name) => `.github/workflows/${name}`)),
    check('docs.readme', 'documentation', 8, Boolean(readme), 'WARNING', readme ? 'README is present.' : 'README is missing.', readme ? [readme] : []),
    check('docs.security', 'documentation', 4, await exists(root, 'SECURITY.md'), 'INFO', await exists(root, 'SECURITY.md') ? 'Security reporting instructions are present.' : 'SECURITY.md is missing.', ['SECURITY.md']),
    check('docs.contributing', 'documentation', 3, await exists(root, 'CONTRIBUTING.md'), 'INFO', await exists(root, 'CONTRIBUTING.md') ? 'Contribution guidance is present.' : 'CONTRIBUTING.md is missing.', ['CONTRIBUTING.md']),
    check('agent.instructions', 'agent', 5, agentFiles.length > 0, 'INFO', agentFiles.length ? `Agent instructions detected: ${agentFiles.join(', ')}.` : 'No recognized agent instruction file is present.', agentFiles),
    check('security.env-contract', 'security', 5, declaredEnvironment.length > 0, 'INFO', declaredEnvironment.length ? `${new Set(declaredEnvironment).size} environment variable name(s) are declared in example files; values were not read into the report.` : 'No environment contract example was detected.', envExamples),
  ];
  const score = checks.filter((item) => item.passed).reduce((sum, item) => sum + item.weight, 0);
  const criticalFindings = checks.filter((item) => !item.passed && item.severity === 'CRITICAL');
  const band = score >= 90 ? 'STRONG' : score >= 75 ? 'GOOD' : score >= 55 ? 'NEEDS_WORK' : 'AT_RISK';
  return {
    schemaVersion: 1, tool: 'xroga-project-check', generatedAt: new Date().toISOString(),
    repository: { root: '.', name: path.basename(root), privateCodeUploaded: false },
    score, band, criticalCount: criticalFindings.length,
    categories: Object.entries(CATEGORY_WEIGHTS).map(([id, weight]) => ({ id, weight, earned: checks.filter((item) => item.category === id && item.passed).reduce((sum, item) => sum + item.weight, 0) })),
    checks, frameworks: detectFrameworks(dependencies), packageManager: locks[0] === 'package-lock.json' ? 'npm' : locks[0]?.split('-lock')[0]?.split('.')[0] ?? 'UNKNOWN',
    environmentVariableNames: [...new Set(declaredEnvironment)],
    limitations: [
      'Static deterministic inspection only; repository scripts were not executed.',
      'This is not a security certification, deployment guarantee or proof that tests pass.',
      'No repository source or environment values were uploaded; telemetry is disabled.',
    ],
  };
}

export function renderHuman(result) {
  const lines = [
    `Xroga Project Check: ${result.score}/100 (${result.band})`,
    '',
    ...result.categories.map((item) => `${item.id.padEnd(14)} ${String(item.earned).padStart(2)}/${item.weight}`),
    '', 'Findings:',
    ...result.checks.filter((item) => !item.passed).map((item) => `- ${item.severity}: ${item.message}`),
    '', 'Limitations:', ...result.limitations.map((item) => `- ${item}`),
    '', 'For deeper repository-aware diagnosis or authorized repair: https://xroga.com/workspace',
  ];
  return `${lines.join('\n')}\n`;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

export function renderBadgeSvg(result) {
  const label = 'Xroga Project Check';
  const value = `${Number(result.score)}/100 ${String(result.band).replace(/[^A-Z_]/g, '')}`;
  const color = result.score >= 90 ? '#2f855a' : result.score >= 75 ? '#2563eb' : result.score >= 55 ? '#b7791f' : '#c53030';
  const left = 148; const right = Math.max(96, value.length * 7 + 18); const width = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(`${label}: ${value}`)}" width="${width}" height="20" viewBox="0 0 ${width} 20"><title>${escapeXml(`${label}: ${value}`)}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient><clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="${left}" height="20" fill="#25272b"/><rect x="${left}" width="${right}" height="20" fill="${color}"/><rect width="${width}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="11"><text x="${left / 2}" y="14">${escapeXml(label)}</text><text x="${left + right / 2}" y="14">${escapeXml(value)}</text></g></svg>`;
}

export function safeOutputPath(repositoryRoot, requested) {
  if (!SAFE_NAME.test(requested) || path.isAbsolute(requested) || requested.includes('..')) throw new Error('UNSAFE_OUTPUT_PATH: output must be a relative repository path.');
  const root = path.resolve(repositoryRoot); const output = path.resolve(root, requested);
  if (!output.startsWith(`${root}${path.sep}`)) throw new Error('UNSAFE_OUTPUT_PATH: output escaped the repository.');
  return output;
}
