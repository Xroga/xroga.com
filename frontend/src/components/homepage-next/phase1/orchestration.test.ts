import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HOP,
  LEAD,
  LOOP,
  ORDER,
  PHRASE_MS,
  SIGNAL,
  SOURCE_SET,
  STATIC_AT,
  SWAP_AT,
  SWAP_MS,
  VIGNETTES,
  frameAt,
  frameKey,
  heroActions,
  perfTime,
  routesOf,
  sceneStart,
  toolRoutes,
  vignette,
  type VignetteId,
} from './orchestration';
import { COMMANDS, COMMANDS_MOBILE, COPY, MODE_TITLE, PHRASES, PHRASES_MOBILE, PLAN, SOURCE_COPY, VALIDATION, WORK_COPY } from './copy';
import { demoVisible, onBlur, onFocus, onType, submission, RESUME_AFTER_BLUR_MS } from './commandLogic';
import { MARKS } from './providerMarks';
import { DESTINATIONS } from './destinationMarks';

const dir = new URL('./', import.meta.url);
const read = (f: string) => readFileSync(new URL(f, dir), 'utf8');

const allCopy = (): string[] => {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') out.push(String((v as (n: number) => string)(6)));
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  [COPY, MODE_TITLE, PHRASES, PHRASES_MOBILE, COMMANDS, COMMANDS_MOBILE, SOURCE_COPY, PLAN, VALIDATION, WORK_COPY].forEach(walk);
  return out;
};

/** First-pass clock time of a moment inside a scene. */
const timeOf = (id: VignetteId, local: number) => sceneStart(id) + local;
/** Every 25 ms across two full loops after the first pass (deterministic: frames are pure functions of time). */
function* twoLoops(step = 25) {
  for (let c = 0; c < LOOP + 2 * (LOOP - LEAD); c += step) yield c;
}

/* ---------- copy ---------- */

test('copy: the H1 exactly, no stale headline, no eyebrow or support paragraph, no proof line', () => {
  assert.equal(COPY.title, 'Xroga for everything.');
  assert.ok(!('eyebrow' in COPY) && !('support' in COPY) && !('titleLines' in COPY), 'eyebrow and support paragraph removed');
  assert.ok(!('proof' in COPY) && !('qualifier' in COPY), 'the integrations proof line is gone');
  const heroCss = read('S00Hero.module.css');
  const titleRule = heroCss.slice(heroCss.indexOf('.title {'), heroCss.indexOf('}', heroCss.indexOf('.title {')));
  assert.ok(!/gradient|background-clip/.test(titleRule), 'no gradient on the H1 text itself');
  assert.match(titleRule, /color: #e6e3dc/);
  const hero = read('S00Hero.tsx');
  assert.match(hero, /<h1 id="s00-title" className=\{s\.title\}>\s*\{\/\*[^*]*\*\/\}\s*<TitleText \/>\s*<\/h1>/, 'the H1 is the title alone');
  assert.match(hero, /COPY\.title\.slice\(0, COPY\.title\.lastIndexOf\(' '\)\)/);
  // the rendered text is exactly the title: brand word + rest of the first line + space + last word
  assert.match(hero, /const BRAND = COPY\.title\.slice\(0, COPY\.title\.indexOf\(' '\)\);/);
  assert.match(hero, /<span className=\{s\.brand\}>\{BRAND\}<\/span>\s*\{TITLE\[0\]\.slice\(BRAND\.length\)\}\s*<\/span>\{' '\}\s*<span>\{TITLE\[1\]\}<\/span>/);
  const brand = COPY.title.slice(0, COPY.title.indexOf(' '));
  const line = COPY.title.slice(0, COPY.title.lastIndexOf(' '));
  assert.equal(`${brand}${line.slice(brand.length)} ${COPY.title.slice(COPY.title.lastIndexOf(' ') + 1)}`, 'Xroga for everything.');
  const src = ['copy.ts', 'S00Hero.tsx', 'Capability.tsx', 'Stage.tsx', 'WorkObject.tsx', 'CommandBar.tsx', 'Toolset.tsx'].map(read).join('\n');
  for (const stale of ['Build. Run. Grow.', 'Give Xroga the outcome', 'It executes the digital work', 'The AI execution layer for digital work', 'AI that gets the work done', 'Xroga handles the whole job', 'AI execution workspace', 'integrations available', 'Connect tools when the job needs them', 'shown from']) {
    assert.ok(!src.includes(stale), `stale copy: ${stale}`);
  }
  const banned = /unlock|supercharge|reimagine|seamless|effortless|next-generation|all-in-one|future of work|everything you need|limitless|anything is possible|infinite possibilities/i;
  for (const s of allCopy()) {
    assert.ok(!/[—–]/.test(s), `long dash in "${s}"`);
    assert.ok(!banned.test(s), `stock phrase in "${s}"`);
  }
});

test('copy: weak hero prompts from earlier drafts are gone', () => {
  const text = allCopy().join('\n');
  for (const weak of ['Plan this trip', 'Analyze these files and tell me what changed', 'Turn this screenshot into a working page', 'Web3 dashboard']) {
    assert.ok(!text.includes(weak), weak);
  }
});

test('release targets are named correctly and never promise approval', () => {
  assert.deepEqual(Object.values(DESTINATIONS).map((d) => d.name), ['Chrome Web Store', 'App Store', 'Google Play']);
  assert.equal(WORK_COPY.platforms.ready, 'Ready to submit to all three stores');
  const text = allCopy().join('\n');
  assert.ok(!/Play Store/.test(text), 'the Chrome Web Store is not the Play Store');
  assert.ok(!/approved by (Apple|Google)|live in the (App|Play) Store/i.test(text));
});

test('no unverified scheduling claims', () => {
  assert.ok(!/24\/7|while you sleep|every (day|morning) at|scheduled/i.test(allCopy().join('\n')));
});

test('research sources are evidence, never connected integrations', () => {
  const text = [...Object.values(SOURCE_COPY).flatMap((c) => Object.values(c)), MODE_TITLE.sources].join('\n');
  assert.ok(!/connect|install|authori[sz]e|integration|provider/i.test(text), text);
  const toolset = read('Toolset.tsx');
  const source = toolset.slice(toolset.indexOf('function Source('), toolset.indexOf('function Plan('));
  assert.ok(!/COPY\.connect/.test(source), 'source tiles never say "Connect to use"');
});

/* ---------- sequence and timing ---------- */

test('final scene sequence: seven scenes, one loop, no separate rest', () => {
  assert.deepEqual([...ORDER], ['saas', 'qa', 'clinic', 'research', 'platforms', 'cleanup', 'growth']);
  assert.equal(VIGNETTES.length, 7);
  assert.deepEqual([...ORDER].sort(), VIGNETTES.map((v) => v.id).sort());
  const src = read('orchestration.ts');
  assert.ok(!/REST\b|kind: 'rest'|settled/.test(src), 'no rest segment in the timeline');
  for (let c = 0; c < LOOP * 3; c += 100) assert.ok(frameAt(c).vignette !== null || c < LEAD, `no scene at ${c}`);
});

test('cadence: scenes run about 5 to 8.5 s, the loop about 35 to 45 s', () => {
  for (const v of VIGNETTES) assert.ok(v.len >= 4800 && v.len <= 8500, `${v.id} runs ${v.len} ms`);
  assert.ok(vignette('cleanup').len >= 5800 && vignette('cleanup').len <= 6500, 'cleanup has room for its data story');
  // the capability phrase changes with the scene: most hold about 5 to 6 s, none but QA more than 6.5 s
  for (const v of VIGNETTES) if (v.id !== 'qa') assert.ok(v.len <= 6500, `${v.id} phrase holds ${v.len} ms`);
  assert.ok(vignette('qa').len <= 8000, 'QA keeps its full causal chain without idle holds');
  assert.ok(VIGNETTES.filter((v) => v.len >= 4800 && v.len <= 6000).length >= 5, 'most phrases change every 4.8 to 6 s');
  const span = LOOP - LEAD;
  assert.ok(span >= 35000 && span <= 45000, `loop ${span} ms`);
  const mean = span / VIGNETTES.length;
  assert.ok(mean >= 5000 && mean <= 6450, `mean scene ${mean} ms`);
});

test('readable dwell: states hold at least 650 ms and every scene ends on a held result', () => {
  for (const v of VIGNETTES) {
    const ats = v.steps.map((s) => s.at);
    for (let i = 1; i < ats.length; i++) assert.ok(ats[i] - ats[i - 1] >= 400, `${v.id}: ${v.steps[i].fx} only ${ats[i] - ats[i - 1]} ms after the last state`);
    // left-side status changes are never closer than 650 ms (the 400 ms QA pair changes the panel, not the status line)
    const gaps = ats.slice(1).map((a, i) => a - ats[i]).filter((g) => g < 650);
    assert.ok(gaps.length <= 1, `${v.id} has ${gaps.length} fast changes`);
    assert.ok(v.len - ats[ats.length - 1] >= 900, `${v.id}: final result held only ${v.len - ats[ats.length - 1]} ms`);
  }
});

test('no empty panel: the work object appears with Xroga and its first state lands as it unfolds', () => {
  for (const v of VIGNETTES) {
    assert.ok(v.steps[0].at - v.createAt <= 150, `${v.id}: first state ${v.steps[0].at - v.createAt} ms after the object appears`);
    for (let local = 0; local < v.len; local += 25) {
      const f = frameAt(timeOf(v.id, local));
      if (f.work === v.id) assert.ok(local >= v.createAt, `${v.id} object shown before Xroga forms it (${local})`);
      if (f.work === v.id && local >= v.steps[0].at) assert.ok(f.effects.length > 0, `${v.id} empty at ${local}`);
    }
  }
  for (const c of twoLoops(50)) {
    const f = frameAt(c);
    if (f.work && f.work !== 'brief' && f.work === f.vignette) {
      const v = vignette(f.work);
      assert.ok(f.local < v.steps[0].at || f.effects.length > 0, `empty ${f.work} at ${c}`);
    }
  }
});

test('cause before effect: the object never changes before the intent has reached Xroga', () => {
  for (const v of VIGNETTES) assert.ok(v.steps[0].at > v.intentAt + 750, `${v.id}: first change before the intent arrives`);
});

/* ---------- phrases ---------- */

test('rotator: fixed lead and the seven final phrases, plus phone variants', () => {
  assert.equal(COPY.lead, 'One workspace to');
  assert.deepEqual(PHRASES, {
    saas: 'build production software',
    qa: 'test and repair product flows',
    clinic: 'automate real business operations',
    research: 'research, compare and decide',
    platforms: 'ship across web, Chrome, iOS and Android',
    cleanup: 'keep important work running',
    growth: 'grow what you launch',
  });
  assert.deepEqual(Object.keys(PHRASES_MOBILE).sort(), Object.keys(PHRASES).sort());
  assert.equal(`${COPY.lead} ${COPY.reducedPhrase}`, 'One workspace to build, operate and keep work moving');
});

test('rotator: the phrase always belongs to the scene on stage, across two loops', () => {
  for (const c of twoLoops(50)) {
    const f = frameAt(c);
    if (f.vignette) assert.equal(f.phrase, f.vignette, `phrase ${f.phrase} during ${f.vignette} at ${c}`);
    else assert.equal(f.phrase, 'saas', 'the first pass opens on the SaaS phrase');
    if (f.prevPhrase) assert.ok(f.local < PHRASE_MS && f.prevPhrase !== f.phrase, `mask out of window at ${c}`);
  }
});

test('one H1 shine system: a CSS band over a static base, none under reduced motion, no phrase shine', () => {
  const css = read('S00Hero.module.css');
  const hero = read('S00Hero.tsx');
  assert.ok(!/\.sheen\b/.test(css + hero + read('Capability.tsx')), 'the old custom sheen is gone');
  const anim = css.match(/animation: shine ([\d.]+)s cubic-bezier\([^)]*\) ([\d.]+)s infinite;/);
  assert.ok(anim, 'one band on a repeating cycle');
  const [cycle, delay] = [Number(anim![1]), Number(anim![2])];
  assert.ok(cycle >= 3.2 && cycle <= 3.6, `shine cycle ${cycle}s`);
  assert.ok(delay >= 0.5 && delay <= 0.8, `first shine after ${delay}s`);
  const kf = css.match(/@keyframes shine \{\s*0% \{ background-position: 85% 0; \}\s*([\d.]+)%, 100% \{ background-position: 15% 0; \}\s*\}/);
  assert.ok(kf, 'one continuous pass, then a rest');
  const pass = (Number(kf![1]) / 100) * cycle;
  assert.ok(pass >= 1.0 && pass <= 1.3, `one pass takes ${pass.toFixed(2)}s`);
  assert.ok(cycle - pass >= 1.8 && cycle - pass <= 2.2, `rest ${(cycle - pass).toFixed(2)}s`);
  // Xroga Display: bundled Inter at its display size, heavier brand word, verified features only
  const title = css.slice(css.indexOf('.title {'), css.indexOf('}', css.indexOf('.title {')));
  assert.match(title, /font-variation-settings: 'opsz' 32;/);
  assert.match(title, /font-feature-settings: 'ss07' 1, 'cv11' 1;/);
  const brandWeight = Number(css.match(/\.brand \{ font-weight: (\d+);/)![1]);
  const restWeight = Number(title.match(/font-weight: (\d+);/)![1]);
  assert.ok(brandWeight >= 650 && brandWeight <= 720 && restWeight >= 560 && restWeight <= 620 && brandWeight > restWeight, 'Xroga stronger than the rest');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.shine \{ display: none; \}/);
  assert.match(css, /:global\(\.xv-home-coding\) \.hero h1\.title \{ color: #e6e3dc !important; \}/, 'the homepage ink rule cannot wash the base out');
  assert.match(hero, /\{!reduced && \(\s*<span className=\{`\$\{s\.title\} \$\{s\.shine\}`\} aria-hidden="true">/);
  const shineRule = css.slice(css.indexOf('.shine {'), css.indexOf('}', css.indexOf('.shine {')));
  assert.ok(!/opacity|filter|text-shadow/.test(shineRule), 'the band never dims the base or glows');
  assert.ok(!/#(?:[0-9a-f]{6})/i.test(shineRule.replace(/#ffffff/gi, '')), 'the core is white');
  // the band: transparent, shoulder, core, shoulder, transparent; shoulders stay faint, and it is wide enough to see
  const stops = [...shineRule.matchAll(/(transparent|#ffffff|rgba\([^)]*\))\s+([\d.]+)%/g)].map((m) => [m[1], Number(m[2])] as const);
  const visible = stops.filter(([c]) => c !== 'transparent');
  const width = (visible[visible.length - 1][1] - visible[0][1]) * 3; // % of the element width (300% background)
  assert.ok(width >= 12 && width <= 22, `band spans ${width}% of the line`);
  for (const [c] of visible) {
    const m = c.match(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/);
    if (!m) continue;
    const [r, g, b, a] = m.slice(1).map(Number);
    // ice shoulders stay soft, and the spectral cyan and violet stay faint, so the band still reads as white light
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > 12) assert.ok(a <= 0.6, `tinted shoulder ${c} too strong`);
    if (spread > 40) assert.ok(a <= 0.3, `spectral shoulder ${c} too strong`);
  }
});

/* ---------- right side ---------- */

test('right-side mode per scene: tools for external jobs, sources for research, plan for cleanup', () => {
  const modes = Object.fromEntries(VIGNETTES.map((v) => [v.id, v.mode]));
  assert.deepEqual(modes, { saas: 'tools', qa: 'tools', clinic: 'tools', research: 'sources', platforms: 'tools', cleanup: 'plan', growth: 'tools' });
  assert.deepEqual(MODE_TITLE, { tools: 'Tools for this job', sources: 'Research sources', plan: 'Cleanup plan' });
  assert.deepEqual([...SOURCE_SET], ['x', 'reddit', 'google', 'web']);
  assert.deepEqual(PLAN.map((p) => p.kind), ['Duplicate', 'Email', 'Normalize', 'Review']);
  // each row shows what changes, not only the task name
  for (const p of PLAN) assert.ok(p.from && p.to && (p.from as string) !== (p.to as string), `${p.fx} shows its change`);
  assert.deepEqual(PLAN.map((p) => p.fx), ['merged', 'fixed', 'normalized', 'held']);
});

test('no stale right-side mode: the mode follows the scene, the old one leaves only during the swap', () => {
  for (const c of twoLoops()) {
    const f = frameAt(c);
    if (!f.vignette) continue;
    const v = vignette(f.vignette);
    if (f.local >= SWAP_AT) assert.equal(f.mode, v.mode, `${f.vignette} shows ${f.mode} at ${c}`);
    if (f.prevMode) assert.ok(f.local >= SWAP_AT && f.local < SWAP_AT + SWAP_MS && f.prevMode !== f.mode, `stale ${f.prevMode} at ${c}`);
    if (f.mode !== 'tools') assert.equal(f.set.length, 0, `tool rack under ${f.mode} at ${c}`);
    if (f.mode !== 'sources') assert.equal(f.found.length + f.reading.length, 0, `sources lit outside research at ${c}`);
    if (f.mode === 'tools' && f.local >= SWAP_AT) assert.deepEqual([...f.set], [...v.set], `old rack at ${c}`);
  }
  const toolset = read('Toolset.tsx');
  assert.match(toolset, /data-provider=\{state === 'out' \? undefined : id\}/, 'a leaving tool is never an endpoint');
  assert.match(toolset, /data-source=\{live \? id : undefined\}/, 'a leaving source is never an endpoint');
});

/* ---------- action model and routing ---------- */

test('action model: every step is one HeroAction; native actions have no provider or source and never route', () => {
  for (const v of VIGNETTES) {
    const actions = heroActions(v);
    assert.equal(actions.length, v.steps.length);
    for (const a of actions) assert.ok(!(a.providerId && a.sourceId), `${a.id} names both`);
    const natives = actions.filter((a) => a.providerId === null && a.sourceId === null);
    assert.ok(natives.length >= 1, `${v.id} has native work`);
    for (const a of natives) assert.ok(!routesOf(v).some((r) => r.id === a.id), `${a.id} routes without a target`);
    for (const r of routesOf(v)) {
      const a = actions.find((x) => x.id === r.id)!;
      assert.equal(r.target, a.providerId ?? a.sourceId, 'route and action name the same target');
      assert.equal(r.at, a.at);
      assert.notEqual(a.capability, 'native', `${a.id} is native but calls out`);
    }
  }
});

test('native research: no provider is touched; sources feed Xroga, which compares and ranks', () => {
  const v = vignette('research');
  const actions = heroActions(v);
  assert.ok(actions.every((a) => a.providerId === null), 'no provider in research');
  assert.deepEqual(actions.filter((a) => a.sourceId).map((a) => a.sourceId), ['x', 'reddit', 'google']);
  for (const fx of ['plan', 'compare', 'rank']) assert.equal(actions.find((a) => a.resultState === fx)!.sourceId, null, fx);
  // the ranked result comes from Xroga after every source has answered
  const lastSource = Math.max(...actions.filter((a) => a.sourceId).map((a) => a.at));
  assert.ok(actions.find((a) => a.resultState === 'rank')!.at > lastSource);
  assert.equal(v.steps[v.steps.length - 1].fx, 'rank');
});

test('native cleanup: no provider and no source; every transformation is Xroga handing over its own result', () => {
  const v = vignette('cleanup');
  for (const a of heroActions(v)) {
    assert.equal(a.providerId, null, a.id);
    assert.equal(a.sourceId, null, a.id);
  }
  assert.equal(routesOf(v).length, 0);
  assert.deepEqual(v.set, []);
  for (const p of PLAN) assert.ok(v.steps.some((s) => s.fx === p.fx && s.hop), `${p.fx} is a native hand-off through Xroga`);
  assert.deepEqual(allFx(v), ['scanned', 'found', 'merged', 'fixed', 'normalized', 'held', 'validated'], 'scan, find, transform, validate');
  for (const c of twoLoops(50)) {
    const f = frameAt(c);
    if (f.vignette === 'cleanup') assert.equal(f.active.length + f.reading.length + f.routes.length, 0, `cleanup lit something at ${c}`);
  }
});

test('dental order: Google Calendar books, HubSpot updates the CRM, Gmail sends the follow-up', () => {
  const tools = toolRoutes(vignette('clinic'));
  assert.deepEqual(tools.map((r) => [r.action.resultState, r.target]), [
    ['booked', 'googlecalendar'],
    ['crm', 'hubspot'],
    ['followup', 'gmail'],
  ]);
});

test('provider routing matches the work: no unrelated provider for a micro-step', () => {
  const allowed: Record<string, Record<string, string[]>> = {
    saas: { auth: ['supabase'], database: ['supabase'], payments: ['stripe'], 'source-control': ['github'], monitoring: ['sentry'], deployment: ['vercel'] },
    qa: { payments: ['stripe'], monitoring: ['sentry'], 'source-control': ['github'], deployment: ['vercel'] },
    clinic: { crm: ['hubspot'], calendar: ['googlecalendar'], email: ['gmail'] },
    platforms: { 'source-control': ['github'], database: ['supabase'], monitoring: ['sentry'], deployment: ['vercel'] },
    growth: { seo: ['semrush'], analytics: ['posthog'], growth: ['googleads'], crm: ['hubspot'], email: ['mailchimp'] },
  };
  for (const v of VIGNETTES) {
    for (const a of heroActions(v)) {
      if (a.providerId === null) continue;
      assert.ok(allowed[v.id]?.[a.capability]?.includes(a.providerId), `${a.id}: ${a.capability} via ${a.providerId}`);
    }
  }
  // browser work in QA is Xroga's own: it never lights a provider
  for (const a of heroActions(vignette('qa'))) if (a.capability === 'browser') assert.equal(a.providerId, null, a.id);
});

test('each tool scene has a distinct command, work object and six-tool set from the catalog', () => {
  assert.equal(new Set(VIGNETTES.map((v) => COMMANDS[v.id])).size, 7);
  for (const v of VIGNETTES.filter((x) => x.mode === 'tools')) {
    assert.equal(v.set.length, 6, v.id);
    assert.equal(new Set(v.set).size, 6, `${v.id} duplicates`);
    for (const p of v.set) assert.ok(p in MARKS, `${v.id}: ${p}`);
    for (const r of toolRoutes(v)) assert.ok(v.set.slice(0, 4).includes(r.target as never), `${v.id} uses ${r.target} outside the first four (tablet)`);
  }
  for (const v of VIGNETTES) assert.equal(frameAt(timeOf(v.id, v.len - 100)).work, v.id);
});

test('lit target is always the route endpoint, sampled every 25 ms across two loops', () => {
  let routed = 0;
  for (const c of twoLoops()) {
    const f = frameAt(c);
    for (const p of f.active) assert.ok(f.routes.some((r) => r.kind === 'tool' && r.target === p), `${p} lit without a route at ${c}`);
    for (const s of f.reading) assert.ok(f.routes.some((r) => r.kind === 'source' && r.target === s), `${s} read without a route at ${c}`);
    for (const r of f.routes) {
      routed++;
      if (r.kind === 'tool') assert.ok(f.set.includes(r.target as never) && f.mode === 'tools', `${r.target} not in the shown rack at ${c}`);
      else assert.ok(f.mode === 'sources' && SOURCE_SET.includes(r.target as never), `${r.target} not a shown source at ${c}`);
      assert.ok(r.id.endsWith(`-${r.result}`), `${r.id} lands ${r.result}`);
      assert.ok(r.id.startsWith(`${f.vignette}-`), `route ${r.id} outlives its scene at ${c}`);
    }
    assert.ok(f.active.length <= 3 && f.reading.length <= 3);
  }
  assert.ok(routed > 1000, 'routes were sampled');
  const stage = read('Stage.tsx');
  assert.match(stage, /const pool = r\.kind === "tool" \? geo\.providers : geo\.sources;\s*const end = pool\[r\.target\];/, 'the endpoint is looked up by the same id');
  assert.match(stage, /\[data-provider\]/);
  assert.match(stage, /\[data-source\]/);
});

test('density: at most 3 visible signal paths at once', () => {
  for (const c of twoLoops()) {
    const f = frameAt(c);
    const paths =
      (f.intent ? 1 : 0) +
      (f.createLine ? 1 : 0) +
      (f.hop ? 1 : 0) +
      f.routes.reduce((n, r) => n + (r.age < 900 ? 1 : 0) + (r.age >= 850 ? 1 : 0), 0);
    assert.ok(paths <= 3, `${paths} signal paths at ${c}`);
  }
});

test('signal grammar: call reaches the target, the answer returns, the result lands 100 to 250 ms after arrival', () => {
  assert.ok(SIGNAL.call >= 450 && SIGNAL.call <= 700, 'call 450 to 700 ms');
  const settle = SIGNAL.land - SIGNAL.arrive;
  assert.ok(settle >= 100 && settle <= 250, `change ${settle} ms after the result arrives`);
  for (const v of VIGNETTES) {
    for (const r of routesOf(v)) {
      assert.equal(r.at - r.start, SIGNAL.land, r.id);
      const lit = (local: number) => {
        const f = frameAt(timeOf(v.id, local));
        return r.kind === 'tool' ? f.active.includes(r.target as never) : f.reading.includes(r.target as never);
      };
      assert.ok(lit(r.start + 20), `${r.id} not selected at the call`);
      assert.ok(lit(r.start + SIGNAL.call + 20), `${r.id} not lit on arrival`);
      // lit until its answer is back, or until the next call takes the selection, and never shorter than 650 ms
      const next = routesOf(v).find((o) => o.start > r.start)?.start ?? Infinity;
      const until = Math.min(r.start + SIGNAL.back + 100, next - 20);
      assert.ok(until - r.start >= 650, `${r.id} is lit for only ${until - r.start} ms`);
      assert.ok(lit(until), `${r.id} must stay lit until ${until - r.start} ms`);
      if (next < Infinity) assert.ok(!lit(next - r.start + r.start + 20), `${r.id} still lit after the next call starts`);
      assert.ok(!frameAt(timeOf(v.id, r.at - 20)).effects.includes(r.action.resultState), `${r.id} early`);
      assert.ok(frameAt(timeOf(v.id, r.at + 20)).effects.includes(r.action.resultState), `${r.id} missing`);
    }
  }
});

test('a target is already visible when Xroga selects it: no route before the swap settles', () => {
  for (const v of VIGNETTES) for (const r of routesOf(v)) assert.ok(r.start >= SWAP_AT + SWAP_MS, `${r.id} starts at ${r.start} during the swap`);
});

test('native hand-off lands just before the change it carries', () => {
  for (const v of VIGNETTES) {
    for (const s of v.steps.filter((x) => x.hop)) {
      assert.equal(frameAt(timeOf(v.id, s.at - 100)).hop, `${v.id}-${s.fx}`);
      assert.equal(frameAt(timeOf(v.id, s.at - HOP.before - 30)).hop === `${v.id}-${s.fx}`, false);
    }
  }
});

test('browser QA: test, failure, diagnosis after the failure, repair, re-test, verification, release', () => {
  const qa = vignette('qa');
  const at = (fx: string) => qa.steps.find((s) => s.fx === fx)!.at;
  const order = ['start', 'failed', 'isolated', 'repaired', 'committed', 'paid', 'verified', 'released'].map(at);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  const presses = (qa.cursor ?? []).filter(([, p]) => p === 'press').map(([t]) => t);
  assert.equal(presses.length, 2, 'the same control is pressed before and after the repair');
  assert.ok(presses[0] < at('failed') && presses[1] > at('repaired'));
  const route = (fx: string) => toolRoutes(qa).find((r) => r.action.resultState === fx)!;
  assert.ok(route('isolated').start >= at('failed'), 'Sentry is called only once the failure exists');
  assert.ok(route('paid').start >= presses[1], 'Stripe is called only after the second press');
  assert.ok(route('committed').start >= route('isolated').start + SIGNAL.back, 'the fix is committed only once the diagnosis is back');
  assert.ok(route('committed').start >= at('repaired'), 'GitHub carries the commit of a repair Xroga already made, not the repair');
  assert.equal(heroActions(qa).find((a) => a.resultState === 'repaired')!.providerId, null, 'the repair itself is native');
});

test('orb reactions are event-linked: a ring on intent, on the first returning answer and on completion', () => {
  for (const v of VIGNETTES) {
    const at = (local: number) => frameAt(timeOf(v.id, local));
    assert.equal(at(v.intentAt + 750).wave?.kind, 'in', `${v.id} intent ring`);
    const [first, ...rest] = routesOf(v);
    if (first) assert.equal(at(first.start + SIGNAL.back + 100).wave?.kind, 'back', `${first.id} return ring`);
    // every other answer still makes Xroga react: the connect beat as it returns
    for (const r of rest) {
      const f = at(r.start + SIGNAL.back);
      assert.ok(['connect', 'verify'].includes(f.orb) || f.wave?.kind === 'done', `${r.id}: no reaction on return (${f.orb})`);
    }
    assert.equal(at(v.steps[v.steps.length - 1].at + 100).wave?.kind, 'done', `${v.id} completion ring`);
  }
  // no constant pulse: most of the loop has no ring
  let rings = 0;
  let n = 0;
  for (const c of twoLoops(100)) {
    n++;
    if (frameAt(c).wave) rings++;
  }
  assert.ok(rings / n < 0.5, `rings on ${Math.round((rings / n) * 100)}% of frames`);
  const css = read('XrogaOrb.module.css');
  assert.match(css, /\.wave \{[\s\S]*?animation: wave 900ms/);
  assert.ok(!/\.wave[^{]*\{[^}]*infinite/.test(css), 'rings never loop');
});

test('store destinations are outputs, never providers', () => {
  const ids = new Set(VIGNETTES.flatMap((v) => [...v.set, ...toolRoutes(v).map((r) => r.target)]));
  for (const store of Object.keys(DESTINATIONS)) assert.ok(!ids.has(store), `${store} shown as a provider`);
  assert.equal(heroActions(vignette('platforms')).find((a) => a.resultState === 'destinations')!.providerId, null);
});

test('a scene change reconfigures command, object, right side and orb together', () => {
  const t0 = timeOf('qa', 0);
  const f = frameAt(t0 + 600);
  assert.equal(f.prompt, COMMANDS.qa);
  assert.ok(f.turn);
  assert.ok(f.prevSet, 'rack swaps during the turn');
  assert.equal(frameAt(t0 + 100).leaving, 'saas', 'the previous object folds into Xroga');
  const r = frameAt(timeOf('research', 600));
  assert.equal(r.mode, 'sources');
  assert.equal(r.prevMode, 'tools');
  assert.deepEqual([...(r.prevSet ?? [])], [...vignette('clinic').set], 'the dental tools leave as one layer');
});

/* ---------- motion preferences, clock and bar ---------- */

test('reduced motion shows browser QA, verified and release ready, with no routes', () => {
  const f = frameAt(STATIC_AT);
  assert.equal(f.vignette, 'qa');
  assert.ok(f.effects.includes('verified') && f.effects.includes('released'));
  assert.equal(f.routes.length, 0);
  const hero = read('S00Hero.tsx');
  assert.match(hero, /!reduced && !bgOff &&/, 'WebGL slats only when motion is allowed');
  const css = read('S00Hero.module.css');
  assert.match(css, /\.fallback \{[\s\S]*?#15171b[\s\S]*?#050506/, 'static black titanium field');
  assert.ok(!/#173B36|#C4F1E7|#06090A/i.test(hero + css), 'no emerald palette left');
  const clock = read('useOrchestration.ts');
  assert.match(clock, /if \(reduced\) \{[\s\S]*?frameAt\(STATIC_AT\)/, 'one fixed frame, no clock');
});

test('later passes restart at the first scene without the headline lead', () => {
  assert.equal(perfTime(LOOP + 10).firstPass, false);
  assert.equal(frameAt(LOOP + 10).vignette, 'saas');
  assert.equal(frameAt(LOOP + 10).leaving, 'growth', 'the loop is continuous: growth folds into the next SaaS');
  assert.equal(frameKey(frameAt(timeOf('saas', 5600))), frameKey(frameAt(timeOf('saas', 5650))), 'a quiet moment does not re-render');
});

test('one orchestration clock: no intervals, and only the clock and the background own a frame loop', () => {
  for (const f of ['S00Hero.tsx', 'Stage.tsx', 'WorkObject.tsx', 'Toolset.tsx', 'CommandBar.tsx', 'XrogaOrb.tsx', 'useOrchestration.ts', 'XrogaSlats.tsx']) {
    const src = read(f);
    assert.ok(!/setInterval\(/.test(src), `${f} uses setInterval`);
    if (/requestAnimationFrame\(/.test(src)) assert.ok(['useOrchestration.ts', 'XrogaSlats.tsx'].includes(f), `${f} runs its own frame loop`);
  }
});

test('no stale anchors: lines are measured from the live layout and re-measured per job and mode', () => {
  const stage = read('Stage.tsx');
  assert.match(stage, /getBoundingClientRect/);
  assert.match(stage, /new ResizeObserver/);
  assert.match(stage, /\[count, barRef, frame\.vignette, frame\.set, frame\.mode, routeKey\]/);
  assert.ok(!/M\d+ \d+ C/.test(stage), 'no hard-coded path coordinates');
});

test('mobile shows shorter display versions of the same seven commands', () => {
  assert.deepEqual(Object.keys(COMMANDS_MOBILE).sort(), Object.keys(COMMANDS).sort());
  for (const [id, m] of Object.entries(COMMANDS_MOBILE)) {
    assert.ok(m.length <= 100, `${id} mobile prompt too long`);
    assert.ok(m.length < COMMANDS[id as keyof typeof COMMANDS].length, `${id} not shorter`);
  }
});

test('command bar: focus or typing pauses only the demo text; the stage clock never reads bar state', () => {
  let s = { value: '', focused: false, resumeAt: 0 };
  assert.equal(demoVisible(s, 0), true);
  s = onFocus(s);
  assert.equal(demoVisible(s, 0), false);
  s = onType(s, 'Ship my app');
  s = onBlur(s, 1000);
  assert.equal(demoVisible(s, 99999), false, 'typed text is never covered by the demo');
  assert.equal(s.value, 'Ship my app');
  let e = onBlur(onFocus({ value: '', focused: false, resumeAt: 0 }), 1000);
  assert.equal(demoVisible(e, 1000 + RESUME_AFTER_BLUR_MS - 1), false);
  assert.equal(demoVisible(e, 1000 + RESUME_AFTER_BLUR_MS), true, 'demo resumes about 2 s after an empty blur');
  e = onType(e, '');
  assert.equal(frameAt.length, 1);
  const src = read('useOrchestration.ts');
  assert.ok(!/CommandBar|focused|value/.test(src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')), 'clock independent of input');
});

test('submit hands the exact prompt to the real workspace route; empty submit opens a fresh workspace', () => {
  assert.deepEqual(submission('  Ship it  ', true), { prompt: '  Ship it  ', route: '/workspace' });
  assert.deepEqual(submission('Ship it', false), { prompt: 'Ship it', route: '/auth/signup' });
  assert.deepEqual(submission('   ', true), { prompt: null, route: '/workspace' });
  const bar = read('CommandBar.tsx');
  assert.match(bar, /localStorage\.setItem\(PENDING_PROMPT_KEY, prompt\)/, 'existing hand-off, nothing in the URL');
  assert.ok(!/router\.push\([^)]*prompt/.test(bar));
});

test('review controls (?at, ?from, ?bg) never reach the production homepage', () => {
  const clock = read('useOrchestration.ts');
  assert.match(clock, /process\.env\.NODE_ENV === 'production' && !window\.location\.pathname\.startsWith\('\/lab\/'\)\) return null/);
  for (const f of ['S00Hero.tsx', 'useOrchestration.ts', 'Stage.tsx', 'CommandBar.tsx', 'Capability.tsx']) {
    const direct = read(f).match(/new URLSearchParams\(window\.location\.search\)/g)?.length ?? 0;
    assert.ok(direct <= (f === 'useOrchestration.ts' ? 1 : 0), `${f} reads URL parameters outside reviewParam`);
  }
});

/* ---------- semantic routing: the right tool for the action, not only a matching wire ---------- */

const allFx = (v: (typeof VIGNETTES)[number]) => v.steps.map((s) => s.fx);

test('semantic map: every external action names the expected capability and provider', () => {
  const expected: Record<string, [string, string]> = {
    'saas-auth': ['auth', 'supabase'],
    'saas-billing': ['payments', 'stripe'],
    'saas-repo': ['source-control', 'github'],
    'saas-live': ['deployment', 'vercel'],
    'qa-isolated': ['monitoring', 'sentry'],
    'qa-committed': ['source-control', 'github'],
    'qa-paid': ['payments', 'stripe'],
    'qa-released': ['deployment', 'vercel'],
    'clinic-booked': ['calendar', 'googlecalendar'],
    'clinic-crm': ['crm', 'hubspot'],
    'clinic-followup': ['email', 'gmail'],
    'platforms-core': ['database', 'supabase'],
    'platforms-built': ['source-control', 'github'],
    'growth-search': ['seo', 'semrush'],
    'growth-funnel': ['analytics', 'posthog'],
    'growth-launched': ['email', 'mailchimp'],
  };
  const external = VIGNETTES.flatMap(heroActions).filter((a) => a.providerId !== null);
  assert.deepEqual(external.map((a) => a.id).sort(), Object.keys(expected).sort(), 'no external action without an explicit expectation');
  for (const a of external) assert.deepEqual([a.capability, a.providerId], expected[a.id], a.id);
});

test('semantic map: native actions touch no provider and no source', () => {
  const native: Record<string, string[]> = {
    saas: ['shell'],
    qa: ['start', 'failed', 'repaired', 'verified'],
    clinic: ['inquiry', 'qualified'],
    research: ['plan', 'compare', 'rank'],
    platforms: ['inspected', 'variants', 'destinations'],
    cleanup: ['scanned', 'found', 'merged', 'fixed', 'normalized', 'held', 'validated'],
    growth: ['audit', 'constraint'],
  };
  for (const v of VIGNETTES) {
    const n = heroActions(v).filter((a) => a.providerId === null && a.sourceId === null).map((a) => a.resultState);
    assert.deepEqual(n, native[v.id], v.id);
  }
});

test('semantic map: research sources are sources, never providers', () => {
  const sources = heroActions(vignette('research')).filter((a) => a.sourceId !== null);
  assert.deepEqual(sources.map((a) => [a.id, a.providerId, a.sourceId]), [
    ['research-x', null, 'x'],
    ['research-reddit', null, 'reddit'],
    ['research-google', null, 'google'],
  ]);
  for (const v of VIGNETTES) if (v.id !== 'research') assert.ok(heroActions(v).every((a) => a.sourceId === null), v.id);
});

test('semantic map: tools shown but not needed are never called', () => {
  const unused: Record<string, string[]> = {
    saas: ['linear', 'cloudflare'],
    qa: ['zendesk', 'mixpanel'],
    clinic: ['calendly', 'intercom', 'asana'],
    platforms: ['figma', 'neon', 'railway', 'openai'],
    growth: ['googleads', 'instagram', 'youtube'],
  };
  for (const [id, tools] of Object.entries(unused)) {
    const called = toolRoutes(vignette(id as VignetteId)).map((r) => r.target);
    for (const t of tools) assert.ok(!called.includes(t), `${id} calls ${t}`);
  }
});

test('one selection at a time: only the newest call is lit; an older call fades as a superseded trace', () => {
  for (const c of twoLoops()) {
    const f = frameAt(c);
    assert.ok(f.active.length + f.reading.length <= 1, `${f.active.length + f.reading.length} targets selected at ${c}`);
    const current = f.routes.filter((r) => !r.superseded);
    assert.ok(current.length <= 1, `two current routes at ${c}`);
    for (const r of f.routes.filter((x) => x.superseded)) {
      assert.ok(!f.active.includes(r.target as never) && !f.reading.includes(r.target as never), `superseded ${r.target} still lit at ${c}`);
    }
    for (const t of [...f.active, ...f.reading]) assert.ok(current.some((r) => r.target === t), `${t} lit without its current route at ${c}`);
  }
  const css = read('Stage.module.css');
  assert.match(css, /\.lines g\[data-superseded\] \{ opacity: 0\.14; \}/);
  assert.match(read('Stage.tsx'), /data-superseded=\{r\.superseded \|\| undefined\}/);
});

test('hierarchy: a previously used tool never keeps the active cyan edge or light', () => {
  const css = read('Toolset.module.css');
  const usedRules = [...css.matchAll(/([^{}]*data-used[^{}]*)\{([^}]*)\}/g)].filter(([, sel]) => !/data-active/.test(sel));
  assert.ok(usedRules.length >= 2);
  for (const [, sel, body] of usedRules) assert.ok(!/101, 229, 244|translate3d/.test(body), `${sel.trim()} looks active`);
  assert.match(css, /\.unit\[data-active\] \{[\s\S]*?rgba\(101, 229, 244, 0\.7\)/, 'the current call has the strongest edge');
});

test('header: restyled for the homepage only, without touching its transform', () => {
  const css = read('s00-header.css');
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter((r) => r && !r.startsWith('@media'));
  for (const r of rules) {
    const sel = r.replace(/^@media[^{]*\{/, '').split('{')[0].trim();
    if (!sel) continue;
    for (const one of sel.split(',')) assert.ok(one.trim().startsWith('.xv-public-marketing-shell:has(.xv-home-coding)'), `unscoped: ${one.trim()}`);
  }
  assert.ok(!/transform\s*:/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'the header keeps its own centring and scroll-hide transform');
  assert.ok(!/#(?:1f4dff|3a5cff)|rgba\(5[0-9], 8[0-9], 255/i.test(css), 'no blue header surface');
  assert.match(read('S00Hero.tsx'), /import '\.\/s00-header\.css';/);
});

test('cause before the next call: a call leaves only once the previous answer is back in Xroga', () => {
  for (const v of VIGNETTES) {
    const rs = routesOf(v);
    for (let i = 1; i < rs.length; i++) {
      assert.ok(rs[i].start - rs[i - 1].start >= SIGNAL.back + 50, `${rs[i].id} leaves ${rs[i].start - rs[i - 1].start} ms after ${rs[i - 1].id}`);
      // when the next call reaches its target, the previous result is already on the work object
      const f = frameAt(timeOf(v.id, rs[i].start + SIGNAL.call));
      assert.ok(f.effects.includes(rs[i - 1].action.resultState), `${rs[i].id} arrives before ${rs[i - 1].id} has landed`);
    }
  }
});

test('breadth: rack cards are real catalog integrations, varied across scenes, and display-only unless a step calls them', () => {
  const catalog = readFileSync(new URL('../../../lib/integrations-catalog.ts', import.meta.url), 'utf8');
  const tools = VIGNETTES.filter((v) => v.mode === 'tools');
  for (const v of tools) {
    for (const p of v.set) assert.ok(catalog.includes(`"name": "${MARKS[p].catalogName}"`), `${v.id}: ${p} is not in the integration catalog`);
    // the tools a step really calls lead the rack, so they are visible on tablets too
    const called = new Set(toolRoutes(v).map((r) => r.target));
    assert.ok(v.set.slice(0, called.size).every((p) => called.has(p)), `${v.id}: called tools must come first`);
  }
  for (let i = 0; i < tools.length; i++) {
    for (let j = i + 1; j < tools.length; j++) {
      const shared = tools[i].set.filter((p) => tools[j].set.includes(p));
      assert.ok(shared.length <= 3, `${tools[i].id} and ${tools[j].id} share ${shared.join(', ')}`);
    }
  }
  const distinct = new Set(tools.flatMap((v) => v.set));
  assert.ok(distinct.size >= 20, `only ${distinct.size} distinct integrations across the loop`);
  // display-only cards are never lit and never an endpoint
  for (const c of twoLoops(50)) {
    const f = frameAt(c);
    if (!f.vignette || vignette(f.vignette).mode !== 'tools') continue;
    const called = new Set(toolRoutes(vignette(f.vignette)).map((r) => r.target));
    for (const p of [...f.active, ...f.used, ...f.routes.map((r) => r.target)]) assert.ok(called.has(p as never), `${p} shown as used at ${c}`);
  }
});

test('phrase change is quick: about 350 to 450 ms, through the existing mask, with no phrase shine', () => {
  assert.ok(PHRASE_MS >= 350 && PHRASE_MS <= 450, `${PHRASE_MS} ms`);
  const css = read('S00Hero.module.css');
  const out = Number(css.match(/\.phrase\[data-leg='out'\] \{ animation: phraseOut (\d+)ms/)![1]);
  const inn = css.match(/\.phrase\[data-leg='in'\] \{ animation: phraseIn (\d+)ms [^)]*\) (\d+)ms both;/)!;
  const settled = Number(inn[1]) + Number(inn[2]);
  assert.ok(out <= 300, `old phrase leaves in ${out} ms`);
  assert.ok(settled >= 350 && settled <= 450, `new phrase settles at ${settled} ms`);
  assert.ok(settled <= PHRASE_MS, 'the mask window covers the whole change');
});
