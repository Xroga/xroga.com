// Xroga browser job runtime (INFRA-007). Runs INSIDE the hardened browser container as the non-root browser user.
//
// Protocol: JSON lines. The host writes {"type":"start", job, plan, launch} first, then any number of {"type":"llm-reply"} or
// {"type":"cancel"}. This process writes {"type":"progress"}, {"type":"llm"} (a model request for the host to serve) and exactly one
// {"type":"result"} or {"type":"error"}. Nothing else is printed to stdout; diagnostics go to stderr, never page content or secrets.
//
// The host has already validated the job (browserJob.ts), the plan (browserPlan.ts) and the launch options (chromiumLaunch.ts). This
// runtime still re-checks everything it can enforce locally, because it is the last point before the page:
//   - every navigation and redirect hop must stay inside job.allowedOrigins (the egress proxy enforces the same list at the network);
//   - navigation, redirect, page and response-byte counters stop the job when a limit is reached;
//   - artifacts are bounded by job.limits.maxArtifactBytes before they leave the container;
//   - AI steps never hold a model key: Stagehand's ClientLLM callback forwards each request to the host, which reserves budget,
//     calls Xroga's model route and returns the measured usage; when the host refuses (no budget, no route) the step fails closed.
import { createInterface } from 'node:readline';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const debug = process.env.XROGA_WORKER_DEBUG === '1' ? (m) => process.stderr.write(`[runJob] ${String(m).slice(0, 400)}
`) : () => {};
const out = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const fail = (code, reason) => { out({ type: 'error', code, reason: String(reason).slice(0, 300) }); };

const lines = createInterface({ input: process.stdin });
const waiters = new Map();
let startMsg; let cancelled = false; let onCancel = () => {};
const started = new Promise((resolve) => { lines.on('line', (raw) => {
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (m.type === 'start' && !startMsg) { startMsg = m; resolve(m); }
  else if (m.type === 'llm-reply' && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  else if (m.type === 'cancel') { cancelled = true; onCancel(); }
}); });

class JobStop extends Error { constructor(code, reason) { super(reason); this.code = code; } }

const ARTIFACT_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain', '.csv': 'text/plain', '.html': 'text/html', '.pdf': 'application/pdf' };
const mediaTypeOf = (name) => ARTIFACT_TYPES[(/\.[A-Za-z0-9]+$/.exec(name) || [''])[0].toLowerCase()];

async function main() {
  const { job, plan, launch } = await started;
  const t0 = Date.now();
  const allowed = new Set(job.allowedOrigins);
  const inScope = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && allowed.has(x.origin); } catch { return false; } };
  const counters = { navigations: 0, redirects: 0, pages: 0, responseBytes: 0, artifactBytes: 0, consequentialActions: 0, llmCalls: 0 };
  const visited = [];
  const artifacts = [];
  const extracted = {};
  const stepLog = [];
  let violation = null;
  const stopWith = (code, reason) => { violation ??= new JobStop(code, reason); };

  const aiMode = plan.steps.some((s) => s.op.startsWith('ai'));
  // Phase 2 policy: DevTools over a pipe only. AI mode is the single exception, declared by the host-built launch options (loopback port,
  // no --remote-allow-origins); this runtime never adds flags of its own.
  const context = await chromium.launchPersistentContext(launch.userDataDir, {
    headless: true, chromiumSandbox: true, proxy: launch.proxy, args: launch.args, env: launch.env, downloadsPath: launch.downloadsPath,
    acceptDownloads: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, timeout: launch.timeout,
    ...(launch.channel ? { channel: launch.channel } : {}), ...(launch.ignoreDefaultArgs ? { ignoreDefaultArgs: launch.ignoreDefaultArgs } : {}), ...(launch.executablePath ? { executablePath: launch.executablePath } : {}),
    viewport: { width: 1280, height: 800 }, serviceWorkers: 'block',
  });
  onCancel = () => { stopWith('CANCELLED', 'cancelled by the host'); context.close().catch(() => {}); };
  if (cancelled) onCancel();

  // every request: navigations must be in scope; everything is counted. The proxy enforces the same origins for all traffic.
  await context.route('**/*', async (route) => {
    const req = route.request();
    // Public browser execution is read-only. A page's event handler, a model's
    // action label or a serialized writeGrant cannot issue canonical authority.
    // Block unmarked form/fetch/beacon effects before sending any request body.
    if (violation || cancelled) return route.abort('blockedbyclient');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      stopWith('RESULT_OUT_OF_SCOPE', 'State-changing browser requests require canonical action admission.');
      return route.abort('blockedbyclient');
    }
    if (req.isNavigationRequest()) {
      if (!inScope(req.url())) { stopWith('RESULT_OUT_OF_SCOPE', 'a navigation left the allowed scope'); return route.abort('blockedbyclient'); }
      if (req.frame() === req.frame().page().mainFrame()) {
        counters.navigations += 1;
        if (counters.navigations > job.limits.maxNavigations) { stopWith('RESULT_OVER_LIMIT', 'navigation limit reached'); return route.abort('blockedbyclient'); }
      }
    }
    if (req.isNavigationRequest()) {
      // BrowserContext socket routing doesn't cover dedicated-worker sockets.
      // Keep page JavaScript and DOM reads, but refuse unadmitted child workers
      // through a response CSP that also applies to blob/srcdoc descendants.
      // A separate policy intersects the site's CSP, it never relaxes it.
      let response;
      try {
        response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
        const body = await response.body();
        if (body.length > job.limits.maxResponseBytes) { stopWith('RESULT_OVER_LIMIT', 'document byte limit reached'); return route.abort('blockedbyclient'); }
        if (violation || cancelled) return route.abort('blockedbyclient');
        const headers = response.headers();
        headers['content-security-policy'] = (headers['content-security-policy'] ? headers['content-security-policy'] + ', ' : '') + "worker-src 'none'";
        return await route.fulfill({ response, headers, body });
      } catch {
        stopWith('RESULT_OUT_OF_SCOPE', 'Document admission could not be verified.');
        return route.abort('blockedbyclient');
      } finally { await response?.dispose().catch(() => {}); }
    }
    return route.continue();
  });
  // Routed sockets are never connected to the server. An opaque interactive
  // channel cannot borrow a read-only task's navigation or model authority.
  await context.routeWebSocket('**/*', async (socket) => {
    stopWith('RESULT_OUT_OF_SCOPE', 'Browser socket writes require canonical action admission.');
    await socket.close({ code: 1008, reason: 'Canonical action admission required' });
  });
  context.on('requestfinished', (req) => {
    req.sizes().then((s) => {
      counters.responseBytes += Math.max(0, s.responseBodySize) + Math.max(0, s.responseHeadersSize);
      if (counters.responseBytes > job.limits.maxResponseBytes) { stopWith('RESULT_OVER_LIMIT', 'response byte limit reached'); context.close().catch(() => {}); }
    }, () => {});
    if (req.isNavigationRequest()) {
      let hops = 0; for (let r = req.redirectedFrom(); r; r = r.redirectedFrom()) hops += 1;
      counters.redirects = Math.max(counters.redirects, hops);
      if (hops > job.limits.maxRedirects) stopWith('RESULT_OVER_LIMIT', 'redirect limit reached');
    }
  });
  // Playwright's route hook does not see redirect hops; the egress proxy refuses an out-of-scope hop at the network. Name that refusal
  // precisely instead of reporting a generic navigation failure.
  context.on('requestfailed', (req) => { if (req.isNavigationRequest() && !inScope(req.url())) stopWith('RESULT_OUT_OF_SCOPE', 'a navigation or redirect left the allowed scope'); });
  context.on('page', (p) => {
    counters.pages += 1;
    if (counters.pages > job.limits.maxPages) { stopWith('RESULT_OVER_LIMIT', 'page limit reached'); p.close().catch(() => {}); }
  });

  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) { const u = f.url(); if (u !== 'about:blank') { visited.push(u); if (!inScope(u)) stopWith('RESULT_OUT_OF_SCOPE', 'the page ended outside the allowed scope'); } } });
  const deadline = setTimeout(() => { stopWith('JOB_TIMEOUT', 'the job exceeded its time limit'); context.close().catch(() => {}); }, Math.max(1_000, job.limits.maxDurationMs - 2_000));

  let stagehand = null;
  let modelRefusal = null;
  const ensureStagehand = async () => {
    if (stagehand) return stagehand;
    const { localBrowser, Stagehand } = await import('@browserbasehq/stagehand');
    // the host chose the port and the launch policy validated it together with its bypass and origin rule; nothing else is accepted
    const port = Number((launch.args.find((a) => a.startsWith('--remote-debugging-port=')) ?? '').split('=')[1]);
    if (!Number.isSafeInteger(port) || port < 20_000 || port > 59_999) throw new JobStop('WORKER_FAILED', 'AI mode launched without its DevTools port');
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) { ready = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok, () => false); if (!ready) await new Promise((r) => setTimeout(r, 100)); }
    if (!ready) throw new JobStop('WORKER_FAILED', 'DevTools did not come up');
    debug(`devtools port ${port}`);
    const browser = await localBrowser.connect({ cdpUrl: `http://127.0.0.1:${port}` });
    debug('stagehand connected');
    let seq = 0;
    stagehand = await Stagehand.create({
      browser,
      // the model never runs here: each request goes to the host, which owns the budget, the route and the key
      model: { generate: (params) => new Promise((resolve, reject) => {
        if (violation) return reject(violation);
        const id = ++seq; counters.llmCalls += 1;
        waiters.set(id, (m) => { if (m.ok) return resolve(m.result); modelRefusal = m.code || 'MODEL_REFUSED'; reject(new JobStop(modelRefusal, m.reason || 'the host refused the model request')); });
        out({ type: 'llm', id, params });
      }) },
      selfHeal: false, cache: false,
      logging: { level: process.env.XROGA_WORKER_DEBUG === '1' ? 'debug' : 'error', format: 'json', onLog: (e) => debug(`stagehand ${JSON.stringify(e)}`) },
    });
    debug('stagehand created');
    return stagehand;
  };
  const shPage = async (sh) => { const pages = await sh.browser.context.pages(); return pages.find((p) => p.url() === page.url()) ?? pages[0]; };

  // one selector, or up to three alternatives tried in order: the first that is present on the page is used (markup-change recovery)
  const pick = async (selector) => {
    const list = Array.isArray(selector) ? selector : [selector];
    for (const [k, one] of list.entries()) {
      const loc = page.locator(one);
      if (k === list.length - 1) return loc;
      if (await loc.first().isVisible().catch(() => false)) return loc;
      if (await loc.first().waitFor({ state: 'visible', timeout: 1_500 }).then(() => true, () => false)) return loc;
    }
    return page.locator(list[0]);
  };
  const runFallback = async (fb, name) => {
    const loc = await pick(fb.selector);
    if (fb.op === 'click') { await loc.first().click(); await page.waitForLoadState('domcontentloaded').catch(() => {}); return; }
    if (fb.all) { const n = Math.min(await loc.count(), 500); const vals = []; for (let i = 0; i < n; i++) vals.push(textOf(await loc.nth(i).innerText())); extracted[name] = vals; }
    else extracted[name] = (await loc.count()) ? textOf(await loc.first().innerText()) : null;
  };
  const fallbacks = [];
  const check = () => { if (violation) throw violation; if (cancelled) throw new JobStop('CANCELLED', 'cancelled by the host'); };
  const textOf = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 2_000);

  try {
    // Stagehand's act() runs inside the world its extension injects at navigation; a page loaded before the extension never gets it and
    // act() waits forever. Attach first whenever the plan has an AI step, so the start navigation already carries the extension world.
    if (plan.steps.some((s) => s.op.startsWith('ai'))) await ensureStagehand();
    await page.goto(job.startUrl, { waitUntil: 'domcontentloaded' });
    check();
    for (const [index, step] of plan.steps.entries()) {
      check();
      out({ type: 'progress', index, op: step.op });
      switch (step.op) {
        case 'goto': await page.goto(step.url, { waitUntil: 'domcontentloaded' }); break;
        case 'click':
          await (await pick(step.selector)).first().click();
          if (step.consequential) counters.consequentialActions += 1;
          await page.waitForLoadState('domcontentloaded').catch(() => {});
          break;
        case 'fill': await (await pick(step.selector)).first().fill(step.value); break;
        case 'select': await (await pick(step.selector)).first().selectOption(step.value); break;
        case 'press':
          await (await pick(step.selector)).first().press(step.key);
          if (step.consequential) counters.consequentialActions += 1;
          await page.waitForLoadState('domcontentloaded').catch(() => {});
          break;
        case 'pause': await new Promise((r) => setTimeout(r, step.ms)); break;
        case 'scroll': await page.evaluate((to) => window.scrollTo(0, to === 'top' ? 0 : document.body.scrollHeight), step.to); break;
        case 'waitFor':
          if (step.selector) await (await pick(step.selector)).first().waitFor({ state: 'visible', timeout: step.timeoutMs });
          else await page.waitForURL((u) => u.href.startsWith(step.urlPrefix), { timeout: step.timeoutMs });
          break;
        case 'extractText': {
          const loc = await pick(step.selector);
          if (step.all) {
            const n = Math.min(await loc.count(), 500);
            const vals = [];
            for (let i = 0; i < n; i++) vals.push(textOf(step.attribute ? await loc.nth(i).getAttribute(step.attribute) : await loc.nth(i).innerText()));
            extracted[step.name] = vals;
          } else {
            const first = loc.first();
            extracted[step.name] = (await loc.count()) ? textOf(step.attribute ? await first.getAttribute(step.attribute) : await first.innerText()) : null;
          }
          break;
        }
        case 'screenshot': {
          const bytes = await page.screenshot({ fullPage: !!step.fullPage, type: 'png' });
          counters.artifactBytes += bytes.length;
          if (counters.artifactBytes > job.limits.maxArtifactBytes) throw new JobStop('RESULT_OVER_LIMIT', 'artifact byte limit reached');
          artifacts.push({ name: step.name.endsWith('.png') ? step.name : `${step.name}.png`, mediaType: 'image/png', bytes: Buffer.from(bytes).toString('base64') });
          break;
        }
        case 'download': {
          const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), (await pick(step.selector)).first().click()]);
          if (!inScope(dl.url())) throw new JobStop('RESULT_OUT_OF_SCOPE', 'a download came from outside the allowed scope');
          const mediaType = mediaTypeOf(step.name);
          if (!mediaType) throw new JobStop('ARTIFACT_REJECTED', 'the download name has an unsupported type');
          const target = join(launch.downloadsPath, step.name);
          await mkdir(launch.downloadsPath, { recursive: true });
          await dl.saveAs(target);
          const size = (await stat(target)).size;
          counters.artifactBytes += size;
          if (size === 0 || counters.artifactBytes > job.limits.maxArtifactBytes) throw new JobStop('RESULT_OVER_LIMIT', 'the download is empty or exceeds the artifact budget');
          artifacts.push({ name: step.name, mediaType, bytes: (await readFile(target)).toString('base64') });
          break;
        }
        case 'upload': {
          const file = join(launch.userDataDir, `upload-${index}-${step.fileName}`);
          await writeFile(file, step.content);
          await (await pick(step.selector)).first().setInputFiles(file);
          break;
        }
        case 'aiObserve': {
          const sh = await ensureStagehand();
          const r = await sh.observe(step.instruction, { page: await shPage(sh) });
          extracted[step.name] = (r.data ?? []).slice(0, 50).map((a) => ({ selector: String(a.selector ?? '').slice(0, 300), description: textOf(a.description), method: String(a.method ?? '').slice(0, 30) }));
          break;
        }
        case 'aiAct': {
          modelRefusal = null;
          try {
            const sh = await ensureStagehand();
            const r = await sh.act(step.instruction, { page: await shPage(sh) });
            if (step.consequential) counters.consequentialActions += 1;
            if (r?.data?.success === false) throw new JobStop('WORKER_FAILED', 'the AI action did not succeed');
          } catch (e) {
            // the deterministic fallback runs only when the MODEL ROUTE refused (no route, no budget, unmeasured), never to override an answer
            if (!step.fallback || !modelRefusal) throw e;
            fallbacks.push({ index, reason: modelRefusal });
            await runFallback(step.fallback, null);
          }
          await page.waitForLoadState('domcontentloaded').catch(() => {});
          break;
        }
        case 'aiExtract': {
          modelRefusal = null;
          try {
            const sh = await ensureStagehand();
            const { z } = await import('zod');
            const shape = {};
            for (const [k, t] of Object.entries(step.fields)) shape[k] = t === 'number' ? z.number() : t === 'boolean' ? z.boolean() : t === 'string[]' ? z.array(z.string()) : z.string();
            const r = await sh.extract(step.instruction, z.object(shape), { page: await shPage(sh) });
            extracted[step.name] = r.data ?? null;
          } catch (e) {
            if (!step.fallback || !modelRefusal) throw e;
            fallbacks.push({ index, reason: modelRefusal });
            await runFallback(step.fallback, step.name);
          }
          break;
        }
        default: throw new JobStop('JOB_INVALID', 'unknown step');
      }
      check();
      if (page.url() !== 'about:blank' && !inScope(page.url())) throw new JobStop('RESULT_OUT_OF_SCOPE', 'the page ended outside the allowed scope');
      stepLog.push({ index, op: step.op, ok: true });
    }
    check();
    out({ type: 'result', result: {
      finalUrl: page.url(), visitedUrls: [...new Set(visited)].slice(0, job.limits.maxNavigations), navigations: counters.navigations, responseBytes: counters.responseBytes,
      summary: `${plan.steps.length} steps completed`, extracted, artifacts, steps: stepLog,
      metrics: { fallbacks, elapsedMs: Date.now() - t0, redirects: counters.redirects, pages: counters.pages, consequentialActions: counters.consequentialActions, llmCalls: counters.llmCalls },
    } });
  } catch (e) {
    const err = violation ?? e;
    fail(err instanceof JobStop ? err.code : 'WORKER_FAILED', err instanceof JobStop ? err.message : `step failed: ${String(err?.message ?? err).split('\n')[0]}`);
  } finally {
    clearTimeout(deadline);
    if (stagehand) await stagehand.close().catch(() => {});
    await context.close().catch(() => {});
    lines.close();
  }
}

main().catch((e) => { fail('WORKER_FAILED', e?.message ?? e); process.exitCode = 1; });
