/**
 * What a browser job is asked to DO, and how its outcome is judged (INFRA-007 / INFRA-008).
 *
 * `browserJob.ts` fixes who, where and how much. This module fixes the work: a short, strictly validated list of steps the worker
 * executes in order, and the postconditions the trusted backend checks against the worker's report before a task may complete.
 *
 *  - Steps are an allow-list of operations with bounded arguments. There is no free-form script, no `evaluate`, no file path.
 *  - Every URL a step names must be inside the job's scope (`navigationAllowed`); the worker re-checks every navigation and redirect.
 *  - AI-assisted steps (Stagehand observe/act/extract) are only valid when the job allows model spend (`maxModelCostMicros > 0`).
 *  - Steps that change external state (submitting a form, uploading) are consequential: they are refused unless the trusted API
 *    issued an explicit write grant for this job. Page text and model output can never create that grant.
 *  - Postconditions are evaluated by the backend on the worker's untrusted report. A task whose postconditions fail is NOT complete,
 *    however many steps ran: an action happening is not the user's outcome being achieved.
 */
import type { BrowserJob } from './browserJob.js';
import { navigationAllowed } from './browserJob.js';

export class BrowserPlanError extends Error {
  readonly code = 'PLAN_INVALID' as const;
  constructor(message: string) { super(message); this.name = 'BrowserPlanError'; }
}

const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
const ARTIFACT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const KEYS = new Set(['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Space', 'Backspace']);
export const PLAN_LIMITS = Object.freeze({ steps: 60, expectations: 30, selector: 300, text: 2_000, instruction: 500, schemaFields: 20, waitMs: 30_000, uploadBytes: 256 * 1024 });

export type ExtractField = 'string' | 'number' | 'boolean' | 'string[]';
export type BrowserStep =
  | { op: 'goto'; url: string }
  | { op: 'click'; selector: Selector; consequential?: boolean }
  | { op: 'fill'; selector: Selector; value: string }
  | { op: 'select'; selector: Selector; value: string }
  | { op: 'press'; selector: Selector; key: string; consequential?: boolean }
  | { op: 'scroll'; to: 'top' | 'bottom' }
  | { op: 'waitFor'; selector?: Selector; urlPrefix?: string; timeoutMs: number }
  | { op: 'extractText'; selector: Selector; name: string; all?: boolean; attribute?: string }
  | { op: 'screenshot'; name: string; fullPage?: boolean }
  | { op: 'download'; selector: Selector; name: string }
  | { op: 'upload'; selector: Selector; fileName: string; mediaType: 'text/plain' | 'application/json'; content: string }
  | { op: 'aiObserve'; instruction: string; name: string }
  | { op: 'aiAct'; instruction: string; consequential?: boolean; fallback?: DeterministicFallback }
  | { op: 'aiExtract'; instruction: string; name: string; fields: Record<string, ExtractField>; fallback?: DeterministicFallback };

/** One CSS selector, or up to three alternatives tried in order (recovery when a page's markup changed). */
export type Selector = string | string[];
/** What an AI step does instead when the model route refuses (no route, budget spent, usage unmeasured). Never used to override an answer. */
export type DeterministicFallback = { op: 'click'; selector: Selector } | { op: 'extractText'; selector: Selector; all?: boolean };

export type Expectation =
  | { kind: 'finalUrlPrefix'; prefix: string }
  | { kind: 'extracted'; name: string; equals?: string | number | boolean; contains?: string; minItems?: number; matches?: string }
  | { kind: 'artifact'; name: string; mediaType?: string; minBytes?: number }
  | { kind: 'noConsequentialAction' };

export interface BrowserPlan {
  steps: BrowserStep[];
  expect: Expectation[];
  /** issued by the trusted API from a canonical action grant; absent means read-only */
  writeGrant?: { grantId: string; actions: Array<'submit' | 'upload'> };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function only(o: Record<string, unknown>, allowed: string[], where: string) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new BrowserPlanError(`${where}: unknown field "${k.slice(0, 30)}"`);
}
function str(o: Record<string, unknown>, k: string, max: number, where: string, optional = false): string | undefined {
  const v = o[k];
  if (v === undefined && optional) return undefined;
  if (typeof v !== 'string' || v.length === 0 || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new BrowserPlanError(`${where}: ${k} must be 1-${max} printable characters`);
  return v;
}
function name(o: Record<string, unknown>, k: string, where: string, re = NAME): string {
  const v = o[k];
  if (typeof v !== 'string' || !re.test(v)) throw new BrowserPlanError(`${where}: ${k} must match ${re.source}`);
  return v;
}

function sel(o: Record<string, unknown>, at: string, optional = false): Selector | undefined {
  const v = o.selector;
  if (v === undefined && optional) return undefined;
  if (Array.isArray(v)) {
    if (v.length < 1 || v.length > 3) throw new BrowserPlanError(`${at}: selector alternatives must list 1-3 selectors`);
    return v.map((x, k) => str({ s: x }, 's', PLAN_LIMITS.selector, `${at} selector ${k}`)!);
  }
  return str(o, 'selector', PLAN_LIMITS.selector, at)!;
}

function parseFallback(raw: unknown, at: string): DeterministicFallback {
  if (!isRecord(raw)) throw new BrowserPlanError(`${at}: fallback must be an object`);
  if (raw.op === 'click') { only(raw, ['op', 'selector'], `${at} fallback`); return { op: 'click', selector: sel(raw, `${at} fallback`)! }; }
  if (raw.op === 'extractText') {
    only(raw, ['op', 'selector', 'all'], `${at} fallback`);
    if (raw.all !== undefined && typeof raw.all !== 'boolean') throw new BrowserPlanError(`${at}: fallback all must be boolean`);
    return { op: 'extractText', selector: sel(raw, `${at} fallback`)!, ...(raw.all ? { all: true } : {}) };
  }
  throw new BrowserPlanError(`${at}: fallback must be a click or extractText`);
}

function parseStep(raw: unknown, i: number, job: BrowserJob, grant: BrowserPlan['writeGrant']): BrowserStep {
  const at = `step ${i}`;
  if (!isRecord(raw) || typeof raw.op !== 'string') throw new BrowserPlanError(`${at}: must be an object with an op`);
  const ai = job.limits.maxModelCostMicros > 0;
  const requireWrite = (action: 'submit' | 'upload') => {
    if (!grant?.actions.includes(action)) throw new BrowserPlanError(`${at}: a consequential ${action} needs an issued write grant`);
  };
  switch (raw.op) {
    case 'goto': {
      only(raw, ['op', 'url'], at);
      const url = str(raw, 'url', 2_048, at)!;
      if (!navigationAllowed(job, url)) throw new BrowserPlanError(`${at}: url is outside the job scope`);
      return { op: 'goto', url: new URL(url).href };
    }
    case 'click': case 'press': {
      only(raw, raw.op === 'click' ? ['op', 'selector', 'consequential'] : ['op', 'selector', 'key', 'consequential'], at);
      const selector = sel(raw, at)!;
      if (raw.consequential !== undefined && typeof raw.consequential !== 'boolean') throw new BrowserPlanError(`${at}: consequential must be boolean`);
      if (raw.consequential) requireWrite('submit');
      if (raw.op === 'click') return { op: 'click', selector, ...(raw.consequential ? { consequential: true } : {}) };
      const key = str(raw, 'key', 20, at)!;
      if (!KEYS.has(key)) throw new BrowserPlanError(`${at}: key is not on the allow-list`);
      // Enter can submit a form. A plan that submits something with side effects must mark the step consequential (needs a grant);
      // a search box is read-only. The worker also counts every navigation an Enter causes, so an unmarked submit is still visible.
      return { op: 'press', selector, key, ...(raw.consequential ? { consequential: true } : {}) };
    }
    case 'fill': case 'select': {
      only(raw, ['op', 'selector', 'value'], at);
      return { op: raw.op, selector: sel(raw, at)!, value: str(raw, 'value', PLAN_LIMITS.text, at)! };
    }
    case 'scroll': {
      only(raw, ['op', 'to'], at);
      if (raw.to !== 'top' && raw.to !== 'bottom') throw new BrowserPlanError(`${at}: to must be top or bottom`);
      return { op: 'scroll', to: raw.to };
    }
    case 'waitFor': {
      only(raw, ['op', 'selector', 'urlPrefix', 'timeoutMs'], at);
      const selector = sel(raw, at, true);
      const urlPrefix = str(raw, 'urlPrefix', 2_048, at, true);
      if (!selector === !urlPrefix) throw new BrowserPlanError(`${at}: give exactly one of selector or urlPrefix`);
      if (urlPrefix && !navigationAllowed(job, urlPrefix)) throw new BrowserPlanError(`${at}: urlPrefix is outside the job scope`);
      const t = raw.timeoutMs;
      if (typeof t !== 'number' || !Number.isSafeInteger(t) || t < 1 || t > PLAN_LIMITS.waitMs) throw new BrowserPlanError(`${at}: timeoutMs must be 1-${PLAN_LIMITS.waitMs}`);
      return { op: 'waitFor', ...(selector ? { selector } : {}), ...(urlPrefix ? { urlPrefix } : {}), timeoutMs: t };
    }
    case 'extractText': {
      only(raw, ['op', 'selector', 'name', 'all', 'attribute'], at);
      if (raw.all !== undefined && typeof raw.all !== 'boolean') throw new BrowserPlanError(`${at}: all must be boolean`);
      const attribute = raw.attribute === undefined ? undefined : name(raw, 'attribute', at, /^[a-z][a-z0-9-]{0,39}$/);
      if (attribute && /^on/.test(attribute)) throw new BrowserPlanError(`${at}: event-handler attributes are not extractable`);
      return { op: 'extractText', selector: sel(raw, at)!, name: name(raw, 'name', at), ...(raw.all ? { all: true } : {}), ...(attribute ? { attribute } : {}) };
    }
    case 'screenshot': {
      only(raw, ['op', 'name', 'fullPage'], at);
      if (raw.fullPage !== undefined && typeof raw.fullPage !== 'boolean') throw new BrowserPlanError(`${at}: fullPage must be boolean`);
      return { op: 'screenshot', name: name(raw, 'name', at, ARTIFACT), ...(raw.fullPage ? { fullPage: true } : {}) };
    }
    case 'download': {
      only(raw, ['op', 'selector', 'name'], at);
      return { op: 'download', selector: sel(raw, at)!, name: name(raw, 'name', at, ARTIFACT) };
    }
    case 'upload': {
      only(raw, ['op', 'selector', 'fileName', 'mediaType', 'content'], at);
      requireWrite('upload');
      if (raw.mediaType !== 'text/plain' && raw.mediaType !== 'application/json') throw new BrowserPlanError(`${at}: mediaType must be text/plain or application/json`);
      const content = raw.content;
      if (typeof content !== 'string' || Buffer.byteLength(content) > PLAN_LIMITS.uploadBytes) throw new BrowserPlanError(`${at}: content must be text up to ${PLAN_LIMITS.uploadBytes} bytes`);
      return { op: 'upload', selector: sel(raw, at)!, fileName: name(raw, 'fileName', at, ARTIFACT), mediaType: raw.mediaType, content };
    }
    case 'aiObserve': case 'aiAct': case 'aiExtract': {
      if (!ai) throw new BrowserPlanError(`${at}: AI steps need a model budget (maxModelCostMicros > 0)`);
      const instruction = str(raw, 'instruction', PLAN_LIMITS.instruction, at)!;
      if (raw.op === 'aiObserve') { only(raw, ['op', 'instruction', 'name'], at); return { op: 'aiObserve', instruction, name: name(raw, 'name', at) }; }
      if (raw.op === 'aiAct') {
        only(raw, ['op', 'instruction', 'consequential', 'fallback'], at);
        if (raw.consequential !== undefined && typeof raw.consequential !== 'boolean') throw new BrowserPlanError(`${at}: consequential must be boolean`);
        if (raw.consequential) requireWrite('submit');
        if (raw.consequential && raw.fallback !== undefined) throw new BrowserPlanError(`${at}: a consequential AI action has no automatic fallback`);
        return { op: 'aiAct', instruction, ...(raw.consequential ? { consequential: true } : {}), ...(raw.fallback !== undefined ? { fallback: parseFallback(raw.fallback, at) } : {}) };
      }
      only(raw, ['op', 'instruction', 'name', 'fields', 'fallback'], at);
      if (!isRecord(raw.fields)) throw new BrowserPlanError(`${at}: fields must be an object`);
      const entries = Object.entries(raw.fields);
      if (entries.length < 1 || entries.length > PLAN_LIMITS.schemaFields) throw new BrowserPlanError(`${at}: 1-${PLAN_LIMITS.schemaFields} fields`);
      const fields: Record<string, ExtractField> = {};
      for (const [k, t] of entries) {
        if (!NAME.test(k) || !['string', 'number', 'boolean', 'string[]'].includes(t as string)) throw new BrowserPlanError(`${at}: field ${k.slice(0, 30)} must be string, number, boolean or string[]`);
        fields[k] = t as ExtractField;
      }
      return { op: 'aiExtract', instruction, name: name(raw, 'name', at), fields, ...(raw.fallback !== undefined ? { fallback: parseFallback(raw.fallback, at) } : {}) };
    }
    default:
      throw new BrowserPlanError(`${at}: unknown op`);
  }
}

function parseExpectation(raw: unknown, i: number, job: BrowserJob): Expectation {
  const at = `expectation ${i}`;
  if (!isRecord(raw) || typeof raw.kind !== 'string') throw new BrowserPlanError(`${at}: must be an object with a kind`);
  switch (raw.kind) {
    case 'finalUrlPrefix': {
      only(raw, ['kind', 'prefix'], at);
      const prefix = str(raw, 'prefix', 2_048, at)!;
      if (!navigationAllowed(job, prefix)) throw new BrowserPlanError(`${at}: prefix is outside the job scope`);
      return { kind: 'finalUrlPrefix', prefix };
    }
    case 'extracted': {
      only(raw, ['kind', 'name', 'equals', 'contains', 'minItems', 'matches'], at);
      const e: Expectation = { kind: 'extracted', name: name(raw, 'name', at) };
      if (raw.equals !== undefined) { if (!['string', 'number', 'boolean'].includes(typeof raw.equals)) throw new BrowserPlanError(`${at}: equals must be a scalar`); e.equals = raw.equals as string | number | boolean; }
      if (raw.contains !== undefined) e.contains = str(raw, 'contains', PLAN_LIMITS.text, at);
      if (raw.minItems !== undefined) { if (typeof raw.minItems !== 'number' || !Number.isSafeInteger(raw.minItems) || raw.minItems < 0 || raw.minItems > 10_000) throw new BrowserPlanError(`${at}: minItems out of range`); e.minItems = raw.minItems; }
      if (raw.matches !== undefined) {
        const m = str(raw, 'matches', 200, at)!;
        // anchored, no backreferences or nested quantifiers: a plan cannot ship a catastrophic regular expression
        if (!/^\^/.test(m) || !/\$$/.test(m) || /\\\d|\([^)]*[+*][^)]*\)[+*{]/.test(m)) throw new BrowserPlanError(`${at}: matches must be an anchored simple pattern`);
        try { new RegExp(m); } catch { throw new BrowserPlanError(`${at}: matches is not a valid pattern`); }
        e.matches = m;
      }
      if (e.equals === undefined && e.contains === undefined && e.minItems === undefined && e.matches === undefined) throw new BrowserPlanError(`${at}: give at least one condition`);
      return e;
    }
    case 'artifact': {
      only(raw, ['kind', 'name', 'mediaType', 'minBytes'], at);
      const e: Expectation = { kind: 'artifact', name: name(raw, 'name', at, ARTIFACT) };
      if (raw.mediaType !== undefined) e.mediaType = str(raw, 'mediaType', 80, at);
      if (raw.minBytes !== undefined) { if (typeof raw.minBytes !== 'number' || !Number.isSafeInteger(raw.minBytes) || raw.minBytes < 1) throw new BrowserPlanError(`${at}: minBytes must be a positive integer`); e.minBytes = raw.minBytes; }
      return e;
    }
    case 'noConsequentialAction':
      only(raw, ['kind'], at);
      return { kind: 'noConsequentialAction' };
    default:
      throw new BrowserPlanError(`${at}: unknown kind`);
  }
}

/** Validates an untrusted plan against an already-validated job. Throws BrowserPlanError; never returns a partially valid plan. */
export function parseBrowserPlan(input: unknown, job: BrowserJob): BrowserPlan {
  if (!isRecord(input)) throw new BrowserPlanError('a plan must be an object');
  only(input, ['steps', 'expect', 'writeGrant'], 'plan');
  let writeGrant: BrowserPlan['writeGrant'];
  if (input.writeGrant !== undefined) {
    if (!isRecord(input.writeGrant)) throw new BrowserPlanError('writeGrant must be an object');
    only(input.writeGrant, ['grantId', 'actions'], 'writeGrant');
    const grantId = name(input.writeGrant, 'grantId', 'writeGrant', /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/);
    const actions = input.writeGrant.actions;
    if (!Array.isArray(actions) || actions.length < 1 || actions.some((a) => a !== 'submit' && a !== 'upload')) throw new BrowserPlanError('writeGrant.actions must list submit and/or upload');
    writeGrant = { grantId, actions: [...new Set(actions as Array<'submit' | 'upload'>)] };
  }
  const steps = input.steps;
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > PLAN_LIMITS.steps) throw new BrowserPlanError(`steps must list 1-${PLAN_LIMITS.steps} steps`);
  const expect = input.expect ?? [];
  if (!Array.isArray(expect) || expect.length > PLAN_LIMITS.expectations) throw new BrowserPlanError(`expect must list at most ${PLAN_LIMITS.expectations} expectations`);
  const parsed: BrowserPlan = { steps: steps.map((s, i) => parseStep(s, i, job, writeGrant)), expect: expect.map((e, i) => parseExpectation(e, i, job)), ...(writeGrant ? { writeGrant } : {}) };
  const names = new Set<string>();
  for (const s of parsed.steps) {
    const n = 'name' in s ? s.name : undefined;
    if (n) { if (names.has(n)) throw new BrowserPlanError(`duplicate output name ${n}`); names.add(n); }
  }
  return parsed;
}

export type ExtractedValue = string | number | boolean | null | string[] | Record<string, unknown> | Array<Record<string, unknown>>;
export interface PostconditionResult { index: number; kind: Expectation['kind']; passed: boolean; detail: string }

/**
 * Judges the worker's (untrusted) report against the plan's expectations. Pure: no I/O, no trust in anything but the values given.
 * `consequentialActions` is the count of consequential steps the worker reports having executed.
 */
export function evaluatePostconditions(plan: BrowserPlan, report: { finalUrl: string; extracted: Record<string, ExtractedValue>; artifacts: Array<{ name: string; mediaType: string; size: number }>; consequentialActions: number }): PostconditionResult[] {
  return plan.expect.map((e, index) => {
    switch (e.kind) {
      case 'finalUrlPrefix': return { index, kind: e.kind, passed: report.finalUrl.startsWith(e.prefix), detail: 'final URL prefix' };
      case 'artifact': {
        const a = report.artifacts.find((x) => x.name === e.name);
        const passed = !!a && (e.mediaType === undefined || a.mediaType === e.mediaType) && (e.minBytes === undefined || a.size >= e.minBytes);
        return { index, kind: e.kind, passed, detail: a ? `${a.mediaType}, ${a.size} bytes` : 'missing' };
      }
      case 'noConsequentialAction': return { index, kind: e.kind, passed: report.consequentialActions === 0, detail: `${report.consequentialActions} consequential actions` };
      case 'extracted': {
        if (!Object.prototype.hasOwnProperty.call(report.extracted, e.name)) return { index, kind: e.kind, passed: false, detail: 'value missing' };
        const v = report.extracted[e.name];
        const checks: boolean[] = [];
        const asText = typeof v === 'string' ? v : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n') : JSON.stringify(v);
        if (e.equals !== undefined) checks.push(v === e.equals || (typeof v === 'string' && v.trim() === String(e.equals)));
        if (e.contains !== undefined) checks.push(asText.includes(e.contains));
        if (e.minItems !== undefined) checks.push(Array.isArray(v) && v.length >= e.minItems);
        if (e.matches !== undefined) checks.push(typeof v === 'string' && new RegExp(e.matches).test(v.trim()));
        return { index, kind: e.kind, passed: checks.every(Boolean), detail: `${checks.filter(Boolean).length}/${checks.length} conditions` };
      }
    }
  });
}
