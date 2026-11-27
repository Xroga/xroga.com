// Which values typed in a demonstration are really the inputs of the task: an email, a phone number, a date, a name, an amount. A routine saved with those as ${placeholders} can be run
// again with new values (macro), instead of replaying the example. The kinds of value and the "is it an input or a fixed word" decision follow the variable identifier of
// browser-use/workflow-use (AGPL-3.0: the idea only; the patterns here are common ones and the code is written fresh, with no LLM and no cost).
export type VariableKind = 'email' | 'phone' | 'url' | 'date' | 'zip' | 'number' | 'name' | 'text';

export interface VariableHint {
  /** Index of the step the value is in. */
  step: number;
  value: string;
  kind: VariableKind;
  /** A name for the placeholder: from the field's label when it has one. */
  name: string;
  confidence: number;
}

const PATTERNS: Array<[VariableKind, RegExp]> = [
  ['email', /^[^\s@<>()]+@[^\s@<>()]+\.[A-Za-z]{2,}$/],
  ['url', /^https?:\/\/\S+$/i],
  ['phone', /^\+?[\d\s().-]{7,20}$/],
  ['date', /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2})$/],
  ['zip', /^\d{5}(-\d{4})?$|^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i],
  ['number', /^[$£€]?\d[\d,]*(\.\d+)?%?$/],
];
const LABEL_KINDS: Array<[RegExp, VariableKind]> = [
  [/e-?mail/i, 'email'],
  [/phone|mobile|tel\b|telephone/i, 'phone'],
  [/website|url|link/i, 'url'],
  [/date|birth|dob|from|until/i, 'date'],
  [/zip|post(al)? ?code/i, 'zip'],
  [/amount|price|quantity|qty|age|budget|salary|number/i, 'number'],
  [/name|company|city|address|title|subject|message|comment|description|search|query/i, 'name'],
];
/** Words that are the same every time, so they are part of the routine and not an input. */
const FIXED = new Set(['', 'yes', 'no', 'true', 'false', 'on', 'off', 'ok', 'submit', 'cancel', 'save', 'next', 'back', 'search', 'go', '0', '1']);

const slug = (label: string): string => {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return /^[a-z]/.test(s) ? s : s ? `v_${s}` : '';
};

/** The values worth making variables among recorded steps (only steps that set a value). Passwords and card numbers are never kept in a demonstration, and are skipped here as well. */
export function findVariables(steps: ReadonlyArray<{ step: string; role?: string; name?: string; value?: string }>): VariableHint[] {
  const out: VariableHint[] = [];
  const used = new Map<string, number>();
  steps.forEach((s, i) => {
    const value = (s.value ?? '').trim();
    if (s.step !== 'set' || !value || FIXED.has(value.toLowerCase())) return;
    if (/^\d{13,19}$/.test(value.replace(/[\s-]/g, ''))) return;
    const label = s.name ?? '';
    let kind: VariableKind | undefined = PATTERNS.find(([, re]) => re.test(value))?.[0];
    let confidence = kind ? 0.9 : 0;
    const byLabel = LABEL_KINDS.find(([re]) => re.test(label))?.[1];
    if (!kind && byLabel) {
      kind = byLabel;
      confidence = 0.7;
    } else if (kind && byLabel === kind) confidence = 0.97;
    // a free-text value typed into a box is an input too, with less certainty than a typed email
    if (!kind && value.length >= 2) {
      kind = 'text';
      confidence = 0.55;
    }
    if (!kind) return;
    let name = slug(label) || kind;
    const n = (used.get(name) ?? 0) + 1;
    used.set(name, n);
    if (n > 1) name = `${name}_${n}`;
    out.push({ step: i, value, kind, name, confidence });
  });
  return out;
}

/** The steps with the chosen values replaced by ${name} (the form macro save takes); a value that is not chosen stays as typed. */
export function withPlaceholders<T extends { value?: string }>(steps: readonly T[], hints: readonly VariableHint[]): T[] {
  const byStep = new Map(hints.map(h => [h.step, h]));
  return steps.map((s, i) => (byStep.has(i) ? { ...s, value: `\${${byStep.get(i)!.name}}` } : s));
}

export function describeVariables(hints: readonly VariableHint[]): string {
  if (!hints.length) return '';
  const lines = hints.map(h => `step ${h.step + 1}: "${h.value.length > 40 ? `${h.value.slice(0, 40)}…` : h.value}" looks like ${h.kind === 'text' ? 'an input' : `a${/^[aeiou]/.test(h.kind) ? 'n' : ''} ${h.kind}`} → \${${h.name}}${h.confidence < 0.6 ? ' (unsure)' : ''}`);
  return `Likely inputs of this task (to run it again with other values, save it with macro using these as \${placeholders}):\n${lines.join('\n')}`;
}
