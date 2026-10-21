import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { jsonSchema, validateInventory } from './inventory-schema.mjs';
import { npmCli } from '../ci/toolchain.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const stableId = (kind, value) => `${kind}:${hash(value).slice(0, 20)}`;
const sorted = values => [...new Set(values)].sort();
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const isTest = path => /(?:\.test\.|\.spec\.|\.local\.integration\.|\/tests?\/|\/e2e\/)/.test(path);
const codePattern = /\.(?:[cm]?[jt]sx?)$/;
const inspected = path => (/^(?:backend\/src\/|frontend\/src\/|scripts\/|tools\/)/.test(path) || /^frontend\/(?:redirects|next\.config)\.mjs$/.test(path)) && codePattern.test(path);

export const requiredPaths = [
  'AGENTS.md', 'README.md', 'CONTRIBUTING.md', 'DEPLOY.md', 'ROUTING.md', 'SECURITY.md', 'SHIP_COMPLETENESS.md', 'OWNER_SETUP.md',
  'package.json', 'backend/package.json', 'frontend/package.json', 'Dockerfile.api', 'Dockerfile.browser', 'fly.api.toml', 'fly.browser.toml',
  'cloudbuild-run-job.yaml', 'cloudbuild-browser-worker.yaml', 'vercel.json', '.vercel/project.json',
  'backend/src/index.ts', 'backend/src/middleware/auth.ts', 'backend/src/middleware/phase1Auth.ts',
  'backend/src/config/supabase.ts', 'backend/src/config/jobQueues.ts', 'backend/src/ai/taskGraphRunner.ts', 'backend/src/ai/runReconciler.ts',
  'backend/src/ai/universal/semanticRequestPlanner.ts', 'backend/src/services/integrations/composioClient.ts',
  'backend/src/services/integrations/businessAction.ts', 'backend/src/services/integrations/pluginPermissionPolicy.ts',
  'backend/src/services/integrations/oauthPkceStore.ts', 'backend/src/services/storage/projectFiles.ts', 'backend/src/routes/billingWebhook.ts',
  'backend/src/services/publish/easCredentials.ts', 'frontend/src/lib/xrogaBlocks.ts', 'frontend/src/lib/xrogaRichResults.ts',
  'frontend/src/lib/xrogaEvent.ts', 'frontend/src/app/(shell)/dashboard/automations/page.tsx', 'frontend/src/app/(shell)/dashboard/library/page.tsx',
];

function text(node, source) { return node?.getText(source).slice(0, 160) ?? ''; }
function literal(node) { return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null; }
function callName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return `${callName(node.expression)}.${node.name.text}`;
  if (ts.isCallExpression(node)) return `${callName(node.expression)}()`;
  if (ts.isElementAccessExpression(node)) return `${callName(node.expression)}[${literal(node.argumentExpression) ?? '<computed>'}]`;
  return '<expression>';
}
function enclosingFunction(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent)) return parent.name?.getText() ?? '<anonymous>';
    if (ts.isVariableDeclaration(parent) && parent.initializer && (ts.isArrowFunction(parent.initializer) || ts.isFunctionExpression(parent.initializer))) return parent.name.getText();
  }
  return '<module>';
}
function scopeOf(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) return 'function';
    if (ts.isIfStatement(parent) || ts.isConditionalExpression(parent)) return 'conditional';
  }
  return 'module';
}
function lineOf(source, node) { return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1; }

export function analyzeSource(sourcePath, content) {
  content = content.replace(/\r\n/g, '\n');
  const source = ts.createSourceFile(sourcePath, content, ts.ScriptTarget.Latest, true, sourcePath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = [], symbols = [], registrations = [], queueDefinitions = [], calls = [], schedules = [], findings = [], frontCalls = [];
  const tables = [], ownership = [], providerHosts = [], routerNames = new Set(), variableInitializers = new Map();
  let exportFactoryCallee = null;
  function visit(node) {
    if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
      || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isVariableDeclaration(node) || ts.isNewExpression(node) || ts.isCallExpression(node) || ts.isStringLiteral(node))) {
      ts.forEachChild(node, visit);
      return;
    }
    const line = lineOf(source, node);
    if (ts.isStringLiteral(node) && /^https?:\/\//.test(node.text)) {
      try { providerHosts.push(new URL(node.text).hostname); } catch { /* Invalid/template URLs are not accepted as provider identities. */ }
    }
    if (ts.isImportDeclaration(node) && literal(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = [];
      if (clause?.name) bindings.push(clause.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        bindings.push(...clause.namedBindings.elements.filter(item => !item.isTypeOnly).map(item => item.name.text));
      } else if (clause?.namedBindings) bindings.push(clause.namedBindings.name.text);
      imports.push({ specifier: node.moduleSpecifier.text, bindings, typeOnly: Boolean(clause?.isTypeOnly), line });
    }
    if (ts.isExportDeclaration(node) && literal(node.moduleSpecifier)) imports.push({ specifier: node.moduleSpecifier.text, bindings: [], typeOnly: Boolean(node.isTypeOnly), line });
    if (ts.isExportAssignment(node) && ts.isCallExpression(node.expression)) exportFactoryCallee = callName(node.expression.expression);
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) symbols.push(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      symbols.push(node.name.text);
      variableInitializers.set(`${enclosingFunction(node)}:${node.name.text}`, node.initializer);
      if (node.initializer && ts.isCallExpression(node.initializer) && /^(?:express|Router|express\.Router)$/.test(text(node.initializer.expression, source))) routerNames.add(node.name.text);
    }
    if (ts.isNewExpression(node) && /^(?:Queue|Worker|QueueScheduler)$/.test(text(node.expression, source))) {
      queueDefinitions.push({ kind: text(node.expression, source), name: literal(node.arguments?.[0]), line, factory: enclosingFunction(node) });
    }
    if (ts.isCallExpression(node)) {
      const callee = callName(node.expression);
      calls.push({ callee, line, functionName: enclosingFunction(node) });
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && literal(node.arguments[0])) imports.push({ specifier: node.arguments[0].text, bindings: [], typeOnly: false, line });
      if (ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const receiver = text(node.expression.expression, source);
        if (['use', 'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'].includes(method) && routerNames.has(receiver)) {
          const first = node.arguments[0], path = literal(first);
          const args = node.arguments.slice(path === null ? 0 : 1);
          const handlers = args.filter(item => !ts.isArrowFunction(item) && !ts.isFunctionExpression(item)).map(item => callName(item));
          const inlineResponse = args.some(item => (ts.isArrowFunction(item) || ts.isFunctionExpression(item)) && /\bres\.(?:status|json|send|end)\(/.test(item.getText(source)));
          registrations.push({ id: stableId('registration', `${sourcePath}:${node.getStart(source)}:${node.end}:${receiver}:${method}`), sourcePath, line, receiver, method, path, handlers, scope: scopeOf(node), functionName: enclosingFunction(node), inlineResponse });
        }
        if (method === 'from' && literal(node.arguments[0])) tables.push(node.arguments[0].text);
        if (method === 'eq' && /^(?:user_id|owner_id|tenant_id|workspace_id|organization_id|created_by)$/.test(literal(node.arguments[0]) ?? '')) ownership.push(`${sourcePath}:${line} (${literal(node.arguments[0])})`);
      }
      if (callee === 'setInterval' || /(?:cron\.schedule|scheduleJob|upsertJobScheduler|addRepeatableJob)$/.test(callee)) {
        schedules.push({ id: stableId('schedule', `${sourcePath}:${node.getStart(source)}`), sourcePath, line, kind: callee, symbol: enclosingFunction(node) });
      }
      if (sourcePath.startsWith('frontend/') && /^(?:fetch|api\.|apiClient\.|backendFetch|authedFetch)/.test(callee)) frontCalls.push({ id: stableId('frontend-call', `${sourcePath}:${node.getStart(source)}:${node.end}:${callee}`), sourcePath, line, callee });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const marker = /\b(?:TODO|FIXME|stub|placeholder|mock(?:ed)?|simulat(?:ed|ion|e)|coming\s+soon)\b/gi;
  for (const match of content.matchAll(marker)) {
    const line = source.getLineAndCharacterOfPosition(match.index).line + 1;
    const kind = match[0].toUpperCase().replace(/\s+/g, '_');
    findings.push({ id: stableId('finding', `${sourcePath}:${line}:${kind}:${match.index}`), sourcePath, line, kind });
  }
  const queueAdds = calls.filter(call => /\.add$/.test(call.callee)).map(call => {
    const receiver = call.callee.slice(0, -4);
    const initializer = variableInitializers.get(`${call.functionName}:${receiver}`);
    return { ...call, factory: initializer && ts.isCallExpression(initializer) ? text(initializer.expression, source) : null };
  });
  return { sourcePath, content, source, imports, symbols: sorted(symbols), registrations, queueDefinitions, calls, schedules, findings, frontCalls, tables: sorted(tables), ownership, queueAdds, exportFactoryCallee, providerHosts: sorted(providerHosts) };
}

function resolveImport(sourcePath, specifier, fileSet) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
  const base = specifier.startsWith('@/') ? `frontend/src/${specifier.slice(2)}` : posix.normalize(posix.join(posix.dirname(sourcePath), specifier));
  const stem = base.replace(/\.(?:[cm]?js)$/, '');
  return [base, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${stem}.jsx`, `${stem}.mjs`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`, `${base}/index.jsx`].find(candidate => fileSet.has(candidate)) ?? null;
}

function boundaries(item, pattern) {
  return sorted([...item.imports.flatMap(record => record.bindings), ...item.symbols].filter(symbol => pattern.test(symbol))).map(symbol => `${item.sourcePath}#${symbol}`);
}
function subsystem(path) {
  if (/\/routes\//.test(path)) return 'backend_routes';
  if (/\/publish\//.test(path)) return 'publishing';
  if (/\/integrations\//.test(path)) return 'integrations_actions_credentials';
  if (/\/storage\//.test(path)) return 'file_storage';
  if (/\/sandbox\/|browser/i.test(path)) return 'browser_sandbox';
  if (/\/operations\//.test(path)) return 'operations_approvals';
  if (/\/ai\/|\/synthesis\//.test(path)) return 'ai_execution';
  if (path.startsWith('frontend/')) return 'frontend';
  return 'backend_infrastructure';
}

export function buildCodeInventory(sourceEntries, entryRoots, knownPaths = []) {
  const analyzed = sourceEntries.map(({ sourcePath, content }) => analyzeSource(sourcePath, content));
  const byPath = new Map(analyzed.map(item => [item.sourcePath, item]));
  const fileSet = new Set([...byPath.keys(), ...knownPaths]), callers = new Map(), runtimeEdges = new Map();
  for (const item of analyzed) {
    runtimeEdges.set(item.sourcePath, []);
    for (const imported of item.imports) {
      const target = resolveImport(item.sourcePath, imported.specifier, fileSet);
      if (!target || imported.typeOnly) continue;
      runtimeEdges.get(item.sourcePath).push(target);
      if (!callers.has(target)) callers.set(target, []);
      callers.get(target).push(`${item.sourcePath}:${imported.line}`);
    }
  }
  const reachable = new Set(), rootsFor = new Map();
  for (const entry of entryRoots) {
    const pending = [entry], visited = new Set();
    while (pending.length) {
      const path = pending.pop();
      if (visited.has(path) || !byPath.has(path) || isTest(path)) continue;
      visited.add(path); reachable.add(path);
      if (!rootsFor.has(path)) rootsFor.set(path, []);
      rootsFor.get(path).push(entry);
      pending.push(...runtimeEdges.get(path));
    }
  }
  const allRegistrations = analyzed.filter(item => item.sourcePath.startsWith('backend/') && !isTest(item.sourcePath)).flatMap(item => item.registrations);
  const routes = [], mountedModules = new Set();
  const mountRouter = (sourcePath, prefix, inheritedAuth, chain, visited, factory = null) => {
    if (visited.has(sourcePath)) return;
    const item = byPath.get(sourcePath);
    if (!item) return;
    mountedModules.add(sourcePath);
    const nextVisited = new Set([...visited, sourcePath]);
    if (item.exportFactoryCallee) {
      const imported = item.imports.find(record => record.bindings.includes(item.exportFactoryCallee));
      const target = imported && resolveImport(sourcePath, imported.specifier, fileSet);
      if (target) mountRouter(target, prefix, inheritedAuth, [...chain, `${sourcePath}#default-factory:${item.exportFactoryCallee}`], nextVisited, item.exportFactoryCallee);
    }
    let moduleAuth = [...inheritedAuth];
    for (const registration of item.registrations) {
      if (factory && registration.functionName !== factory) continue;
      const ownAuth = registration.handlers.filter(handler => /auth|permission|ownership|admin|signature/i.test(handler));
      const auth = sorted([...moduleAuth, ...ownAuth]);
      const joined = `${prefix}/${registration.path ?? ''}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      const routePath = registration.path === null && registration.method !== 'use' ? `${prefix}/<dynamic:${registration.id}>` : joined;
      if (registration.method !== 'use' || (factory && registration.inlineResponse)) {
        const provenRegistration = registration.scope === 'module' || Boolean(factory);
        routes.push({ id: stableId('route', `${registration.id}:${prefix}`), registrationId: registration.id,
          sourcePath, line: registration.line, method: registration.method === 'use' ? 'ALL' : registration.method.toUpperCase(), path: registration.method === 'use' ? `${routePath}/*` : routePath,
          mountChain: chain, authBoundary: auth, reachable: provenRegistration,
          state: provenRegistration ? 'IMPLEMENTED_AND_REACHABLE' : 'IMPLEMENTED_BUT_UNVERIFIED',
          reason: factory ? 'Router factory invoked by an imported default export; terminal middleware traced, behavior must still be tested.' : registration.scope === 'module' ? 'Literal Express registration traced through mounts; behavior/security not proven by registration.' : 'Registration is conditional or inside a function; execution must be verified.' });
      }
      for (const handler of registration.handlers) {
        const imported = item.imports.find(record => record.bindings.includes(handler));
        const target = imported && resolveImport(sourcePath, imported.specifier, fileSet);
        if (target && (byPath.get(target)?.registrations.length || byPath.get(target)?.exportFactoryCallee)) mountRouter(target, joined, auth, [...chain, `${sourcePath}:${registration.line}`], nextVisited);
      }
      if (registration.method === 'use' && registration.path === null && ownAuth.length) moduleAuth = sorted([...moduleAuth, ...ownAuth]);
    }
  };
  if (byPath.has('backend/src/index.ts')) mountRouter('backend/src/index.ts', '', [], [], new Set());
  for (const registration of allRegistrations) {
    if (registration.method === 'use' || routes.some(route => route.registrationId === registration.id)) continue;
    routes.push({ id: stableId('route-unmounted', registration.id), registrationId: registration.id,
      sourcePath: registration.sourcePath, line: registration.line, method: registration.method.toUpperCase(),
      path: registration.path ?? '<dynamic>', mountChain: [], authBoundary: registration.handlers.filter(handler => /auth|permission|admin/i.test(handler)),
      reachable: false, state: 'DEAD_OR_UNREACHABLE', reason: 'No mount chain from backend/src/index.ts; not treated as a reachable endpoint.' });
  }
  const tests = analyzed.filter(item => isTest(item.sourcePath));
  const testCoverage = new Map();
  for (const test of tests) {
    for (const imported of test.imports) {
      const target = resolveImport(test.sourcePath, imported.specifier, fileSet);
      if (!target) continue;
      if (!testCoverage.has(target)) testCoverage.set(target, []);
      testCoverage.get(target).push(test.sourcePath);
    }
  }
  const surfaces = analyzed.filter(item => !isTest(item.sourcePath)).map(item => {
    const preview = /os-preview|osPreview|osCommand2|osFounderLab|RichResultFixtures/.test(item.sourcePath);
    const upcoming = item.content.includes('UpcomingCapabilitySection');
    const isReachable = reachable.has(item.sourcePath);
    const state = upcoming ? 'PLACEHOLDER' : preview ? 'PLACEHOLDER' : isReachable ? 'IMPLEMENTED_BUT_UNVERIFIED' : 'DEAD_OR_UNREACHABLE';
    return { id: stableId('surface', item.sourcePath), subsystem: subsystem(item.sourcePath), sourcePath: item.sourcePath,
      sha256: hash(item.content), symbols: item.symbols, imports: sorted(item.imports.map(record => record.specifier)),
      runtimeImports: sorted(runtimeEdges.get(item.sourcePath)), entryPoints: sorted(rootsFor.get(item.sourcePath) ?? []),
      callers: sorted(callers.get(item.sourcePath) ?? []), reachable: isReachable, persistenceDependencies: item.tables,
      externalProviderDependencies: sorted([...item.providerHosts.map(host => `declared-host:${host}`), ...item.imports.filter(record => !record.specifier.startsWith('.') && !record.specifier.startsWith('@/')).map(record => record.specifier)]),
      authBoundary: boundaries(item, /auth|identity|verify.*token|permission/i), tenantBoundary: item.ownership,
      approvalBoundary: boundaries(item, /approval|authoriz|confirm|digest|permission/i), costBoundary: boundaries(item, /budget|quota|cost|billing|reservation/i),
      evidenceBoundary: boundaries(item, /evidence|receipt|verif|checkpoint|reconcil|event/i),
      testCoverage: sorted([...(testCoverage.get(item.sourcePath) ?? []), ...[item.sourcePath.replace(/\.(tsx?|[cm]?js)$/, '.test.$1')].filter(path => fileSet.has(path))]),
      state, confidence: upcoming || preview ? 'HIGH' : isReachable ? 'MEDIUM' : 'LOW',
      reason: upcoming ? 'Upcoming capability presentation; operational backend not demonstrated.' : preview ? 'Explicit client demonstration/preview; does not prove real execution.' : isReachable ? 'Runtime import path traced from a registered entry point; source presence does not prove operational acceptance.' : 'No static runtime path from discovered entry roots; dynamic or external registration still requires review.',
      knownRisk: item.sourcePath.endsWith('/oauthPkceStore.ts') ? 'Raw OAuth/PKCE values persist in database and storage mirror; vault/TTL/one-use audit required.' : item.sourcePath.endsWith('/auth.ts') ? 'Some auth failures return internal configuration/error strings; public-error hardening required.' : item.findings.length ? 'Production source contains annotated mock/TODO/placeholder/simulation markers; individual findings classified separately.' : 'Live provider state and full security behavior not established by static inventory.',
      recommendedDisposition: isReachable ? 'KEEP; EXTEND evidence and security where acceptance review finds gaps' : 'KEEP; CANDIDATE_FOR_DEPRECATION only after dynamic-caller review',
      nextEvidenceNeeded: 'Relevant unit/integration journeys and deployment/runtime evidence; review indirect/dynamic dispatch before declaring unused.' };
  });
  const definitions = analyzed.flatMap(item => item.queueDefinitions.map(record => ({ ...record, sourcePath: item.sourcePath })));
  const queues = sorted(definitions.map(record => record.name ?? '<dynamic>')).map(name => {
    const entries = definitions.filter(record => (record.name ?? '<dynamic>') === name);
    const factories = entries.filter(record => record.kind === 'Queue').map(record => record.factory);
    const producers = analyzed.flatMap(item => item.queueAdds.filter(call => factories.includes(call.factory)).map(call => `${item.sourcePath}:${call.line}#${call.functionName}`));
    const consumers = entries.filter(record => record.kind === 'Worker').map(record => `${record.sourcePath}:${record.line}`);
    const refs = analyzed.flatMap(item => item.calls.filter(call => factories.includes(call.callee) && call.functionName !== call.callee).map(call => `${item.sourcePath}:${call.line}`));
    const isReachable = entries.some(record => reachable.has(record.sourcePath));
    return { id: stableId('queue', name), name, definitions: sorted(entries.map(record => `${record.sourcePath}:${record.line}`)), factorySymbols: sorted(factories),
      producers: sorted(producers), consumers: sorted(consumers), callers: sorted(refs),
      producerStatus: producers.length ? 'PRODUCER_CODE_PRESENT; caller activation must be verified' : 'NO_PRODUCER_FOUND',
      consumerStatus: consumers.length ? 'CONSUMER_CODE_PRESENT; registration must be verified' : 'NO_CONSUMER_FOUND',
      reachable: isReachable, state: !consumers.length ? 'PARTIAL' : 'IMPLEMENTED_BUT_UNVERIFIED',
      reason: !consumers.length ? 'Queue definition is not proof of active processing; no Worker consumer found in inspected source.' : 'Producer/consumer source recorded; runtime connectivity unverified.' };
  });
  const findings = analyzed.filter(item => !isTest(item.sourcePath)).flatMap(item => item.findings.map(finding => ({ ...finding,
    reachable: reachable.has(item.sourcePath), state: /os-preview|osPreview|osCommand2|RichResultFixtures/.test(item.sourcePath) ? 'PLACEHOLDER' : 'PARTIAL',
    reason: 'Static annotation/token occurrence; not automatically evidence of fake success. The enclosing behavior requires inspection.',
    nextEvidenceNeeded: 'Inspect the enclosing function/caller and execute its acceptance journey; keep intentional illustrative content labeled.' })));
  const testSuites = tests.map(item => ({ id: stableId('test-suite', item.sourcePath), sourcePath: item.sourcePath,
    declaredTests: item.calls.filter(call => /^(?:test|it|describe)(?:\.(?:skip|only|todo))?$/.test(call.callee)).length,
    skipLocations: item.calls.filter(call => /\.(?:skip|todo)$|^(?:xit|xdescribe)$/.test(call.callee)).map(call => `${item.sourcePath}:${call.line}`),
    focusLocations: item.calls.filter(call => /\.only$|^(?:fit|fdescribe)$/.test(call.callee)).map(call => `${item.sourcePath}:${call.line}`) }));
  const scheduledJobs = analyzed.filter(item => !isTest(item.sourcePath)).flatMap(item => item.schedules.map(record => ({ ...record,
    reachable: reachable.has(item.sourcePath), state: reachable.has(item.sourcePath) ? 'IMPLEMENTED_BUT_UNVERIFIED' : 'DEAD_OR_UNREACHABLE' })));
  return { surfaces, routeRegistrations: allRegistrations, routes, queues, findings, scheduledJobs, testSuites,
    frontendCallers: analyzed.flatMap(item => item.frontCalls.map(record => ({ ...record, reachable: reachable.has(item.sourcePath) }))),
    unresolved: analyzed.flatMap(item => item.imports.filter(record => (record.specifier.startsWith('.') || record.specifier.startsWith('@/')) && !resolveImport(item.sourcePath, record.specifier, fileSet)).map(record => `Unresolved local import ${item.sourcePath}:${record.line} -> ${record.specifier}`)),
  };
}

function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).trim(); }
const read = path => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
const outputs = ['docs/xroga/current-state.json', 'docs/xroga/current-state-schema.json', 'docs/xroga/current-state.md', 'docs/xroga/blockers.md'];
export function generateInventory({ refresh = false } = {}) {
  const sha = git(['rev-parse', 'HEAD']);
  const paths = git(['ls-files']).split(/\r?\n/).filter(Boolean).sort();
  // Include browser suites/test helpers outside src, not only application modules.
  const codePaths = paths.filter(path => inspected(path) || (codePattern.test(path) && isTest(path)));
  const sourceEntries = codePaths.map(sourcePath => ({ sourcePath, content: read(sourcePath) }));
  const workflows = paths.filter(path => /^\.github\/workflows\/.+\.ya?ml$/.test(path)).map(sourcePath => {
    const content = read(sourcePath);
    const refs = sorted([...content.matchAll(/(?:tsx|node)\s+(?:--\S+\s+)*([\w./-]+\.(?:ts|js|mjs))/g)].map(match => match[1]).filter(path => paths.includes(path)));
    return { id: stableId('workflow', sourcePath), sourcePath, sha256: hash(content), sourceEntrypoints: refs, hasSchedule: /\bcron:/.test(content) };
  });
  const roots = sorted(['backend/src/index.ts', ...codePaths.filter(path => /^frontend\/src\/(?:app\/(?:.*\/)?(?:page|layout|route|error|global-error|not-found|loading|template)\.tsx?|middleware\.ts)$/.test(path)),
    ...workflows.flatMap(workflow => workflow.sourceEntrypoints)]);
  const built = buildCodeInventory(sourceEntries, roots, paths);
  for (const workflow of workflows) {
    const content = read(workflow.sourcePath);
    for (const match of content.matchAll(/^\s*-?\s*cron:\s*['"]([^'"]+)['"]/gm)) {
      built.scheduledJobs.push({ id: stableId('workflow-schedule', `${workflow.sourcePath}:${match.index}`), sourcePath: workflow.sourcePath,
        line: content.slice(0, match.index).split('\n').length, kind: 'github-actions-cron', symbol: match[1], reachable: true, state: 'IMPLEMENTED_BUT_UNVERIFIED' });
    }
  }
  const previous = existsSync(resolve(root, outputs[0])) ? JSON.parse(read(outputs[0])) : null;
  const baseline = !refresh && previous ? previous.identity.sha : sha;
  const identity = previous?.identity.sha === baseline && !refresh ? previous.identity : {
    repository: git(['config', '--get', 'remote.origin.url']), branch: git(['branch', '--show-current']), sha: baseline,
    sourceTimestampUtc: git(['show', '-s', '--format=%cI', baseline]), auditStartedUtc: new Date().toISOString(),
    initialWorkingTreeState: 'Generation-base identity plus tracked file hashes describe this snapshot. Phase1 entry changes are preserved in PHASE-1-BASELINE.json; exact clean verification identity is recorded by immutable CI artifacts.',
    sourceTreeState: 'Tracked source read from working tree; source hashes recorded; CI rejects stale inventory.',
    node: process.version, npm: execFileSync(process.execPath, [npmCli(), '--version'], { encoding: 'utf8' }).trim(),
    lockfiles: paths.filter(path => /(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(path)),
    runtimeDeclarations: paths.filter(path => /(?:\.node-version|\.nvmrc|package\.json|Dockerfile[^/]*|workflows\/.+\.ya?ml)$/.test(path)),
  };
  const migrations = paths.filter(path => /^supabase\/migrations\/.+\.sql$/.test(path)).map((sourcePath, order) => ({
    id: stableId('migration', sourcePath), sourcePath, version: posix.basename(sourcePath).split('_')[0], order: order + 1, sha256: hash(read(sourcePath)),
  }));
  const families = [ ['execution_control_planes', /(?:taskGraphRunner|Orchestrator|operationsEngine|SoftwareAgentRuntime|runLifecycle)/],
    ['approval_contracts', /(?:businessAction|Confirmation|permissions|operationsEngine)/], ['cost_accounting', /(?:costLedger|providerBudget|quota|costCeiling|BillingService)/],
    ['credential_persistence', /(?:oauthPkceStore|githubTokenStore|Credentials|electronSecrets|chromeWebStore|apiKeyVault)/],
    ['browser_execution', /(?:browserbase|browserVerificationAdapter|flyMachineSandbox|remoteSandbox|runtimePreviewGateway)/],
    ['completion_semantics', /(?:runLifecycle|completion|verificationLifecycle|webVerificationGate|measuredEvidence)/] ];
  const duplicateCandidates = families.map(([family, pattern]) => ({ id: stableId('candidate', family), family,
    sourcePaths: built.surfaces.filter(surface => pattern.test(surface.sourcePath)).map(surface => surface.sourcePath),
    reason: 'Multiple related boundaries exist. This is a review candidate, not a conclusion that implementations are redundant; compare callers, authority, durability and evidence before changing architecture.', disposition: 'CANDIDATE_FOR_REVIEW' }));
  return validateInventory({ version: '1.0', identity, ...built, migrations, workflows, duplicateCandidates,
    requiredPaths: requiredPaths.map(sourcePath => ({ sourcePath, presence: paths.includes(sourcePath) ? 'PRESENT' : 'ABSENT',
      reason: paths.includes(sourcePath) ? 'Tracked repository path inspected; source/config boundaries recorded without environment values.' : 'Absent from tracked repository; no substitute silently created.' })),
    unresolved: sorted([...built.unresolved, 'Static imports do not prove provider availability or authorization correctness.',
      'Computed route paths, runtime registrations, Docker/worker commands and dynamic nonliteral imports require explicit manual reconciliation.',
      'No production credentials or customer data were read; live behavior remains unverified in this command.']),
  });
}

export function countsOf(inventory) {
  return { surfaces: inventory.surfaces.length, routeRegistrations: inventory.routeRegistrations.length,
    routes: inventory.routes.length, reachableRoutes: inventory.routes.filter(item => item.reachable).length,
    queues: inventory.queues.length, migrations: inventory.migrations.length, workflows: inventory.workflows.length,
    testSuites: inventory.testSuites.length, declaredTests: inventory.testSuites.reduce((sum, item) => sum + item.declaredTests, 0),
    classifiedMarkers: inventory.findings.length, reachableMarkers: inventory.findings.filter(item => item.reachable).length,
    absentRequiredPaths: inventory.requiredPaths.filter(item => item.presence === 'ABSENT').length, duplicateIds: 0 };
}
function renderMarkdown(inventory) {
  const counts = countsOf(inventory);
  const named = inventory.requiredPaths.map(item => `| ${item.sourcePath} | ${item.presence} | ${inventory.surfaces.find(surface => surface.sourcePath === item.sourcePath)?.state ?? (item.presence === 'ABSENT' ? 'UNKNOWN_BLOCKED' : 'INSPECTED_CONFIGURATION_OR_DOCUMENT')} |`).join('\n');
  return `# Xroga repository truth map\n\nSource SHA: \`${inventory.identity.sha}\`. Branch observed: \`${inventory.identity.branch}\`. Audit started: ${inventory.identity.auditStartedUtc}.\n\nThis inventory records static source and call-path evidence. A mounted endpoint is reachable in source; that does not certify live success, tenant safety, approval enforcement, or completion. All implementation surfaces retain an unverified/partial/placeholder state until their own acceptance tests establish behavior. No architecture was replaced and no production operations were performed.\n\n## Counts\n\n${Object.entries(counts).map(([key, value]) => `- ${key}: ${value}`).join('\n')}\n\n## Required paths\n\n| Path | Presence | Classification |\n| --- | --- | --- |\n${named}\n\n## Queue processing\n\n${inventory.queues.map(item => `- **${item.name}**: ${item.producerStatus}; ${item.consumerStatus}. Definitions: ${item.definitions.join(', ')}. ${item.reason}`).join('\n')}\n\n## Review candidates\n\n${inventory.duplicateCandidates.map(item => `- **${item.family}**: ${item.sourcePaths.join(', ')}. ${item.reason}`).join('\n')}\n\n## Reproduction\n\n\`node scripts/xroga/inventory.mjs\` generates the JSON, schema and summary from tracked source. \`--check\` validates the canonical schema, registered IDs, required paths, all registrations and source/config drift without writing. \`--refresh\` updates the audit identity for a deliberately re-audited HEAD. Run \`node --test scripts/xroga/inventory.test.mjs\` for positive and adversarial fixtures.\n\nThe JSON includes every discovered registration, source module, scheduler, migration, workflow, queue, frontend API call, test suite, focused/skipped test call, and marker location. Markers are recorded without source payloads and classified for review; a comment is not proof that a feature is simulated. Import reachability is conservative and does not treat type-only imports as executable calls.\n\n## Limitations and next evidence\n\n${inventory.unresolved.map(item => `- ${item}`).join('\n')}\n`;
}
function renderBlockers(inventory) {
  return `# Repository evidence gaps\n\nSource SHA: \`${inventory.identity.sha}\`. These are pre-existing findings, not changes made by Command 001.\n\n- OAuth credentials and PKCE state persist in \`oauthPkceStore.ts\` database fields and a storage mirror. Command 009 must establish encryption, expiry and one-use semantics with verified KMS before cutover.\n- Auth middleware can return internal configuration/error text. Repair and test safe public errors in Command 007.\n- Queue definitions have no discovered Worker consumers; do not call notifications/token distribution/email/swarm processing active from queue names alone.\n- \`taskGraphRunner.ts\` has no discovered production caller. The reachable software-agent/synthesis paths must be traced before choosing the canonical integration surface.\n- Task/run/operations/business-action/cost/credential/browser boundaries overlap. Review candidates are not permission to delete or rewrite them.\n- Upcoming Automations and Library presentations are not evidence of real workflow, employee, pack or Drive backends.\n- Migration history mixes short numeric/alphanumeric and timestamp prefixes. Preserve actual installer ordering and verify clean/upgrade compatibility in Command 003.\n- Installed runtime/toolchain and old AGENTS descriptions differ; reproduce from lockfiles in Command 003.\n\n## Absent named paths\n\n${inventory.requiredPaths.filter(item => item.presence === 'ABSENT').map(item => `- ${item.sourcePath}: ${item.reason}`).join('\n')}\n\n## Unresolved static evidence\n\n${inventory.unresolved.map(item => `- ${item}`).join('\n')}\n`;
}
export function serializedOutputs(inventory) {
  return new Map([[outputs[0], json(inventory)], [outputs[1], json(jsonSchema)], [outputs[2], renderMarkdown(inventory)], [outputs[3], renderBlockers(inventory)]]);
}
export function main(args = process.argv.slice(2)) {
  const inventory = generateInventory({ refresh: args.includes('--refresh') });
  const generated = serializedOutputs(inventory);
  if (args.includes('--check')) {
    const previous = validateInventory(JSON.parse(read(outputs[0])));
    if (JSON.stringify(jsonSchema) !== JSON.stringify(JSON.parse(read(outputs[1])))) throw new Error('Committed JSON schema differs from the canonical validation boundary.');
    for (const [path, content] of generated) if (!existsSync(resolve(root, path)) || read(path).replace(/\r\n/g, '\n') !== content) throw new Error(`Inventory drift: ${path}; re-audit and regenerate before merging.`);
    const repeated = serializedOutputs(generateInventory());
    for (const [path, content] of generated) if (repeated.get(path) !== content) throw new Error(`Non-deterministic output: ${path}`);
    console.log(JSON.stringify({ result: 'PASS', sourceSha: previous.identity.sha, checks: ['canonical-schema', 'unique-ids', 'registrations', 'named-paths', 'source-drift', 'deterministic-regeneration'], counts: countsOf(inventory) }));
  } else {
    for (const [path, content] of generated) { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), content); }
    console.log(JSON.stringify({ result: 'GENERATED_NOT_YET_VERIFIED', sourceSha: inventory.identity.sha, counts: countsOf(inventory) }));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
