import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CYCLES, LOOP, PHRASE_MS, REST, SIGNAL, STATIC_AT, SWAP_AT, SWAP_MS, VIGNETTES, frameAt, frameKey, heroActions, perfTime, toolRoutes, vignette } from './orchestration';
import { COMMANDS, COMMANDS_MOBILE, COPY, PHRASES, PHRASES_MOBILE, SECONDARY, WORK_COPY } from './copy';
import { demoVisible, onBlur, onFocus, onType, submission, RESUME_AFTER_BLUR_MS } from './commandLogic';
import { MARKS } from './providerMarks';
import { DESTINATIONS } from './destinationMarks';

const allCopy = (): string[] => {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') out.push(String((v as (n: number) => string)(6)));
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  [COPY, PHRASES, PHRASES_MOBILE, COMMANDS, COMMANDS_MOBILE, SECONDARY, WORK_COPY].forEach(walk);
  return out;
};

/* ---------- copy ---------- */

test('copy: V12 H1 exactly, no stale headline, no eyebrow or support paragraph; exact proof', () => {
  assert.equal(COPY.title, 'Xroga for everything.');
  assert.ok(!('eyebrow' in COPY) && !('support' in COPY) && !('titleLines' in COPY), 'eyebrow and support paragraph removed');
  assert.equal(COPY.proof, '1,603 integrations available');
  assert.equal(COPY.qualifier, 'Use Xroga directly. Connect tools when the job needs them.');
  const heroCss = readFileSync(new URL('./S00Hero.module.css', import.meta.url), 'utf8');
  const titleRule = heroCss.slice(heroCss.indexOf('.title {'), heroCss.indexOf('}', heroCss.indexOf('.title {')));
  assert.ok(!/gradient|background-clip/.test(titleRule), 'no gradient on the H1');
  assert.match(titleRule, /color: #f2f0ea/);
  const hero = readFileSync(new URL('./S00Hero.tsx', import.meta.url), 'utf8');
  assert.match(hero, /<h1 id="s00-title" className=\{s\.title\}>\s*\{\/\*[^*]*\*\/\}\s*<span>\{TITLE\[0\]\}<\/span> <span>\{TITLE\[1\]\}<\/span>\s*<\/h1>/, 'the H1 is the title alone');
  assert.match(hero, /COPY\.title\.slice\(0, COPY\.title\.lastIndexOf\(' '\)\)/);
  // stale headlines anywhere in the live hero code or copy (V12 §30)
  const dir = new URL('./', import.meta.url);
  const src = ['copy.ts', 'S00Hero.tsx', 'Capability.tsx', 'Stage.tsx', 'WorkObject.tsx', 'CommandBar.tsx'].map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
  for (const stale of ['Build. Run. Grow.', 'Give Xroga the outcome', 'It executes the digital work', 'The AI execution layer for digital work', 'AI that gets the work done', 'Xroga handles the whole job', 'AI execution workspace']) {
    assert.ok(!src.includes(stale), `stale copy: ${stale}`);
  }
  const banned = /unlock|supercharge|reimagine|seamless|effortless|next-generation|all-in-one|future of work|everything you need|limitless|anything is possible|infinite possibilities/i;
  for (const s of allCopy()) {
    assert.ok(!/[—–]/.test(s), `long dash in "${s}"`);
    assert.ok(!banned.test(s), `stock phrase in "${s}"`);
  }
});

test('copy: weak hero prompts from earlier drafts are gone (V9 §31)', () => {
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

test('no unverified scheduling claims: the worker prepares the next run, it does not promise a time', () => {
  assert.equal(WORK_COPY.clinic.nextrun, 'Next run prepared');
  assert.ok(!/24\/7|while you sleep|every (day|morning) at/i.test(allCopy().join('\n')));
});

/* ---------- vignettes ---------- */

test('six vignettes in two cycles; the default story is not client onboarding', () => {
  assert.equal(VIGNETTES.length, 6);
  assert.deepEqual(CYCLES.flat().sort(), VIGNETTES.map((v) => v.id).sort());
  assert.equal(CYCLES[0][0], 'saas');
  assert.notEqual(CYCLES[0][0], 'clinic');
  for (const v of VIGNETTES) assert.ok(v.len >= 8000 && v.len <= 11000, `${v.id} length`);
  const cycleMs = (c: readonly string[]) => c.reduce((n, id) => n + vignette(id as never).len, 0);
  for (const c of CYCLES) assert.ok(cycleMs(c) >= 24000 && cycleMs(c) <= 30000, 'each cycle runs 24 to 30 s');
  assert.ok(REST >= 5000 && REST <= 7000);
});

test('each vignette has a distinct command, work object and six-tool set from the catalog', () => {
  const commands = new Set(VIGNETTES.map((v) => COMMANDS[v.id]));
  assert.equal(commands.size, 6);
  for (const v of VIGNETTES) {
    assert.equal(v.set.length, 6, v.id);
    assert.equal(new Set(v.set).size, 6, `${v.id} duplicates`);
    for (const p of v.set) assert.ok(p in MARKS, `${v.id}: ${p}`);
    for (const r of toolRoutes(v)) assert.ok(v.set.includes(r.tool), `${v.id} uses ${r.tool} outside its rack`);
    // the work object is the vignette's own (brief only precedes the SaaS)
    const f = frameAt(timeOf(v.id, v.len - 100));
    assert.equal(f.work, v.id);
  }
});

test('tools are optional: some jobs use several, the research product barely uses any', () => {
  const uses = Object.fromEntries(VIGNETTES.map((v) => [v.id, toolRoutes(v).length]));
  assert.ok(uses.research <= 2, 'research is native first');
  assert.ok(Math.max(...Object.values(uses)) >= 4);
  for (const v of VIGNETTES) {
    const firstTool = Math.min(...toolRoutes(v).map((r) => r.start));
    assert.ok(firstTool > v.createAt, `${v.id}: Xroga starts the work before any tool`);
  }
});

test('density: at most 3 active tools and 3 visible signal paths, only to tools in the visible set', () => {
  for (let c = 0; c < LOOP * 1.2; c += 25) {
    const f = frameAt(c);
    assert.ok(f.active.length <= 3, `active tools at ${c}`);
    // call leg visible 0 to ~900 ms, result leg ~850 to 1400 ms (Stage.module.css timings)
    const paths =
      (f.intent ? 1 : 0) +
      (f.createLine ? 1 : 0) +
      f.routes.reduce((n, r) => n + (r.age < 900 ? 1 : 0) + (r.age >= 850 ? 1 : 0), 0);
    assert.ok(paths <= 3, `${paths} signal paths at ${c}`);
    for (const r of f.routes) assert.ok(f.set.includes(r.tool), `${r.tool} not shown at ${c}`);
  }
});

test('no stale anchors: lines are measured from the live layout and re-measured per job', () => {
  const stage = readFileSync(new URL('./Stage.tsx', import.meta.url), 'utf8');
  assert.match(stage, /getBoundingClientRect/);
  assert.match(stage, /new ResizeObserver/);
  assert.match(stage, /\[count, barRef, frame\.vignette, frame\.set, routeKey\]/, 're-measure on breakpoint, job, rack and route change');
  assert.ok(!/M\d+ \d+ C/.test(stage), 'no hard-coded path coordinates');
});

test('one orchestration clock: no intervals, and only the clock and the background own a frame loop', () => {
  const dir = new URL('./', import.meta.url);
  const files = ['S00Hero.tsx', 'Stage.tsx', 'WorkObject.tsx', 'Toolset.tsx', 'CommandBar.tsx', 'XrogaOrb.tsx', 'useOrchestration.ts', 'XrogaSlats.tsx'];
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/setInterval\(/.test(src), `${f} uses setInterval`);
    if (/requestAnimationFrame\(/.test(src)) assert.ok(['useOrchestration.ts', 'XrogaSlats.tsx'].includes(f), `${f} runs its own frame loop`);
  }
});

test('mobile shows shorter display versions of the same six commands', () => {
  assert.deepEqual(Object.keys(COMMANDS_MOBILE).sort(), Object.keys(COMMANDS).sort());
  for (const [id, m] of Object.entries(COMMANDS_MOBILE)) {
    assert.ok(m.length <= 100, `${id} mobile prompt too long`);
    assert.ok(m.length < COMMANDS[id as keyof typeof COMMANDS].length, `${id} not shorter`);
  }
});

test('reduced motion: no slat animation, a static material field, no auto-swapping', () => {
  const hero = readFileSync(new URL('./S00Hero.tsx', import.meta.url), 'utf8');
  assert.match(hero, /!reduced && !bgOff &&/, 'WebGL slats only when motion is allowed');
  const css = readFileSync(new URL('./S00Hero.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.fallback \{[\s\S]*?#15171b[\s\S]*?#050506/, 'static black titanium field');
  assert.ok(!/#173B36|#C4F1E7|#06090A/i.test(hero + css), 'no emerald palette left');
  const clock = readFileSync(new URL('./useOrchestration.ts', import.meta.url), 'utf8');
  assert.match(clock, /if \(reduced\) \{[\s\S]*?frameAt\(STATIC_AT\)/, 'one fixed frame, no clock');
});

test('signal grammar: call reaches the tool, the answer returns, the result lands 100 to 250 ms after arrival', () => {
  assert.ok(SIGNAL.call >= 450 && SIGNAL.call <= 700, 'tool call 450 to 700 ms');
  const settle = SIGNAL.land - SIGNAL.arrive;
  assert.ok(settle >= 100 && settle <= 250, `change ${settle} ms after the result arrives`);
  for (const v of VIGNETTES) {
    for (const r of toolRoutes(v)) {
      assert.equal(r.at - r.start, SIGNAL.land, r.id);
      // causal order (V12 §15): Xroga selects the provider before the call leaves, it stays lit until the
      // answer is back, and it is never lit before its action starts
      assert.ok(frameAt(timeOf(v.id, r.start + 20)).active.includes(r.tool), `${r.id} not selected at the call`);
      assert.ok(frameAt(timeOf(v.id, r.start + SIGNAL.call + 20)).active.includes(r.tool), `${r.id} not lit on arrival`);
      assert.ok(!frameAt(timeOf(v.id, r.start - 20)).active.includes(r.tool) || toolRoutes(v).some((o) => o.tool === r.tool && o.id !== r.id && r.start - 20 - o.start < SIGNAL.back + 150 && o.start < r.start), `${r.id} lit early`);
      const fx = r.id.slice(v.id.length + 1);
      assert.ok(!frameAt(timeOf(v.id, r.at - 20)).effects.includes(fx), `${r.id} early`);
      assert.ok(frameAt(timeOf(v.id, r.at + 20)).effects.includes(fx), `${r.id} missing`);
    }
  }
});

test('browser QA shows test, failure, fix, re-test and verification, in that order', () => {
  const qa = vignette('qa');
  const at = (fx: string) => qa.steps.find((s) => s.fx === fx)!.at;
  const order = ['start', 'failed', 'repaired', 'paid', 'verified', 'released'].map(at);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  const presses = (qa.cursor ?? []).filter(([, p]) => p === 'press').map(([t]) => t);
  assert.equal(presses.length, 2, 'the same control is pressed before and after the repair');
  assert.ok(presses[0] < at('failed') && presses[1] > at('repaired'));
});

test('every vignette ends with work that continues, not a reset (V8 §36)', () => {
  const ends: Record<string, string> = { saas: 'live', qa: 'released', clinic: 'nextrun', platforms: 'destinations', research: 'product', growth: 'nextreview' };
  assert.deepEqual(VIGNETTES.map((v) => v.id), ['saas', 'qa', 'clinic', 'platforms', 'research', 'growth'], 'the six V9 jobs are unchanged');
  for (const v of VIGNETTES) assert.equal(v.steps[v.steps.length - 1].fx, ends[v.id]);
  const rest = frameAt(timeOf('clinic', vignette('clinic').len + 1000));
  assert.equal(rest.work, 'clinic', 'during the rest the finished work stays on stage');
  assert.ok(rest.effects.includes('nextrun'));
});

test('a vignette change reconfigures command, object, rack and orb together', () => {
  const t0 = timeOf('qa', 0);
  const f = frameAt(t0 + 600);
  assert.equal(f.prompt, COMMANDS.qa);
  assert.equal(f.turn?.dir !== undefined, true);
  assert.ok(f.prevSet, 'rack swaps during the turn');
  assert.equal(frameAt(t0 + 100).leaving, 'saas', 'the previous object folds into Xroga');
});

test('reduced motion shows browser QA, verified and release ready', () => {
  const f = frameAt(STATIC_AT);
  assert.equal(f.vignette, 'qa');
  assert.ok(f.effects.includes('verified') && f.effects.includes('released'));
  assert.equal(f.routes.length, 0);
});

test('later passes restart at the first vignette without the headline lead', () => {
  assert.equal(perfTime(LOOP + 10).firstPass, false);
  assert.equal(frameAt(LOOP + 10).vignette, 'saas');
  assert.equal(frameKey(frameAt(timeOf('saas', 3000))), frameKey(frameAt(timeOf('saas', 3050))));
});

/* ---------- command bar ---------- */

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
  // the orchestration has no input from the bar: its only argument is the clock
  assert.equal(frameAt.length, 1);
  const src = readFileSync(new URL('./useOrchestration.ts', import.meta.url), 'utf8');
  assert.ok(!/CommandBar|focused|value/.test(src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')), 'clock independent of input');
});

test('submit hands the exact prompt to the real workspace route; empty submit opens a fresh workspace', () => {
  assert.deepEqual(submission('  Ship it  ', true), { prompt: '  Ship it  ', route: '/workspace' });
  assert.deepEqual(submission('Ship it', false), { prompt: 'Ship it', route: '/auth/signup' });
  assert.deepEqual(submission('   ', true), { prompt: null, route: '/workspace' });
  const bar = readFileSync(new URL('./CommandBar.tsx', import.meta.url), 'utf8');
  assert.match(bar, /localStorage\.setItem\(PENDING_PROMPT_KEY, prompt\)/, 'existing hand-off, nothing in the URL');
  assert.ok(!/router\.push\([^)]*prompt/.test(bar));
});

/* ---------- helpers ---------- */

function timeOf(id: string, local: number): number {
  let t = 1000; // LEAD
  for (const [n, c] of CYCLES.entries()) {
    for (const vid of c) {
      if (vid === id) return t + local;
      t += vignette(vid).len;
    }
    t += REST;
    void n;
  }
  throw new Error(id);
}

/* ---------- V12 production lock ---------- */

test('rotator: fixed lead and the seven final phrases, plus phone variants', () => {
  assert.equal(COPY.lead, 'One workspace to');
  assert.deepEqual(PHRASES, {
    saas: 'build production software',
    clinic: 'automate real business operations',
    qa: 'test and repair product flows',
    platforms: 'ship across web, Chrome, iOS and Android',
    research: 'research, compare and decide',
    growth: 'grow what you launch',
    rest: 'keep important work running',
  });
  assert.deepEqual(Object.values(PHRASES_MOBILE), [
    'build production software',
    'automate business operations',
    'repair product flows',
    'ship across platforms',
    'research and decide',
    'grow what you launch',
    'keep work running',
  ]);
  assert.equal(`${COPY.lead} ${COPY.reducedPhrase}`, 'One workspace to build, operate and keep work moving');
});

test('rotator: the phrase always belongs to the scene on stage', () => {
  for (let c = 0; c < LOOP * 2.2; c += 50) {
    const f = frameAt(c);
    if (f.vignette) assert.equal(f.phrase, f.vignette, `phrase ${f.phrase} during ${f.vignette} at ${c}`);
    else if (f.settled) assert.equal(f.phrase, 'rest', `rest phrase at ${c}`);
    else assert.equal(f.phrase, 'saas', 'the first pass opens on the SaaS phrase');
    if (f.prevPhrase) assert.ok(f.local < PHRASE_MS && f.prevPhrase !== f.phrase, `mask out of window at ${c}`);
  }
});

test('one text-light event at a time: the H1 sweeps on load only, the phrase only after it settles', () => {
  let titleSweeps = 0;
  let prev: string | null = null;
  for (let c = 0; c < LOOP * 2.2; c += 25) {
    const f = frameAt(c);
    if (f.shine === 'title' && prev !== 'title') titleSweeps++;
    if (f.shine === 'title') assert.ok(f.firstPass, 'no H1 shine loop');
    if (f.shine === 'phrase') assert.equal(f.prevPhrase, null, `phrase shines while moving at ${c}`);
    prev = f.shine;
  }
  assert.ok(titleSweeps >= 1 && titleSweeps <= 2, `${titleSweeps} H1 sweeps`);
});

test('action model: every step is one HeroAction; native actions have no provider and never route', () => {
  for (const v of VIGNETTES) {
    const actions = heroActions(v);
    assert.equal(actions.length, v.steps.length);
    const natives = actions.filter((a) => a.providerId === null);
    assert.ok(natives.length >= 2, `${v.id} has native work`);
    for (const a of natives) assert.ok(!toolRoutes(v).some((r) => r.id === a.id), `${a.id} routes without a provider`);
    for (const r of toolRoutes(v)) {
      const a = actions.find((x) => x.id === r.id)!;
      assert.equal(r.tool, a.providerId, 'route and action name the same provider');
      assert.equal(r.at, a.at);
      assert.notEqual(a.capability, 'native', `${a.id} is native but calls ${a.providerId}`);
    }
  }
});

test('highlight, route endpoint and result come from the same action', () => {
  for (let c = 0; c < LOOP * 1.2; c += 25) {
    const f = frameAt(c);
    assert.ok(f.active.length <= 3);
    // every lit provider is the endpoint of a live route, and every route's provider is in the shown rack
    for (const p of f.active) assert.ok(f.routes.some((r) => r.tool === p), `${p} lit without a route at ${c}`);
    for (const r of f.routes) {
      assert.ok(f.set.includes(r.tool), `${r.tool} not in the rack at ${c}`);
      assert.ok(r.id.endsWith(`-${r.result}`), `${r.id} lands ${r.result}`);
    }
  }
  const stage = readFileSync(new URL('./Stage.tsx', import.meta.url), 'utf8');
  assert.match(stage, /geo\.providers\[r\.tool\]/, 'the endpoint is looked up by the same provider id');
  assert.match(stage, /\[data-provider\]/);
  const toolset = readFileSync(new URL('./Toolset.tsx', import.meta.url), 'utf8');
  assert.match(toolset, /data-provider=\{state === 'out' \? undefined : id\}/, 'a leaving unit is never a signal endpoint');
});

test('provider routing matches the work (V12 §13): no unrelated provider for a micro-step', () => {
  const allowed: Record<string, Record<string, string[]>> = {
    saas: { auth: ['supabase'], database: ['supabase'], payments: ['stripe'], 'source-control': ['github'], monitoring: ['sentry'], deployment: ['vercel'] },
    qa: { payments: ['stripe'], monitoring: ['sentry'], 'source-control': ['github'], database: ['supabase'], deployment: ['vercel'] },
    clinic: { crm: ['hubspot'], calendar: ['googlecalendar'], email: ['gmail'], docs: ['notion'], database: ['airtable'] },
    platforms: { 'source-control': ['github'], database: ['supabase'], auth: ['supabase'], monitoring: ['sentry'], deployment: ['vercel'] },
    research: { docs: ['googledrive'], research: ['perplexity', 'exa'] },
    growth: { seo: ['semrush'], analytics: ['posthog', 'mixpanel'], growth: ['googleads'], crm: ['hubspot'], email: ['mailchimp'] },
  };
  for (const v of VIGNETTES) {
    for (const a of heroActions(v)) {
      if (a.providerId === null) continue;
      assert.ok(allowed[v.id][a.capability]?.includes(a.providerId), `${a.id}: ${a.capability} via ${a.providerId}`);
    }
  }
  const clinic = Object.fromEntries(heroActions(vignette('clinic')).map((a) => [a.resultState, a.providerId]));
  assert.equal(clinic.booked, 'googlecalendar');
  assert.equal(clinic.crm, 'hubspot');
  assert.equal(clinic.followup, 'gmail');
  // research is native first: memory, synthesis and the brief are Xroga's own
  const research = Object.fromEntries(heroActions(vignette('research')).map((a) => [a.resultState, a.providerId]));
  for (const fx of ['conflict', 'synthesis', 'memory', 'brief']) assert.equal(research[fx], null, fx);
});

test('store destinations are outputs, never providers', () => {
  const ids = new Set(VIGNETTES.flatMap((v) => [...v.set, ...toolRoutes(v).map((r) => r.tool)]));
  for (const store of Object.keys(DESTINATIONS)) assert.ok(!ids.has(store as never), `${store} shown as a provider`);
  assert.equal(heroActions(vignette('platforms')).find((a) => a.resultState === 'destinations')!.providerId, null);
});

test('a provider is already visible when Xroga selects it: no route before the rack swap settles', () => {
  for (const v of VIGNETTES) {
    for (const r of toolRoutes(v)) assert.ok(r.start >= SWAP_AT + SWAP_MS, `${r.id} starts at ${r.start} during the rack swap`);
  }
});

test('review controls (?at, ?from, ?bg) never reach the production homepage (V12 §40)', () => {
  const clock = readFileSync(new URL('./useOrchestration.ts', import.meta.url), 'utf8');
  assert.match(clock, /process\.env\.NODE_ENV === 'production' && !window\.location\.pathname\.startsWith\('\/lab\/'\)\) return null/);
  const dir = new URL('./', import.meta.url);
  for (const f of ['S00Hero.tsx', 'useOrchestration.ts', 'Stage.tsx', 'CommandBar.tsx', 'Capability.tsx']) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    const direct = src.match(/new URLSearchParams\(window\.location\.search\)/g)?.length ?? 0;
    assert.ok(direct <= (f === 'useOrchestration.ts' ? 1 : 0), `${f} reads URL parameters outside reviewParam`);
  }
});
