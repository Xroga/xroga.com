import { requiresAuthorizationReview } from './answerAuthorizationReview.js';

type FactualRule = 'stripe_event_order' | 'stripe_retry_window';
export const nativeFactualGuidance: Record<FactualRule, string> = {
  stripe_event_order: 'Stripe event timestamps can tie and do not establish delivery order. Verify the signature, deduplicate by event ID, and reconcile the current subscription state with Stripe before applying a durable update.',
  stripe_retry_window: 'Stripe automatic webhook retries have a finite delivery window. Reconcile missed events separately and make processing idempotent.',
};
type TechnicalCorrection = { reason: 'authorization_review' | 'factual_review'; guidance: string; rule?: FactualRule };

/** Catch the documented failure patterns without treating every answer about
 * Supabase or Stripe as suspect. Inspect examples as well as explanatory text. */
export function nativeTechnicalCorrections(answer: string): TechnicalCorrection[] {
  const text = answer.replace(/[\x60*_]/g, '');
  const corrections: TechnicalCorrection[] = [];
  const statements = text.split(/(?<=[.!?;])\s+|\n+/);
  const warnsAgainst = (statement: string) =>
    /\b(?:never|do not|does not|cannot|must not|should not|don't|doesn't|can't|mustn't|shouldn't|still subject to|incorrect|unsafe|unreliable)\b/i.test(statement);
  if (statements.some(statement => !warnsAgainst(statement) &&
    !/\b(?:only if|only when)\b[^.!?;\n]{0,90}\b(?:service[- ]role|bypassrls)\b/i.test(statement) &&
    /\b(?:HTTP[- ]only\b[^.!?;\n]{0,80}\b(?:cookie|session|token)s?|(?:user|end[- ]user)(?:'s)?\s+(?:session|access token|jwt)s?)\b[^.!?;\n]{0,110}\bbypass(?:es)?\s+(?:tenant\s+)?(?:RLS|row[- ]level security)\b/i.test(statement))) {
    corrections.push({
      reason: 'authorization_review',
      guidance: 'A request carrying a user access token remains subject to that user’s row-level policies, even when the server stores the token in an HTTP-only cookie. Keep service-role access separate and check current tenant membership and role before privileged operations.',
    });
  }
  const promisesRoleCheck = /\b(?:delet(?:e|ion|ing)|deletes)\b[^.!?;\n]{0,100}\b(?:requires?|restricted to|limited to)\s+(?:an?\s+)?(?:tenant\s+)?(?:owner|admin)\b/i.test(text)
    || /\bonly\s+(?:tenant\s+)?(?:owners?|admins?)(?:\s+(?:or|and)\s+(?:owners?|admins?))?\s+(?:can|may)\s+delet/i.test(text);
  const membershipOnlyDelete = /\bcreate\s+policy\b[^;]{0,480}\bfor\s+delete\s+(?:to\s+[\w", ]{1,80}\s+)?using\s*\(\s*(?:(?:"?[\w]+"?)\.)?(?:is_)?(?:tenant|org|workspace)_member(?:ship)?\s*\(\s*[\w."]+\s*\)\s*\)\s*;/i.test(answer);
  if (promisesRoleCheck && membershipOnlyDelete) {
    corrections.push({
      reason: 'authorization_review',
      guidance: 'Where deletion is restricted to owners or admins, the DELETE policy’s USING predicate must verify the caller’s current membership and allowed role for the row’s tenant. A membership-only predicate does not enforce that rule.',
    });
  }
  if (/\bStripe\b/i.test(text) && statements.some(statement => !warnsAgainst(statement) &&
    /\b(?:compare|sort(?:\s+by)?|order(?:\s+by)?|rely\s+on|use)\b[^.!?;\n]{0,40}\b(?:event\s+timestamps?|event\.created)\b/i.test(statement) &&
    /\b(?:order(?:ed|ing)?|stored state|newer|older|stale|reconcil|sort)\w*\b/i.test(statement))) {
    corrections.push({
      reason: 'factual_review',
      rule: 'stripe_event_order',
      guidance: nativeFactualGuidance.stripe_event_order,
    });
  }
  // Stripe's automatic delivery attempts have a finite window in both modes.
  if (/\bStripe\s+(?:(?:will|would|can|automatically)\s+)*retr(?:y|ies)\s+(?:(?:failed\s+)?(?:webhook\s+)?(?:events?|deliver(?:y|ies))\s+)?(?:forever|indefinitely|without (?:a )?limit)\b/i.test(text)) {
    corrections.push({
      reason: 'factual_review',
      rule: 'stripe_retry_window',
      guidance: nativeFactualGuidance.stripe_retry_window,
    });
  }
  return corrections;
}

/** Review specific authorization errors in native answers. */
function requiresNativeAuthorizationReview(answer: string): boolean {
  if (requiresAuthorizationReview(answer)) return true;
  const prose = answer.replace(/```[^\n]*\n[\s\S]*?```/g, '').replace(/[\x60*_]/g, '');
  return prose.split(/(?<=[.!?])\s+|\n+/).some(sentence => {
    const deletionClaim = /\b(?:delete|deleting|deletion)\b[^.!?;\n]{0,85}\b(?:belongs?|goes?|must be|should be)\s+in\s+(?:an?\s+)?with\s+check\b/i.exec(sentence) ??
      /\b(?:for\s+delete(?:\s+polic(?:y|ies))?|delete\s+policies)\s*[:,]?\s*(?:(?:must|should)\s+)?use\s+(?:an?\s+)?with\s+check\b/i.exec(sentence);
    if (deletionClaim && !/\b(?:never|do not|don't|cannot|should not)\b/i.test(sentence.slice(0, deletionClaim.index))) return true;
    return /\bSupabase\b/i.test(sentence) &&
      /\b(?:browser|client[- ]side|default|standard)\b/i.test(sentence) &&
      /\b(?:receives?|gets?|sets?|uses?|stores?|issues?)\b[^.!?\n]{0,100}\bHTTP[- ]?only\b[^.!?\n]{0,50}\b(?:cookies?|tokens?)\b/i.test(sentence) &&
      !/\b(?:not|never|doesn't|cannot|without|server[- ]only|BFF|backend[- ]for[- ]frontend)\b/i.test(sentence);
  });
}

export function reviewNativeAnswer(answer: string): { reason: TechnicalCorrection['reason']; rule?: FactualRule; guidance?: string } | undefined {
  if (requiresNativeAuthorizationReview(answer)) return { reason: 'authorization_review' };
  return nativeTechnicalCorrections(answer)[0];
}

export function nativeAnswerReviewReason(answer: string) {
  return reviewNativeAnswer(answer)?.reason;
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

function monthlyChanges(series: MonthlySeries) {
  return series.points.slice(1).map(({ month, value }, index) => {
    const base = series.points[index].value;
    const amount = Number((value - base).toPrecision(15));
    const rate = base > 0 ? amount / base : undefined;
    return { month, amount, rate: rate !== undefined && Number.isFinite(rate * 100) ? rate : undefined };
  });
}

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
  const changes = new Map(monthlyChanges(series).map(change => [change.month, change]));
  const plain = prose.replace(/[\x60*_]/g, '');
  const rank = 'second[- ]largest|largest|biggest|strongest|highest';
  const unit = 'percentage|percent|dollar|absolute';
  const scope = 'since|from|versus|vs\\.?|compared|relative|after|before|until|among|within|excluding|year[- ]over[- ]year|yoy|at that point';
  const rankDisagrees = (monthName: string, metric: 'amount' | 'rate', expected: number) => {
    const candidate = changes.get(months.get(monthName.toLowerCase())!)?.[metric];
    const values = [...changes.values()].map(row => row[metric]);
    return candidate !== undefined && values.every(value => value !== undefined) &&
      (candidate <= 0 || 1 + values.filter(value => value! > candidate).length !== expected);
  };
  const metricFor = (label?: string) => label?.toLowerCase().startsWith('percent') ? 'rate' : 'amount';
  const expectedRank = (label?: string) => label?.toLowerCase().startsWith('second') ? 2 : 1;
  const precedingClause = (index: number) => plain.slice(Math.max(0, index - 200), index).split(/[.!?;\n]/).at(-1) ?? '';
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
    '\\s+(?:the\\s+)?(?:(' + rank + ')\\s+(' + unit + ')\\s+(?:gain|increase|rise)|most\\s+dollars)' +
    '\\b(?!\\s+(?:' + scope + ')\\b)', 'gi');
  for (const match of plain.matchAll(rankClaim)) {
    const [, monthName, rankLabel, unitLabel] = match;
    const prefix = precedingClause(match.index);
    if (/\b(?:since|before|after|until|among|excluding|within|first|last|year[- ]over[- ]year|yoy)\b/i.test(prefix)) continue;
    if (rankDisagrees(monthName, metricFor(unitLabel), expectedRank(rankLabel))) return true;
  }
  const labelClaim = new RegExp(
    '(?:^|[.!?;\\n])\\s*(?:[-•]\\s*)?(?:the\\s+)?(' + rank + ')\\s+(' + unit + ')\\s+(?:gain|increase|rise)\\s*:\\s*' +
    '(?:' + monthPattern + '\\s*(?:→|->|to)\\s*)?(' + monthPattern + ')\\b(?!\\s+(?:' + scope + ')\\b)', 'gi');
  for (const [, rankLabel, unitLabel, monthName] of plain.matchAll(labelClaim)) {
    if (rankDisagrees(monthName, metricFor(unitLabel), expectedRank(rankLabel))) return true;
  }
  // When a trend sentence explicitly ranks both dollar and percentage growth,
  // evaluate both metrics. "Strongest month" by revenue level alone is distinct.
  const jointClaim = new RegExp(
    '\\b(' + monthPattern + ')\\b(?:\\s+(?:was|is))?\\s+the\\s+(' + rank + ')\\s+month\\s+in\\s+both\\s+' +
    '(?:dollar(?:s)? and (?:percentage|percent)|(?:percentage|percent) and dollar(?:s)?)\\s+terms\\b(?!\\s+(?:' + scope + ')\\b)', 'gi');
  for (const match of plain.matchAll(jointClaim)) {
    const [, monthName, rankLabel] = match;
    const prefix = precedingClause(match.index);
    if (!/\b(?:accelerat\w*|growth|gains?|increas\w*|rose|ris\w*|grew)\b/i.test(prefix) ||
        /\b(?:since|before|after|until|among|excluding|within|first|last|year[- ]over[- ]year|yoy)\b/i.test(prefix)) continue;
    if (rankDisagrees(monthName, 'amount', expectedRank(rankLabel)) || rankDisagrees(monthName, 'rate', expectedRank(rankLabel))) return true;
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

/** Only treat an explicitly closed monthly comparison as entirely data-driven.
 * Ambiguous or mixed requests still use the general native response contract. */
export function suppliedMonthlyComparison(prompt: string): MonthlyPoint[] | undefined {
  if (prompt.length > 2000 || !/\bmonthly\b/i.test(prompt) || !/\b(?:chart|plot)\b/i.test(prompt)
      || !/\bmonth[- ]over[- ]month\b/i.test(prompt) || !/\b(?:largest|biggest)\b/i.test(prompt)
      || !/\buse only (?:these|the) (?:supplied|provided) values\b/i.test(prompt)
      || !/\bUSD\b/i.test(prompt)) return;
  const pair = new RegExp('\\b(' + monthPattern + ')(?:\\s*[:=]\\s*|\\s+)\\$?([+-]?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]+)?)(?![a-z0-9]|[.,][0-9])', 'gi');
  const points: MonthlyPoint[] = [];
  for (const [, label, number] of prompt.matchAll(pair)) {
    const point = { month: months.get(label.toLowerCase())!, value: Number(number.replace(/,/g, '')) };
    const previous = points.at(-1);
    if (points.length === 12 || Math.abs(point.value) > 1e15 || (previous && (previous.month + 1) % 12 !== point.month)) return;
    points.push(point);
  }
  return points.length >= 3 ? points : undefined;
}

export function monthlyChartDataFallback(root: unknown, options?: {
  supplied: readonly MonthlyPoint[];
  partial: boolean;
}): { text: string; program: string; dataMismatch: boolean } | undefined {
  const series = monthlySeries(root);
  if (!series) return;
  // The caller may have exact user values. Never certify a model-authored
  // dataset that changes a point, omits a month or substitutes different units.
  const dataMismatch = !!options && (series.currency !== 'USD' || series.points.length !== options.supplied.length ||
    series.points.some((point, index) => point.month !== options.supplied[index].month || point.value !== options.supplied[index].value));
  if (dataMismatch && options) {
    series.points = [...options.supplied];
    series.currency = 'USD';
    series.format = 'currency';
  }
  const unit = series.currency ?? (series.format === 'percent' ? '%' : undefined);
  const label = unit ? 'Chart value (' + unit + ')' : 'Chart value';
  const changes = monthlyChanges(series);
  const formatValue = (value: number) => series.currency
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: series.currency, maximumSignificantDigits: 15 }).format(value)
    : new Intl.NumberFormat('en-US', { maximumSignificantDigits: 15 }).format(value) + (series.format === 'percent' ? '%' : '');
  const signed = (value: number, format: (n: number) => string) => (value > 0 ? '+' : '') + format(value);
  const percent = (value: number) => new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(value);
  const level = Math.max(...series.points.map(point => point.value));
  const listed = (values: Array<{ month: number }>) => values.map(({ month }) => monthNames[month]).join(', ');
  const compare = (metric: 'amount' | 'rate', format: (n: number) => string) => {
    const values = changes.map(change => change[metric]);
    if (values.some(value => value === undefined)) return 'unavailable across all months because a prior value is zero or negative or the change cannot be represented.';
    const best = Math.max(...values as number[]);
    if (best <= 0) return 'no increase in the displayed period.';
    return signed(best, format) + ' (' + listed(changes.filter(change => change[metric] === best)) + ').';
  };
  const facts = [
    'Largest month-over-month gain: ' + compare('amount', formatValue),
    'Largest relative month-over-month gain: ' + compare('rate', percent),
    'Highest chart value: ' + formatValue(level) + ' (' + listed(series.points.filter(point => point.value === level)) + ').',
  ];
  const opening = dataMismatch
    ? 'Partial answer. The generated chart did not match the supplied values or units. This chart and summary use the values you supplied.'
    : options?.partial !== false
      ? 'Partial answer. The written summary disagreed with the plotted data, so it was withheld.'
      : 'Monthly comparison based on the supplied values.';
  const columns = ['Month', label, 'Change', 'Percent change'];
  const rows = series.points.map(({ month, value }, index) => {
    const change = changes[index - 1];
    return [monthNames[month], value, change ? signed(change.amount, String) : '', !change ? '' :
      change.rate === undefined ? 'n/a' : signed(change.rate, percent)];
  });
  const text = [opening, '', ...facts.map(fact => '- ' + fact), '', '| ' + columns.join(' | ') + ' |',
    '| --- | ---: | ---: | ---: |', ...rows.map(row => '| ' + row.join(' | ') + ' |')].join('\n');
  const data = JSON.stringify(series.points.map(({ month, value }) => ({ Month: monthNames[month], Value: value })));
  const args = [JSON.stringify(series.type), data, '"Month"', '["Value"]', JSON.stringify(series.format),
    JSON.stringify(series.currency ?? null), 'false', '240', JSON.stringify({ xLabel: 'Month', yLabel: label })];
  return { text, dataMismatch, program: 'root = Col([Markdown(' + JSON.stringify([opening, '', ...facts.map(fact => '- ' + fact)].join('\n'))
    + '), Chart(' + args.join(', ') + '), Table(' + JSON.stringify(columns) + ', ' + JSON.stringify(rows) + ')])' };
}
