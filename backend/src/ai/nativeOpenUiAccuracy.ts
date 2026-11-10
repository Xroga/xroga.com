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

interface MonthlyPoint { month: number; value: number }
interface MonthlySeries { type: 'line' | 'bar'; points: MonthlyPoint[]; format: 'number' | 'currency' | 'percent'; currency?: string }

/** Only one static, consecutive, single-series monthly line or bar chart can
 * establish an unambiguous month-over-month comparison. */
function monthlySeries(root: unknown): MonthlySeries | undefined {
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
      if (node.hasDynamicProps !== false || !node.props || typeof node.props !== 'object') return;
      charts.push(node.props as Record<string, unknown>);
      if (charts.length > 1) return;
      continue;
    }
    pending.push(...Object.values(node));
  }
  if (pending.length || charts.length !== 1) return;
  const chart = charts[0];
  if ((chart.type !== 'line' && chart.type !== 'bar') || !Array.isArray(chart.data) || chart.data.length < 2 || chart.data.length > 12 ||
      typeof chart.x !== 'string' || !Array.isArray(chart.series) || chart.series.length !== 1 ||
      typeof chart.series[0] !== 'string') return;

  const labels = new Set<number>();
  const points: MonthlyPoint[] = [];
  for (const row of chart.data) {
    if (!row || typeof row !== 'object') return;
    const label = row[chart.x], value = row[chart.series[0]];
    const month = typeof label === 'string' ? months.get(label.trim().toLowerCase()) : undefined;
    if (month === undefined || labels.has(month) || typeof value !== 'number' || !Number.isFinite(value)) return;
    const previous = points.at(-1);
    if (previous && (previous.month + 1) % 12 !== month) return;
    labels.add(month);
    points.push({ month, value });
  }
  const format = chart.format === 'currency' || chart.format === 'percent' ? chart.format : 'number';
  return { type: chart.type, points, format, currency: format === 'currency'
    ? typeof chart.currency === 'string' && /^[A-Za-z]{3}$/.test(chart.currency) ? chart.currency.toUpperCase() : 'USD'
    : undefined };
}

/** Flag explicit direction and ranked-gain claims that conflict with the
 * displayed consecutive points. Other baselines and ambiguous claims remain unclassified. */
export function contradictsMonthlyChart(root: unknown, prose: string): boolean {
  const series = monthlySeries(root);
  if (!series) return false;
  const changes = new Map(series.points.slice(1).map(({ month, value }, index) => {
    const base = series.points[index].value;
    return [month, { amount: value - base, rate: base > 0 ? (value - base) / base : undefined }] as const;
  }));
  const plain = prose.replace(/[\x60*_]/g, '');
  const claims = new RegExp('(?:^|[.!?;:\\n])\\s*(' + monthList + ')\\s+(' + lower + '|' + higher +
    ')\\b(?!\\s+(?:from|versus|vs\\.?|compared|relative|since|year[- ]over[- ]year|yoy)\\b)', 'gi');
  for (const [, subject, verb] of plain.matchAll(claims)) {
    const direction = lower.split('|').includes(verb.toLowerCase()) ? -1 : 1;
    for (const match of subject.matchAll(new RegExp('\\b' + monthPattern + '\\b', 'gi'))) {
      const month = months.get(match[0].toLowerCase())!;
      const change = changes.get(month);
      if (change && Math.sign(change.amount) !== direction) return true;
    }
  }

  const rankClaim = new RegExp(
    '\\b(' + monthPattern + ')\\b(?:\\s+(?:is|was|has|had|adds|added|posts|posted|records|recorded|saw)|' +
    '[’\']s\\s+(?:gain|increase|rise|[+−-]?(?:[$€£]|USD\\s*)?[0-9,.]+(?:\\s*\\([+−-]?[0-9,.]+%\\))?)\\s+(?:is|was))' +
    '\\s+(?:the\\s+)?(?:(second[- ]largest|largest|biggest|strongest)\\s+(percentage|percent|dollar|absolute)\\s+(?:gain|increase|rise)|most\\s+dollars)' +
    '\\b(?!\\s+(?:since|from|versus|vs\\.?|compared|relative|after|before|until|among|within|excluding|year[- ]over[- ]year|yoy|at that point)\\b)', 'gi');
  for (const match of plain.matchAll(rankClaim)) {
    const [, monthName, rank, unit] = match;
    const prefix = plain.slice(Math.max(0, match.index - 100), match.index).split(/[.!?;\n]/).at(-1) ?? '';
    if (/\b(?:since|before|after|until|among|excluding|within|first|last|year[- ]over[- ]year|yoy)\b/i.test(prefix)) continue;
    const change = changes.get(months.get(monthName.toLowerCase())!);
    if (!change) continue;
    const metric = unit?.toLowerCase().startsWith('percent') ? 'rate' : 'amount';
    const values = [...changes.values()].map(row => row[metric]);
    const candidate = change[metric];
    if (candidate === undefined || values.some(value => value === undefined)) continue;
    const expectedRank = rank?.toLowerCase().startsWith('second') ? 2 : 1;
    if (candidate <= 0 || 1 + values.filter(value => value! > candidate).length !== expectedRank) return true;
  }
  const counts = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const count = '(\\d{1,2}|' + counts.join('|') + ')';
  const fraction = count + '\\s+of\\s+(?:the\\s+)?' + count + '\\s+months?\\b';
  const numeric = (value: string) => /^\d/.test(value) ? Number(value) : counts.indexOf(value.toLowerCase());
  const rises = [...changes.values()].filter(change => change.amount > 0).length;
  for (const pattern of ['\\bthe series (?:rises|increases|grew) in\\s+' + fraction,
    '(?:^|[.!?;:\\n])\\s*' + fraction + '\\s+(?:rose|increased|grew)\\b(?!\\s+(?:from|versus|compared|since|year[- ]over[- ]year|yoy)\\b)']) {
    for (const [, numerator, denominator] of plain.matchAll(new RegExp(pattern, 'gi'))) {
      if ([series.points.length, changes.size].includes(numeric(denominator)) && numeric(numerator) !== rises) return true;
    }
  }
  return false;
}

export function monthlyChartDataFallback(root: unknown): { text: string; program: string } | undefined {
  const series = monthlySeries(root);
  if (!series) return;
  const unit = series.currency ?? (series.format === 'percent' ? '%' : undefined);
  const label = unit ? 'Chart value (' + unit + ')' : 'Chart value';
  const rows = series.points.map(({ month, value }, index) =>
    '| ' + monthNames[month] + ' | ' + value + ' | ' + (index ? Number((value - series.points[index - 1].value).toPrecision(15)) : '') + ' |');
  const text = ['Partial answer. The written summary disagreed with the plotted data, so it was withheld. These are the chart values and changes from the preceding displayed month.',
    '', '| Month | ' + label + ' | Change |', '| --- | ---: | ---: |', ...rows].join('\n');
  // Rebuild from numeric points, rather than carrying any model-authored
  // title, note, state, sibling component or action into the reviewed answer.
  const data = JSON.stringify(series.points.map(({ month, value }) => ({ Month: monthNames[month], Value: value })));
  const args = [JSON.stringify(series.type), data, '"Month"', '["Value"]', JSON.stringify(series.format),
    JSON.stringify(series.currency ?? null), 'false', '240', JSON.stringify({ xLabel: 'Month', yLabel: label })];
  return { text, program: 'root = Col([Markdown(' + JSON.stringify(text) + '), Chart(' + args.join(', ') + ')])' };
}
