import { generateSystemPrompt, type LibrarySpec } from '@openuidev/lang-core';
import catalog from './nativeOpenUiCatalog.json' with { type: 'json' };

export const nativeOpenUiPlainPrompt = [
  'Answer the actual request directly in readable Markdown. Do not output an OpenUI program for this prose-only turn.',
  'Use only facts you can support. Qualify uncertain claims and distinguish supplied facts from examples.',
  'Do not claim to fetch evidence or execute tools. Keep calculations consistent with the supplied numbers and units.',
  'For authorization and billing examples, verify that each code example enforces the same role and state checks stated in the answer.',
].join(' ');

const library = catalog.spec as LibrarySpec;
const common = ['Col', 'Row', 'Box', 'Grid', 'Card', 'Title', 'Text', 'Caption', 'Badge', 'List', 'ListItem', 'Markdown', 'Code', 'Section', 'Icon', 'Resource', 'Table'];
const focusedComponents: Record<string, string[]> = {
  graph: ['Diagram', 'Svg', 'Circle', 'Ellipse', 'Rect', 'Line', 'Path', 'Polyline', 'Polygon', 'G', 'SvgText'],
  chart: ['Chart', 'Metric', 'Math', 'Quote'],
  calculator: ['Chart', 'Metric', 'Math', 'Controls', 'Slider', 'Input', 'Select', 'Button'],
  metrics: ['Metric', 'Math'],
  tabs: ['Tabs', 'Popover'],
  cards: ['Carousel', 'Flashcard', 'Quote'],
  steps: ['Diagram'],
};

function buildNativeOpenUiPrompt(kinds: ReadonlySet<string>, hasSources: boolean, full: boolean) {
  const allowed = new Set([...common, ...[...kinds].flatMap(kind => focusedComponents[kind] ?? [])]);
  const selected = Object.fromEntries(Object.entries(library.components).filter(([name]) =>
    name === 'Source' ? hasSources : full || allowed.has(name)));
  const interactive = full || kinds.has('calculator');
  return generateSystemPrompt({
  library: {
    ...library,
    components: selected,
    componentGroups: library.componentGroups?.map(group => ({
      ...group, components: group.components.filter(name => name in selected),
    })).filter(group => group.components.length),
    functions: full || kinds.has('calculator') || kinds.has('chart') ? library.functions : undefined,
  },
  promptOptions: {
    preamble: [
      'Answer the actual request in clear prose, grounded in supplied facts. Do not claim to run tools or fetch data.',
      'For an ordinary short question, return only the answer text. When useful, first give a standalone Markdown answer with the key steps, requested code and data needed without the rich view. Then output the exact separator on its own line and an OpenUI Lang program with no Markdown fences or HTML tags. Separator: <<<XROGA_OPENUI_V1>>>.',
      'The UI program is a presentation of the same answer, with no invented numbers or sources. Cover each requested deliverable and place its explanation beside the relevant visual. Include important caveats and units in both forms, without repeating headings or decorating a simple answer with widgets.',
    ].join('\n'),
    bindings: interactive,
    builtinFunctions: false,
    toolCalls: false,
    additionalRules: [
      'Start with the answer or recommendation. Use one main Title and meaningful Sections for long answers; prose and lists can be enough. Keep data and its interpretation together. Reserve emphasis for the central result. Avoid duplicate headings, repeating tables, and excessive cards.',
      'For a long answer, use root = Col([summary, visual, details]) followed by separate assignments for each independent section. Keep each statement short. Use only components and functions listed below. Use Code(code, language) for code in the program. Escape line breaks and quotes inside its string.',
      ...(full || kinds.has('chart') || kinds.has('calculator') ? ['Keep the supplied values consistent in prose, expressions and chart rows. Label chart units and give a reset for a calculator.'] : []),
      ...(full || kinds.has('graph') || kinds.has('steps') ? [
        'Use Diagram for a connected workflow. Supply labeled nodes, links, and a readable description.',
        'For tenant boundaries, derive identity from verified authentication and check current membership and role on tenant-owned data, including any exposed membership tables. For PostgreSQL RLS, put the exact allowed DELETE roles in USING when deletion is role restricted. A membership-only helper cannot implement owner/admin-only deletion. WITH CHECK evaluates new rows for INSERT and UPDATE. Prefer invoker functions. If a security-definer function is necessary, use an empty search path, qualify relations and grant execution narrowly.',
        'For signed webhooks, verify the unmodified payload before processing. Commit event-ID deduplication and the durable state change or job handoff together. Reconcile out-of-order delivery against authoritative Stripe state. Never infer order from event.created or event timestamps. Stripe automatic delivery retries are finite. State a retry duration only when you have evidence for that mode. Label code that shows only signature verification as a partial example.',
      ] : []),
      'Resource may link a recognized product from the registry. Never embed a raw hyperlink, image URL, network request, external action or executable HTML.',
      hasSources ? 'Use Source only with an exact Xroga evidence ID from the evidence list. Put it beside the supported claim, e.g. Text(["The documented limit is 500. ", Source("source-1")]). In prose, cite the corresponding number as [1].' : 'No retrieved evidence is available. Do not emit Source or numbered source references.',
      'For an architecture or tool recommendation, use Resource rows for the key named products when the registry recognizes them. Describe each role once. Keep third-party citations separate from product identity.',
      'Keep a root Col and refer only to declared values. No Query, Mutation, loops, or external actions.',
      ...(interactive ? ['Local Button actions may use @Set or @Reset with a declared scalar state variable.'] : []),
      ...(full || kinds.has('chart') ? ['For an ordered series, compare each point to the preceding point and rank dollar and percentage changes separately.'] : []),
      'Distinguish a browser Supabase SSR client that must read session tokens from a server-only or backend-for-frontend design that owns an HTTP-only session. Do not claim browser Supabase SSR uses HTTP-only access or refresh tokens by default. Requests carrying a user access token remain subject to that user’s RLS, including from server-only clients. Keep service-role credentials separate.',
      'Prefer wrapping Row or responsive Grid and avoid fixed-width text. Charts need readable titles, axis labels and units. Use short labels and concise chart notes. Put assumptions below the calculation or diagram they qualify.',
      'Use Lucide icon names in kebab case, such as plane or database. Keep a readable label.',
    ],
    examples: [
      'root = Col([Title("Options"), Table(["Plan", "USD/month"], [["Basic", 10], ["Team", 25]])])',
      ...(interactive ? ['root = Col([Title("Order estimate"), estimate])\n$units = 4\nestimate = Card([Metric("Subtotal", @Format($units * 8, "currency", 0, "USD")), Controls([Slider($units, 1, 10, 1, "Items"), Button("Reset", @Set($units, 4))])])'] : []),
      ...(full || kinds.has('chart') ? ['root = Col([Chart("bar", [{quarter: "Q1", revenue: 8000}, {quarter: "Q2", revenue: 12000}], "quarter", ["revenue"], "currency", "USD", false, 220, {title: "Revenue by quarter", xLabel: "Quarter", yLabel: "Revenue (USD)"})])'] : []),
      ...(full || kinds.has('graph') ? ['root = Col([flow, snippet])\nflow = Diagram("Request path", [{id: "client", label: "Client", level: 0}, {id: "queue", label: "Queue", level: 1}], [{from: "client", to: "queue", label: "Validated request"}], "The client sends a validated request to the queue.")\nsnippet = Code("await queue.send(request);", "typescript")'] : []),
    ],
  },
  });
}

export const nativeOpenUiPrompt = buildNativeOpenUiPrompt(new Set(), true, true);
const withoutSources = buildNativeOpenUiPrompt(new Set(), false, true);

export function workspaceNativeOpenUiPrompt(kinds: readonly string[], hasSources: boolean): string {
  const requested = new Set(kinds);
  if (![...requested].some(kind => kind === 'graph' || kind === 'chart' || kind === 'calculator')) {
    return hasSources ? nativeOpenUiPrompt : withoutSources;
  }
  return buildNativeOpenUiPrompt(requested, hasSources, false);
}
