// Scorers for the live acceptance tasks. A task states what a correct answer contains; the scorer reads the model's final
// answer and returns a score between 0 and 1 with the reason, so a run of many tasks gives a number that can be compared
// between versions. The kinds follow the evaluators of BrowserGym's AssistantBench and WebArena tasks (Apache-2.0):
// string match, number closeness with units stripped, list F1, and url match. Written fresh.

/** Lower case, accents and punctuation folded, spaces collapsed. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Numbers in a text: "$1,250.50", "12 %", "4.2 metres" give 1250.5, 12, 4.2. Thousand separators are removed. */
export function numbersIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function scoreContainsAll(answer, expected) {
  const text = normalize(answer);
  const missing = expected.filter(e => !text.includes(normalize(e)));
  return { score: (expected.length - missing.length) / expected.length, detail: missing.length ? `missing: ${missing.join(' | ')}` : 'all present' };
}

/** Closeness of a number to the expected one: 1 when equal, falling to 0 at the tolerance (relative). */
export function scoreNumber(answer, expected, tolerance = 0.01) {
  const found = numbersIn(answer);
  if (!found.length) return { score: 0, detail: 'no number in the answer' };
  let best = 0;
  for (const n of found) {
    const rel = expected === 0 ? Math.abs(n) : Math.abs(n - expected) / Math.abs(expected);
    best = Math.max(best, rel <= tolerance ? 1 : Math.max(0, 1 - rel));
  }
  return { score: best >= 0.999 ? 1 : best, detail: `expected ${expected}, answer has ${found.slice(0, 6).join(', ')}` };
}

/** F1 of a set of items: how many of the expected items appear, and how few extra listed items there are. */
export function scoreList(answer, expected, listed) {
  const text = normalize(answer);
  const hit = expected.filter(e => text.includes(normalize(e)));
  const recall = hit.length / expected.length;
  const items = listed ?? [];
  const precision = items.length ? items.filter(i => expected.some(e => normalize(i).includes(normalize(e)))).length / items.length : 1;
  const f1 = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);
  return { score: f1, detail: `found ${hit.length}/${expected.length}${items.length ? `, precision ${precision.toFixed(2)}` : ''}` };
}

export function scoreUrl(answer, expectedUrl) {
  const urls = String(answer ?? '').match(/https?:\/\/[^\s)>\]"']+/g) ?? [];
  const strip = u => u.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
  const ok = urls.some(u => strip(u) === strip(expectedUrl));
  return { score: ok ? 1 : 0, detail: ok ? 'url present' : `urls in the answer: ${urls.slice(0, 3).join(', ') || 'none'}` };
}

/** Penalty rule: an answer that states something the task says is wrong (a trap value) loses everything. */
export function applyForbidden(result, answer, forbidden) {
  if (!forbidden?.length) return result;
  const text = normalize(answer);
  const hit = forbidden.filter(f => text.includes(normalize(f)));
  return hit.length ? { score: 0, detail: `${result.detail}; states a wrong value: ${hit.join(' | ')}` } : result;
}

export function scoreAnswer(expect, answer) {
  let result;
  switch (expect.type) {
    case 'contains_all': result = scoreContainsAll(answer, expect.values); break;
    case 'number': result = scoreNumber(answer, expect.value, expect.tolerance); break;
    case 'list': result = scoreList(answer, expect.values, expect.listed); break;
    case 'url': result = scoreUrl(answer, expect.value); break;
    case 'all': {
      const parts = expect.parts.map(p => scoreAnswer(p, answer));
      result = { score: parts.reduce((s, p) => s + p.score, 0) / parts.length, detail: parts.map(p => p.detail).join('; ') };
      break;
    }
    default: throw new Error(`unknown scorer ${expect.type}`);
  }
  return applyForbidden(result, answer, expect.forbidden);
}
