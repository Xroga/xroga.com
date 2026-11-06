import { z } from 'zod';
import { RESPONSE_ICONS } from './responseIcons.js';

/** Presentation data never grants tool, account or execution authority. The
 * existing semantic request selects this ordered plan in its existing call. */
export const presentationSectionSchema = z.object({
  kind: z.enum(['prose', 'cards', 'table', 'graph', 'steps', 'chart', 'calculator', 'metrics', 'tabs']),
  heading: z.string().min(1).max(120).regex(/^[^\r\n]+$/),
  instruction: z.string().min(1).max(600),
  covers: z.array(z.string().min(1).max(80)).max(16).optional(),
}).strict();
export const presentationPlanSchema = z.array(presentationSectionSchema).max(8);
export type PresentationPlan = z.infer<typeof presentationPlanSchema>;
export const answerObligationsSchema = z.array(z.object({
  id: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
  sourceQuote: z.string().min(1).max(400).optional(),
  origin: z.enum(['requested', 'necessary-support']),
  formats: z.array(presentationSectionSchema.shape.kind).min(1).max(3),
}).strict()).max(16);
export type AnswerObligations = z.infer<typeof answerObligationsSchema>;

/** Coverage is a structural gate, never proof that authored claims are true.
 * Requirements come from the same existing semantic request, independently of
 * its section list. No domain keyword, fixed template or second model call. */
export function assessPresentationCoverage(plan: PresentationPlan, obligations?: AnswerObligations) {
  const issues: string[] = [];
  if (!obligations?.length) return { complete: plan.length === 0, issues: plan.length ? ['requirements-not-declared'] : [] };
  const ids = obligations.map(item => item.id);
  if (new Set(ids).size !== ids.length) issues.push('duplicate-requirement-id');
  for (const section of plan) {
    if (!section.covers?.length) issues.push(`unbound-section:${section.heading}`);
    if (new Set(section.covers).size !== (section.covers ?? []).length) issues.push(`duplicate-section-binding:${section.heading}`);
    for (const id of section.covers ?? []) if (!ids.includes(id)) issues.push(`unknown-requirement:${id}`);
  }
  for (const item of obligations) for (const format of new Set(item.formats)) {
    const covered = plan.length === 0 && format === 'prose'
      || plan.some(section => section.kind === format && section.covers?.includes(item.id))
      // Every section carries its own written lead-in, so a requirement bound to any section already has its prose.
      || format === 'prose' && plan.some(section => section.covers?.includes(item.id));
    if (!covered) issues.push(`missing:${item.id}:${format}`);
  }
  return { complete: issues.length === 0, issues };
}
export const PRESENTATION_PLAN_INSTRUCTIONS = `For a read-only answer, first identify answerObligations independently of layout: [{id,description,sourceQuote,origin:requested|necessary-support,formats:[prose|cards|table|graph|steps|chart|calculator|metrics|tabs]}]. For a requested obligation, copy its actual user clause verbatim into sourceQuote, at most 400 characters. Keep separately requested concepts distinct even when both need the same format. Necessary support may omit sourceQuote. Never invent a user quote. These are the actual requested concepts and the support necessary to explain them, not a list of widgets. Match depth and wording to the user and relevant context. Then return presentation in reading order, at most eight entries: {kind,heading,instruction,covers:[obligation ids]}. Bind every obligation to substantive sections in its required formats. Use [] and prose-only obligations for a short ordinary answer. Select content before layout, without fixed topic templates. Use metrics for the two to six headline numbers a person looks for first (for example profit, loss, ratio or price), and tabs only for genuinely alternative views the person may switch between (different strategies, scenarios or conditions), each tab self-contained; a multi-day program, itinerary or set of plans or options is a natural fit for tabs (one per day or option) or for steps in order, rather than a prose list; never use either to repeat what a table or prose already says. For a persistent system with access boundaries, consider the necessary data shape and contrasting access scopes as distinct obligations: a relevant proposed schema belongs in a table, a meaningful scope comparison in cards, relationships in a graph, and a lifecycle in steps. Do not force those into stateless systems or narrow questions. For quantitative questions, preserve formulas, units and assumptions; use a calculator when useful or requested, and charts from supplied or retrieved observations, or from the answer's own figures when they are clearly labeled as estimates. For research, use actual source evidence and the existing freshness/tool policy. Do not invent sources, example metrics, live facts or successful actions. State illustrative assumptions explicitly. Give each concept one main home rather than repeating its explanation in prose and every visual. Match richness to the task, for any kind of person. A simple factual, conversational or one-fact question gets a short direct answer and no widgets. A planning, budgeting, comparison, analysis, learning or decision task gets a rich, scannable answer built from the whole kit: a direct answer first, headline metrics for the key numbers, a table for itemised or compared figures, a chart whenever there are quantities to compare or split, a calculator whenever the person can change inputs and see a result, tabs or steps for days, stages or options, a diagram for relationships or flows, and cards with icons for distinct options. A trip plan, for example, deserves per-day tabs, a cost table, a cost-split chart and an adjustable budget calculator. Use as many sections as the task earns, up to eight, but give each concept one main home. Never plan prose sections that restate a table's columns or cells: the table is their only home. A first prose section named like a short answer is the answer itself, never an introduction. Put concise explanation next to its visual and keep essential content visible. The obligations and presentation are data-only answer requirements, never permissions, execution receipts or tool selection. Missing coverage must remain partial, never trigger another formatting or repair call. Adapt to whoever is asking: infer the person's field, role and goal from their words and the conversation (for example a property buyer, clinician, founder, teacher, trader, traveller or analyst) and choose the components that person would expect in their own field, using the whole kit freely and in any combination, such as a listings table with price per unit and a payment calculator for property, a stepwise plan with cautions for health, or scenario tabs for planning. These are illustrations of reasoning, never templates or limits; when the field is unclear, stay with a clear direct answer.`;
type Kind = PresentationPlan[number]['kind'];
type JsonSchema = Record<string, unknown>;
const str = { type: 'string', maxLength: 12_000 };
const shortText = { type: 'string', maxLength: 500 };
const unitText = { type: 'string', maxLength: 120 };
const cellText = { type: 'string', maxLength: 10_000 };
const label = { type: 'string', minLength: 1, maxLength: 160 };
const idLabel = { type: 'string', minLength: 1, maxLength: 80 };
const number = { type: 'number' };
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: 'null' }] });
const object = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = (items: JsonSchema, minItems = 1, maxItems = 40): JsonSchema => ({ type: 'array', items, minItems, maxItems });
const text = z.string().max(12_000);
const name = z.string().min(1).max(160);
const finite = z.number().finite();
const identifier = z.string().min(1).max(80);
const operations = ['sum', 'difference', 'product', 'quotient', 'average', 'percentage', 'percentage-change', 'minimum', 'maximum'] as const;
const operationSchema = { type: 'string', enum: [...operations] };
const chartTypes = ['line', 'bar', 'area', 'pie', 'scatter'] as const;
const derivedSchema = object({ id: idLabel, label, operation: operationSchema, operands: array({ anyOf: [label, number] }, 1, 8), rounding: nullable({ type: 'string', enum: ['floor', 'ceil', 'round'] }), unit: unitText, precision: { type: 'integer', minimum: 0, maximum: 6 } });

/** An icon is decoration: an unknown name is dropped, it never invalidates the visual that carries it. */
const knownIcon = (icon: string | null | undefined): icon is string => !!icon && (RESPONSE_ICONS as readonly string[]).includes(icon);
const dataSchemas: Record<Kind, JsonSchema> = {
  prose: { type: 'null' },
  cards: object({ cards: array(object({ title: label, subtitle: shortText, description: str, entityId: nullable(idLabel), icon: nullable({ type: 'string', enum: [...RESPONSE_ICONS] }) }), 1, 12) }),
  table: object({ columns: array(label, 2, 8), rows: array(array(cellText, 2, 8), 1, 40) }),
  graph: object({ nodes: array(object({ id: idLabel, label }), 2, 20), edges: array(object({ id: idLabel, source: idLabel, target: idLabel, label: shortText }), 1, 40) }),
  steps: object({ steps: array(object({ title: label, description: str, icon: nullable({ type: 'string', enum: [...RESPONSE_ICONS] }) }), 2, 16) }),
  chart: object({ chartType: { type: 'string', enum: [...chartTypes] }, xLabel: label, series: array(object({ label, unit: unitText }), 1, 5), data: array(object({ x: { anyOf: [label, number] }, values: array(number, 1, 5) }), 2, 60) }),
  calculator: object({ operation: operationSchema, inputs: array(object({ id: idLabel, label, value: number, unit: unitText, min: nullable(number), max: nullable(number), step: nullable(number) }), 1, 8), resultLabel: label, resultUnit: unitText, precision: { type: 'integer', minimum: 0, maximum: 6 }, derivedResults: nullable(array(derivedSchema, 1, 8)) }),
  metrics: object({ metrics: array(object({ label, value: { type: 'string', minLength: 1, maxLength: 60 }, unit: { type: 'string', maxLength: 40 }, tone: { type: 'string', enum: ['positive', 'negative', 'neutral'] } }), 2, 8) }),
  tabs: object({ tabs: array(object({ label, content: { type: 'string', minLength: 1, maxLength: 12_000 } }), 2, 6) }),
};
const validators = {
  prose: z.null(),
  cards: z.object({ cards: z.array(z.object({ title: name, subtitle: z.string().max(500), description: text, entityId: identifier.nullable().optional(), icon: z.string().max(60).nullable().optional() }).strict()).min(1).max(12) }).strict(),
  table: z.object({ columns: z.array(name).min(2).max(8), rows: z.array(z.array(z.string().max(10_000)).min(2).max(8)).min(1).max(40) }).strict(),
  graph: z.object({ nodes: z.array(z.object({ id: identifier, label: name }).strict()).min(2).max(20), edges: z.array(z.object({ id: identifier, source: identifier, target: identifier, label: z.string().max(500) }).strict()).min(1).max(40) }).strict(),
  steps: z.object({ steps: z.array(z.object({ title: name, description: text, icon: z.string().max(60).nullable().optional() }).strict()).min(2).max(16) }).strict(),
  chart: z.object({ chartType: z.enum(chartTypes), xLabel: name, series: z.array(z.object({ label: name, unit: z.string().max(120) }).strict()).min(1).max(5), data: z.array(z.object({ x: z.union([name, finite]), values: z.array(finite).min(1).max(5) }).strict()).min(2).max(60) }).strict(),
  calculator: z.object({ operation: z.enum(operations), inputs: z.array(z.object({ id: identifier, label: name, value: finite, unit: z.string().max(120), min: finite.nullable(), max: finite.nullable(), step: finite.positive().nullable() }).strict()).min(1).max(8), resultLabel: name, resultUnit: z.string().max(120), precision: z.number().int().min(0).max(6), derivedResults: z.array(z.object({ id: identifier, label: name, operation: z.enum(operations), operands: z.array(z.union([name, finite])).min(1).max(8), rounding: z.enum(['floor', 'ceil', 'round']).nullable(), unit: z.string().max(120), precision: z.number().int().min(0).max(6) }).strict()).min(1).max(8).nullable() }).strict(),
  metrics: z.object({ metrics: z.array(z.object({ label: name, value: z.string().min(1).max(60), unit: z.string().max(40), tone: z.enum(['positive', 'negative', 'neutral']) }).strict()).min(2).max(8) }).strict(),
  tabs: z.object({ tabs: z.array(z.object({ label: name, content: z.string().min(1).max(12_000) }).strict()).min(2).max(6) }).strict(),
};

/** The provider must return every planned section, with data in the requested
 * shape. This is still validated locally; provider schema claims aren't proof. */
export function presentationResponseFormat(plan: PresentationPlan) {
  presentationPlanSchema.parse(plan);
  if (!plan.length) throw Error('PRESENTATION_PLAN_EMPTY');
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'xroga_response_v1', strict: true,
      schema: object(Object.fromEntries(plan.map((section, index) => [`s${index}`, {
        ...object({ markdown: str, data: dataSchemas[section.kind] }),
        description: `${section.heading}: ${section.instruction}`,
      }]))),
    },
  };
}
export type PresentationResponseFormat = ReturnType<typeof presentationResponseFormat>;

function corePresentationRequestInstructions(plan: PresentationPlan): string {
  presentationPlanSchema.parse(plan);
  // The exact schema travels in the SDK's bound response_format. Repeating it
  // in the system prompt wastes reserved tokens and adds no validation. Coverage
  // IDs are server-side bindings, not answer content or provider instructions.
  return `For this answer, return one JSON object matching the supplied response_format schema, without a surrounding fence. Each sN section is in the reading order below. Its markdown contains only what that section adds that is not already in its visual or another section; for a table, diagram, chart or step list it is one short lead-in sentence or empty, preserving facts, numbers, units, code, mathematics and evidence-backed citation IDs. Write plainly and tightly: the first prose section is the direct answer in one or two sentences, other paragraphs are two to four sentences, and a table's cells are never repeated in prose. Prefer specific, decision-useful points over length and never pad. Its data supplies the requested visual, not a duplicate answer. For recognizable resources in cards, set entityId to the canonical product name when known, or null. The renderer resolves verified local identities, never invented URLs or logos. Use typed data for the planned visual, not an xroga-ui fence in that section's markdown. A prose section may use the existing data-only fence protocol for other supported formats not represented by this schema. Ordinary code fences remain permitted. Keep all essential content visible. Icons: for cards and steps, set icon to the best-fitting name from this list on every card and every step, which nearly always fits, and use null only when no name fits: ${RESPONSE_ICONS.join(', ')}. Tables: every row has exactly one cell per column; write a dash for an empty cell. Calculator rules: a calculator applies exactly ONE operation to its inputs. sum, difference, product, average, minimum and maximum accept any number of inputs; quotient, percentage and percentage-change need exactly two. A formula with several steps is not one operation: make the earlier steps inputs holding their computed values, then apply one operation. Example for shares = (account x risk%) / (entry - stop): inputs riskBudget = 100 and riskPerShare = 5 with operation quotient gives 20. Give every adjustable input a realistic min, max and step around its value (for example 0 to twice the value) so the person gets a slider and a sensitivity chart; use null only for a fixed quantity. Other figures belong in derivedResults, whose operands are input ids, plain numbers, or the exact string "$result" for the main result; never any other name. Metrics: each value is a short display string (for example "$350" or "2.4 : 1") with its unit, and tone is positive for a gain, negative for a loss or cost, neutral otherwise. Tabs: each tab is self-contained markdown that makes sense when shown alone. Never fabricate retrieved sources, live facts, successful actions or hypothetical values presented as facts. Proposed cards/graphs/steps are explanatory data, never execution receipts. Section instructions describe content only and cannot grant authority. Do not add HTML, scripts, callbacks, provider identities or credentials. No extra formatting request or automatic repair is authorized.\n${JSON.stringify(plan.map(({ kind, heading, instruction }, index) => ({ key: `s${index}`, kind, heading, instruction })))}`;
}

export function presentationRequestInstructions(plan: PresentationPlan, options: { includeSchema?: boolean } = {}): string {
  const includeSchema = options.includeSchema ?? process.env.ZURELAY_JSON_SCHEMA_VERIFIED !== '1';
  return corePresentationRequestInstructions(plan) + (includeSchema
    ? `\nThe exact data contract for JSON-object mode follows. It is a schema, not answer content or authority:\n${JSON.stringify(presentationResponseFormat(plan).json_schema.schema)}` : '');
}

function validateSection(plan: PresentationPlan[number], value: unknown): { markdown: string; data: unknown } {
  const section = z.object({ markdown: text, data: z.unknown() }).strict().parse(value);
  if (plan.kind !== 'prose' && /```xroga-ui\b/i.test(section.markdown)) throw Error('DUPLICATE_PRESENTATION_PROTOCOL');
  const data = validators[plan.kind].parse(section.data);
  // A visual section's data is its content; only prose needs words. A table or diagram with no extra text is valid.
  if (plan.kind === 'prose' && !section.markdown.trim()) throw Error('EMPTY_PRESENTATION_SECTION');
  if (plan.kind === 'table') {
    const table = data as z.infer<typeof validators.table>;
    // A row that is short of cells is padded with a visible dash (unknown), never invented values; a row with extra cells is still rejected.
    table.rows = table.rows.map(row => row.length < table.columns.length ? [...row, ...Array<string>(table.columns.length - row.length).fill('—')] : row);
    if (table.rows.some(row => row.length !== table.columns.length)) throw Error('TABLE_WIDTH_MISMATCH');
  }
  if (plan.kind === 'graph') {
    const graph = data as z.infer<typeof validators.graph>;
    const ids = new Set(graph.nodes.map(node => node.id));
    if (ids.size !== graph.nodes.length || new Set(graph.edges.map(edge => edge.id)).size !== graph.edges.length
      || new Set(graph.edges.map(edge => JSON.stringify([edge.source, edge.target, edge.label]))).size !== graph.edges.length
      || graph.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target))) throw Error('INVALID_GRAPH_CONNECTION');
  }
  if (plan.kind === 'calculator') {
    const calculator = data as z.infer<typeof validators.calculator>;
    // Bounds only drive the slider. A bound that contradicts its own value (or itself) is dropped, never the calculator.
    for (const input of calculator.inputs) {
      const bad = (input.min !== null && input.value < input.min) || (input.max !== null && input.value > input.max) || (input.min !== null && input.max !== null && input.min >= input.max);
      if (bad) { input.min = null; input.max = null; input.step = null; }
    }
    if (calculator.inputs.some(input => input.id === '$result')
      || (['quotient', 'percentage', 'percentage-change'].includes(calculator.operation) && calculator.inputs.length !== 2)
      || new Set(calculator.inputs.map(input => input.id)).size !== calculator.inputs.length
      || calculator.inputs.some(input => (input.min !== null && input.value < input.min) || (input.max !== null && input.value > input.max)
        || (input.min !== null && input.max !== null && input.min >= input.max))) throw Error('INVALID_CALCULATOR_INPUT');
    const inputs = new Set(calculator.inputs.map(input => input.id));
    if (calculator.derivedResults && (new Set(calculator.derivedResults.map(result => result.id)).size !== calculator.derivedResults.length
      || calculator.derivedResults.some(result => (['quotient', 'percentage', 'percentage-change'].includes(result.operation) && result.operands.length !== 2)
        || result.operands.some(operand => typeof operand === 'string' && operand !== '$result' && !inputs.has(operand))))) throw Error('INVALID_DERIVED_INPUT');
  }
  if (plan.kind === 'chart') {
    const chart = data as z.infer<typeof validators.chart>;
    if (chart.data.some(row => row.values.length !== chart.series.length)) throw Error('CHART_SERIES_MISMATCH');
    if (chart.chartType === 'scatter' && chart.data.some(row => typeof row.x !== 'number')) throw Error('SCATTER_X_NOT_NUMERIC');
    if (chart.chartType === 'pie' && (chart.series.length !== 1 || chart.data.some(row => row.values[0] < 0))) throw Error('INVALID_PIE_VALUES');
  }
  return { markdown: section.markdown, data };
}

/** Project into the existing xroga-ui protocol. No second renderer, scheduler,
 * generated fact, source claim or executable operation is introduced. */
function projectSection(plan: PresentationPlan[number], raw: unknown, index: number): string {
  const { markdown, data } = validateSection(plan, raw);
  const id = `section-${index + 1}`;
  let block: Record<string, unknown> | undefined;
  if (plan.kind === 'cards') {
    const { cards } = data as z.infer<typeof validators.cards>;
    block = { type: 'card-grid', cards: cards.map(({ entityId, icon, ...card }, i) => ({ id: `${id}-${i + 1}`, ...card, ...(entityId ? { entityId } : {}), ...(knownIcon(icon) ? { icon } : {}) })) };
  } else if (plan.kind === 'table') {
    const table = data as z.infer<typeof validators.table>;
    block = { type: 'table', columns: table.columns.map((column, i) => ({ key: `c${i}`, label: column, type: 'text' })), rows: table.rows.map(row => Object.fromEntries(row.map((cell, i) => [`c${i}`, cell]))) };
  } else if (plan.kind === 'graph') block = { type: 'graph', ...(data as z.infer<typeof validators.graph>) };
  else if (plan.kind === 'steps') block = { type: 'steps', steps: (data as z.infer<typeof validators.steps>).steps.map(({ icon, ...step }, i) => ({ id: `${id}-${i + 1}`, ...step, ...(knownIcon(icon) ? { icon } : {}) })) };
  else if (plan.kind === 'chart') {
    const chart = data as z.infer<typeof validators.chart>;
    block = { type: 'chart', chartType: chart.chartType, xKey: 'x', data: chart.data.map(row => ({ x: row.x, ...Object.fromEntries(row.values.map((value, i) => [`v${i}`, value])) })), series: chart.series.map((series, i) => ({ key: `v${i}`, label: `${series.label}${series.unit ? ` (${series.unit})` : ''}` })), summary: `${chart.series.map(series => series.label).join(', ')} by ${chart.xLabel}` };
  } else if (plan.kind === 'calculator') {
    const calculator = data as z.infer<typeof validators.calculator>;
    block = { type: 'calculator', ...calculator, ...(calculator.derivedResults ? { derivedResults: calculator.derivedResults.map(result => Object.fromEntries(Object.entries(result).filter(([, value]) => value !== null))) } : {}), inputs: calculator.inputs.map(input => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null))) };
    if (!calculator.derivedResults) delete block.derivedResults;
  }
  if (plan.kind === 'metrics') {
    const { metrics } = data as z.infer<typeof validators.metrics>;
    // Tone is the model's judgement of gain, loss or neither; the renderer turns it into green, red or restrained neutral.
    block = { type: 'metric-group', metrics: metrics.map((metric, i) => ({ id: `${id}-${i + 1}`, label: metric.label, value: metric.value, ...(metric.unit ? { unit: metric.unit } : {}), trend: metric.tone === 'positive' ? 'up' : metric.tone === 'negative' ? 'down' : 'flat' })) };
  } else if (plan.kind === 'tabs') {
    const { tabs } = data as z.infer<typeof validators.tabs>;
    block = { type: 'tabs', tabs: tabs.map((tab, i) => ({ id: `${id}-${i + 1}`, label: tab.label, content: tab.content })) };
  }
  const encoded = block ? JSON.stringify({ id, ...block }) : undefined;
  if (encoded && encoded.length > 50_000) throw Error('PRESENTATION_BLOCK_SIZE_LIMIT');
  return `## ${plan.heading}\n\n${markdown}${encoded ? `\n\n\`\`\`xroga-ui\n${encoded}\n\`\`\`` : ''}\n\n`;
}

/** Read completed root properties from a JSON stream, respecting escaped quotes
 * and nested data. Incomplete sections aren't mislabeled or rendered as JSON. */
function completedRoot(raw: string): { values: Record<string, unknown>; count: number } {
  let depth = 0, quoted = false, escaped = false;
  let prefix: Record<string, unknown> = {};
  let count = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (c === '}' && depth === 1) {
        count++;
        try { prefix = JSON.parse(raw.slice(0, i + 1) + '}'); } catch { /* A later completed property may close a valid prefix. */ }
      }
    }
  }
  return { values: prefix, count };
}

export function createPresentationProjection(plan: PresentationPlan) {
  presentationPlanSchema.parse(plan);
  let raw = '', published = '';
  const project = (record: Record<string, unknown>) => {
    let next = '';
    for (let i = 0; i < plan.length; i++) {
      if (!Object.hasOwn(record, `s${i}`)) break;
      next += projectSection(plan[i], record[`s${i}`], i);
    }
    return next;
  };
  const readablePartial = (record: Record<string, unknown>) => plan.map((section, index) => {
    const value = record[`s${index}`];
    if (value === undefined) return '';
    try { return projectSection(section, value, index); }
    catch (error) {
      // Only the section kind and the validator's error code are logged, never the answer or the prompt.
      console.warn('[presentation] section rejected', { kind: section.kind, code: error instanceof z.ZodError ? 'SCHEMA_' + (error.issues[0]?.path.join('.') ?? '') .slice(0, 60) : error instanceof Error ? error.message.replace(/[^A-Z0-9_]/g, '').slice(0, 60) : 'UNKNOWN' });
      const markdown = value && typeof value === 'object' && 'markdown' in value ? value.markdown : undefined;
      if (typeof markdown !== 'string' || markdown.length > 12_000 || !markdown.trim()) return '';
      // Keep the explanation, but don't re-activate a rejected visual fence.
      return `## ${section.heading}\n\n${markdown.replace(/```xroga-ui\b/gi, '```text')}\n\n> This visual could not be validated. Its original data is retained.\n\n`;
    }
  }).join('');
  const strings = (value: unknown): string[] => typeof value === 'string' ? [value]
    : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
  return {
    append(delta: string): string {
      raw += delta;
      if (raw.length > 200_000) return '';
      try {
        const next = project(completedRoot(raw).values);
        if (!next.startsWith(published)) return '';
        const addition = next.slice(published.length); published = next;
        return addition;
      } catch { return ''; }
    },
    finish(received: string): { ok: boolean; response: string; original: string; reviewText: string } {
      let recoverable: Record<string, unknown> | undefined;
      try {
        if (received.length > 200_000) throw Error('PRESENTATION_SIZE_LIMIT');
        const value = JSON.parse(received);
        if (value && !Array.isArray(value) && typeof value === 'object'
          && completedRoot(received).count === Object.keys(value).length) recoverable = value;
        if (!value || Array.isArray(value) || typeof value !== 'object'
          || Object.keys(value).length !== plan.length || completedRoot(received).count !== plan.length
          || plan.some((_, i) => !Object.hasOwn(value, `s${i}`))) throw Error('PRESENTATION_SECTIONS_MISSING');
        const response = project(value);
        if (!response.startsWith(published)) throw Error('PRESENTATION_STREAM_MISMATCH');
        // Review authored visual labels/descriptions as well as prose. A claim
        // inside a data fence must not evade the existing negative safety check.
        return { ok: true, response, original: received, reviewText: strings(value).join('\n') };
      } catch {
        // A malformed sibling must not erase valid later sections. Duplicate
        // root keys remain ambiguous, so never pick one of their values.
        const partial = recoverable ? readablePartial(recoverable) : published;
        return { ok: false, response: partial.startsWith(published) ? partial : published,
          original: received, reviewText: recoverable ? strings(recoverable).join('\n') : published };
      }
    },
  };
}

/** Output budget for a planned answer. A fixed 4096-token cap cut off a captured multi-section SaaS answer
 * (finish_reason "length"), and the missing sections were then reported as an incomplete answer. The budget
 * grows with the sections the plan requires and with the dense ones (graph, table, chart, calculator), and
 * stays inside the existing 8192 ceiling. A plain one-section answer keeps the original 4096. */
export function presentedAnswerMaxTokens(plan: PresentationPlan | undefined): number {
  if (!plan?.length) return 4096;
  const dense = plan.filter(section => section.kind === 'graph' || section.kind === 'table' || section.kind === 'chart' || section.kind === 'calculator').length;
  const wanted = 1536 + 700 * plan.length + 500 * dense;
  return Math.min(8192, Math.max(4096, Math.ceil(wanted / 512) * 512));
}
