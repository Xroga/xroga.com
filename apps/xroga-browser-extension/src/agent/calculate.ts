// `calculate`: exact arithmetic for numbers read from pages (totals, percentages, budgets per day, differences), so a figure in an answer or a form is computed,
// not estimated in the model's head. A small recursive-descent parser over numbers, + - * / % ^, parentheses and a few named functions; it never evaluates code.

const FUNCS: Record<string, (...a: number[]) => number> = {
  round: (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; },
  floor: x => Math.floor(x),
  ceil: x => Math.ceil(x),
  abs: x => Math.abs(x),
  sqrt: x => Math.sqrt(x),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  sum: (...a) => a.reduce((s, x) => s + x, 0),
  avg: (...a) => a.reduce((s, x) => s + x, 0) / a.length,
};

export function calculate(expression: string): number {
  // Thousands separators and currency signs as pages show them ("Rs 4,200.00", "$1,050") are read as plain numbers.
  const src = expression.replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/[$€£¥₹]|\b(?:rs|pkr|usd|eur|gbp)\b\.?/gi, ' ');
  let i = 0;
  const peek = () => { while (src[i] === ' ' || src[i] === '\t') i++; return src[i]; };
  const fail = (why: string): never => { throw new Error(`${why} at position ${i + 1} of "${expression.slice(0, 120)}"`); };
  const number = (): number => {
    const m = /^\d+(?:\.\d+)?|^\.\d+/.exec(src.slice(i));
    if (!m) return fail('a number was expected');
    i += m[0].length;
    if (peek() === '%' && !/^\s*[\d(.]/.test(src.slice(i + 1))) { i++; return Number(m[0]) / 100; }
    return Number(m[0]);
  };
  const primary = (): number => {
    const c = peek();
    if (c === '(') { i++; const v = expr(); if (peek() !== ')') fail('a closing parenthesis is missing'); i++; return v; }
    if (c === '-') { i++; return -primary(); }
    if (c === '+') { i++; return primary(); }
    const name = /^[a-z]+/i.exec(src.slice(i))?.[0];
    if (name) {
      const f = FUNCS[name.toLowerCase()];
      if (!f) fail(`unknown function ${name}`);
      i += name.length;
      if (peek() !== '(') fail(`${name} needs parentheses`);
      i++;
      const args: number[] = [];
      if (peek() !== ')') { args.push(expr()); while (peek() === ',') { i++; args.push(expr()); } }
      if (peek() !== ')') fail('a closing parenthesis is missing');
      i++;
      return f!(...args);
    }
    return number();
  };
  const power = (): number => { const b = primary(); if (peek() === '^') { i++; return b ** power(); } return b; };
  const term = (): number => {
    let v = power();
    for (let c = peek(); c === '*' || c === '/' || c === '%' || c === 'x' || c === '×'; c = peek()) {
      i++;
      const r = power();
      v = c === '/' ? v / r : c === '%' ? v % r : v * r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    for (let c = peek(); c === '+' || c === '-'; c = peek()) { i++; v = c === '+' ? v + term() : v - term(); }
    return v;
  };
  const value = expr();
  if (peek() !== undefined) fail('unexpected text');
  if (!Number.isFinite(value)) throw new Error(`the result is not a finite number (${value})`);
  return value;
}

export const CALCULATE_TOOL = {
  name: 'calculate',
  source: 'agent' as const,
  group: 'working' as const,
  description:
    'Compute exact numbers instead of doing arithmetic in your head: totals, differences, percentages, per-day budgets, averages. Not for times or time zones: meeting windows across zones come from find_free_times. expressions is a list of named expressions such as {"name": "daily", "expr": "4200 / 7"}; numbers may keep thousands separators and currency signs. Functions: round(x, digits), floor, ceil, abs, sqrt, min, max, sum, avg.',
  parameters: {
    type: 'object',
    properties: {
      expressions: { type: 'array', maxItems: 40, items: { type: 'object', properties: { name: { type: 'string', maxLength: 60 }, expr: { type: 'string', maxLength: 400 } }, required: ['expr'] } },
    },
    required: ['expressions'],
    additionalProperties: false,
  },
};

export function runCalculate(args: { expressions?: Array<{ name?: string; expr?: string }> }): { text: string; isError: boolean } {
  const list = Array.isArray(args.expressions) ? args.expressions.slice(0, 40) : [];
  if (!list.length) return { text: 'error: expressions is a non-empty list of {name, expr}', isError: true };
  const lines = list.map((e, k) => {
    const label = e.name?.trim() || `#${k + 1}`;
    // Times and time zones are not arithmetic to do by hand here: converting between zones and intersecting working hours is find_free_times' job.
    if (/\b(?:utc|gmt|time ?zone|offset|lisbon|karachi|london|dubai|tokyo|new york|window|slot|busy|working hours)\b|\d{1,2}:\d{2}/i.test(`${e.name ?? ''} ${e.expr ?? ''}`)) {
      return `${label}: error: this looks like a time or time-zone question; use find_free_times (people, zones, working hours, busy slots) instead of calculating by hand`;
    }
    try {
      const v = calculate(String(e.expr ?? ''));
      return `${label} = ${Number.isInteger(v) ? v : Math.round(v * 1e6) / 1e6}`;
    } catch (error) {
      return `${label}: error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  return { text: lines.join('\n'), isError: lines.every(l => l.includes(': error:')) };
}
