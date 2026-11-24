// Lighthouse's result (an LHR) as the few lines a person or a model needs: the four scores, the load metrics, the audits that failed worst in each category with the first elements
// concerned, and the biggest savings. The full report is large and mostly passed audits; nothing here changes what Lighthouse found.
interface Ref { id: string; weight?: number; group?: string }
interface Audit {
  title?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number;
  details?: { type?: string; overallSavingsMs?: number; overallSavingsBytes?: number; items?: Array<Record<string, unknown>> };
}
export interface Lhr {
  lighthouseVersion?: string;
  requestedUrl?: string;
  finalDisplayedUrl?: string;
  configSettings?: { formFactor?: string; throttlingMethod?: string };
  categories: Record<string, { title: string; score: number | null; auditRefs: Ref[] }>;
  audits: Record<string, Audit>;
  runWarnings?: string[];
}

const METRICS: Array<[string, string]> = [
  ['first-contentful-paint', 'FCP'],
  ['largest-contentful-paint', 'LCP'],
  ['total-blocking-time', 'TBT'],
  ['cumulative-layout-shift', 'CLS'],
  ['speed-index', 'Speed Index'],
  ['interactive', 'Time to Interactive'],
];

const pct = (n: number | null | undefined) => (typeof n === 'number' ? String(Math.round(n * 100)) : 'n/a');

function elementsOf(a: Audit): string {
  const items = a.details?.items ?? [];
  const names: string[] = [];
  for (const it of items) {
    const node = (it.node ?? it) as { selector?: string; nodeLabel?: string; snippet?: string } | undefined;
    const label = node?.selector || node?.nodeLabel || (typeof it.url === 'string' ? it.url : '') || '';
    if (label) names.push(String(label).replace(/\s+/g, ' ').slice(0, 80));
    if (names.length >= 3) break;
  }
  return names.length ? ` e.g. ${names.join('; ')}${items.length > names.length ? ` (+${items.length - names.length} more)` : ''}` : '';
}

export function summarise(lhr: Lhr, perCategory = 6): string {
  const lines: string[] = [];
  const cats = Object.entries(lhr.categories);
  const cfg = lhr.configSettings;
  lines.push(`lighthouse · ${lhr.finalDisplayedUrl ?? lhr.requestedUrl ?? ''} · ${cfg?.formFactor ?? 'mobile'}, ${cfg?.throttlingMethod ?? 'simulated'} throttling · Lighthouse ${lhr.lighthouseVersion ?? ''}`.trim());
  lines.push(`scores (0 to 100): ${cats.map(([, c]) => `${c.title} ${pct(c.score)}`).join(' · ')}`);
  const metrics = METRICS.map(([id, label]) => (lhr.audits[id]?.displayValue ? `${label} ${lhr.audits[id]!.displayValue}` : '')).filter(Boolean);
  if (metrics.length) lines.push(`load: ${metrics.join(' · ')}`);
  for (const [, cat] of cats) {
    const failing = cat.auditRefs
      .map(ref => ({ ref, audit: lhr.audits[ref.id] }))
      .filter((x): x is { ref: Ref; audit: Audit } => !!x.audit && ['numeric', 'binary', 'metricSavings'].includes(x.audit.scoreDisplayMode ?? '') && typeof x.audit.score === 'number' && x.audit.score < 0.9)
      .sort((a, b) => (b.ref.weight ?? 0) * (1 - (b.audit.score ?? 0)) - (a.ref.weight ?? 0) * (1 - (a.audit.score ?? 0)) || (a.audit.score ?? 0) - (b.audit.score ?? 0))
      .slice(0, perCategory);
    if (!failing.length) {
      lines.push(`${cat.title}: nothing failed`);
      continue;
    }
    lines.push(`${cat.title}, worst first:`);
    for (const { audit } of failing) lines.push(`- ${audit.title ?? ''}${audit.displayValue ? ` (${audit.displayValue})` : ''}${elementsOf(audit)}`);
  }
  const savings = Object.values(lhr.audits)
    .filter(a => (a.details?.overallSavingsMs ?? 0) > 100)
    .sort((a, b) => (b.details!.overallSavingsMs ?? 0) - (a.details!.overallSavingsMs ?? 0))
    .slice(0, 6);
  if (savings.length) {
    lines.push('biggest savings:');
    for (const a of savings) lines.push(`- ${a.title ?? ''}: about ${Math.round(a.details!.overallSavingsMs!)} ms${a.details!.overallSavingsBytes ? `, ${Math.round(a.details!.overallSavingsBytes / 1024)} KB` : ''}`);
  }
  if (lhr.runWarnings?.length) lines.push(`warnings: ${lhr.runWarnings.slice(0, 3).join(' | ')}`);
  return lines.join(String.fromCharCode(10));
}
