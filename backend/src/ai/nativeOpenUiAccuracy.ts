import { requiresAuthorizationReview } from './answerAuthorizationReview.js';

/** Reject the specific browser/server auth conflation, without altering legacy
 * answer policy or treating an explicitly server-owned session as incorrect. */
export function requiresNativeAuthorizationReview(answer: string): boolean {
  if (requiresAuthorizationReview(answer)) return true;
  const prose = answer.replace(/```[^\n]*\n[\s\S]*?```/g, '').replace(/[\x60*_]/g, '');
  return prose.split(/(?<=[.!?])\s+|\n+/).some(sentence =>
    /\bSupabase\b/i.test(sentence) &&
    /\b(?:browser|client[- ]side|default|standard)\b/i.test(sentence) &&
    /\b(?:receives?|gets?|sets?|uses?|stores?|issues?)\b[^.!?\n]{0,100}\bHTTP[- ]?only\b[^.!?\n]{0,50}\b(?:cookies?|tokens?)\b/i.test(sentence) &&
    !/\b(?:not|never|doesn't|cannot|without|server[- ]only|BFF|backend[- ]for[- ]frontend)\b/i.test(sentence),
  );
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
];
const months = new Map(monthNames.flatMap((name, index) => [[name.toLowerCase(), index], [name.slice(0, 3).toLowerCase(), index]] as const));
months.set('sept', 8);
const monthPattern = '(?:' + [...months.keys()].sort((a, b) => b.length - a.length).join('|') + ')';
const monthList = monthPattern + '\\b(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)' + monthPattern + '\\b)*';
const lower = 'fell|falls|fall|dropped|drops|drop|declined|declines|decline|decreased|decreases|decrease|dipped|dips|dip|eased back|eases back|ease back';
const higher = 'rose|rises|rise|increased|increases|increase|climbed|climbs|climb|grew|grows|grow';

/** High-confidence check for a single static monthly line. Only review explicit
 * month-subject direction claims with a preceding consecutive chart point.
 * Multi-series, missing months and ambiguous comparisons remain unclassified. */
export function contradictsMonthlyChart(root: unknown, prose: string): boolean {
  const pending: unknown[] = [root];
  const seen = new Set<object>();
  const charts: Array<Record<string, unknown>> = [];
  while (pending.length > 0 && seen.size < 6000) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) { pending.push(...value); continue; }
    const node = value as Record<string, unknown>;
    if (node.type === 'element' && node.typeName === 'Chart') {
      if (node.hasDynamicProps !== false || !node.props || typeof node.props !== 'object') return false;
      charts.push(node.props as Record<string, unknown>);
      if (charts.length > 1) return false;
      continue;
    }
    pending.push(...Object.values(node));
  }
  if (pending.length || charts.length !== 1) return false;
  const chart = charts[0];
  if (chart.type !== 'line' || !Array.isArray(chart.data) || chart.data.length < 2 || chart.data.length > 12 ||
      typeof chart.x !== 'string' || !Array.isArray(chart.series) || chart.series.length !== 1 ||
      typeof chart.series[0] !== 'string') return false;

  const changes = new Map<number, number>();
  const labels = new Set<number>();
  let previous: { month: number; value: number } | undefined;
  for (const row of chart.data) {
    if (!row || typeof row !== 'object') return false;
    const label = row[chart.x], value = row[chart.series[0]];
    const month = typeof label === 'string' ? months.get(label.trim().toLowerCase()) : undefined;
    if (month === undefined || labels.has(month) || typeof value !== 'number' || !Number.isFinite(value)) return false;
    labels.add(month);
    if (previous) {
      if ((previous.month + 1) % 12 !== month) return false;
      changes.set(month, Math.sign(value - previous.value));
    }
    previous = { month, value };
  }
  const claims = new RegExp('(?:^|[.!?;:\\n])\\s*(' + monthList + ')\\s+(' + lower + '|' + higher +
    ')\\b(?!\\s+(?:from|versus|vs\\.?|compared|relative|since|year[- ]over[- ]year|yoy)\\b)', 'gi');
  for (const [, subject, verb] of prose.replace(/[\x60*_]/g, '').matchAll(claims)) {
    const direction = lower.split('|').includes(verb.toLowerCase()) ? -1 : 1;
    for (const match of subject.matchAll(new RegExp('\\b' + monthPattern + '\\b', 'gi'))) {
      const month = months.get(match[0].toLowerCase())!;
      if (changes.has(month) && changes.get(month) !== direction) return true;
    }
  }
  return false;
}
