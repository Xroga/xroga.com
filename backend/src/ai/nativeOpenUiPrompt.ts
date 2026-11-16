import { generateSystemPrompt, type LibrarySpec } from '@openuidev/lang-core';
import catalog from './nativeOpenUiCatalog.json' with { type: 'json' };

const numericPrecisionRule = 'Use quantitative detail when it answers the question. Verify the value, unit, and reference point, baseline, or denominator together. For a short conceptual explanation, omit incidental numbers that are unnecessary to explain the mechanism.';
const dataConsistencyRule = 'Compute totals from unrounded values before formatting. In a native answer, express derived values with the registered pure functions or arithmetic expressions over the supplied inputs, rather than writing a separately guessed numeric literal. For a per-unit price, divide the total price by the included quantity and label the billing period and denominator. Put important calculated values in labeled Metric components so the same calculation drives the visual and saved readable answer. For amortization, multiply the unrounded periodic payment by the number of payments before rounding and subtract the original principal from that total. Use those same values in the prose and controls. When inputs conflict and the user asks to resolve them first, show the discrepancy with no preselected answer and withhold dependent totals or final charts until the user confirms a value.';
const technicalPrecisionRule = 'For version-dependent technical behavior, name the platform and distinguish defaults, optional configuration, and security boundaries. Avoid universal claims you cannot support. In Next.js, environment variables are server-only by default. NEXT_PUBLIC_ is for values exposed to the browser. Server Functions execute on the server and can also be invoked by server code. Do not describe a server-local invocation as inherently requiring a client-server network call. Validate and authorize all exposed calls. React Server Components cannot use most Hooks, including state and effect Hooks; avoid the blanket claim "no hooks", since use and useId are exceptions. React supports Date values and Server Functions in serializable props crossing the server-client boundary; do not conflate this with JSON-only serialization.';
const procedureConsistencyRule = 'For step-by-step procedures, carry precautions into every step they qualify. Do not recommend a later step that violates an earlier precaution. For an accessibility explanation, keep examples consistent with the instructions. In a roving tabindex pattern, one item has tabindex=0, the container adds no tab stop, and arrow-key handlers move actual focus. With aria-activedescendant, focus stays on the container, items add no tab stops, and handlers update the active item ID. Keep the equivalent data table visible.';
const comparisonConsistencyRule = 'For price and capacity comparisons, check every worked example against the stated capacity and unit price. Required units must cover the whole requested quantity. Do not assume that subscriptions, licenses, quotas or bundles can be combined unless the supplied terms say so. Distinguish unit-price savings from the total price the user would actually pay.';

export const nativeOpenUiPlainPrompt = [
  'Answer the actual request directly in readable Markdown. Do not output an OpenUI program for this prose-only turn.',
  'Use only facts you can support. Qualify uncertain claims and distinguish supplied facts from examples.',
  numericPrecisionRule,
  dataConsistencyRule,
  technicalPrecisionRule,
  procedureConsistencyRule,
  comparisonConsistencyRule,
  'Do not claim to fetch evidence or execute tools. Keep calculations consistent with the supplied numbers and units.',
  'For authorization and billing examples, verify that each code example enforces the same role and state checks stated in the answer.',
].join(' ');

const library = catalog.spec as LibrarySpec;
function buildNativeOpenUiPrompt(kinds: ReadonlySet<string>, hasSources: boolean) {
  const selected = Object.fromEntries(Object.entries(library.components).filter(([name]) =>
    hasSources || name !== 'Source'));
  const general = !kinds.size;
  return generateSystemPrompt({
  library: {
    ...library,
    components: selected,
    componentGroups: library.componentGroups?.map(group => ({
      ...group, components: group.components.filter(name => name in selected),
    })).filter(group => group.components.length),
  },
  promptOptions: {
    preamble: [
      'Answer the actual request in clear prose, grounded in supplied facts. Do not claim to run tools or fetch data.',
      'For an ordinary short question, return only the answer text. For a useful rich response, first give the complete readable answer in Markdown, including the requested explanation, data, calculations, units, assumptions, caveats and requested code. Then output the exact separator on its own line and the complete OpenUI Lang answer with no Markdown fences or HTML tags. Separator: <<<XROGA_OPENUI_V1>>>.',
      'The OpenUI program is the primary rich answer. Compose the same authoritative content into its components, using identical facts, wording and values wherever content appears in both representations. The readable answer must stand on its own if the visual cannot be recovered; do not replace important details with a summary, a pointer to the visual or implementation code. For interactive calculations, include the formula, initial inputs and initial result in the readable answer. Xroga retains this content for saved answers and recovery without another model call. Do not invent numbers or sources.',
    ].join('\n'),
    bindings: true,
    builtinFunctions: false,
    toolCalls: false,
    additionalRules: [
      numericPrecisionRule,
      dataConsistencyRule,
      technicalPrecisionRule,
      procedureConsistencyRule,
      comparisonConsistencyRule,
      'Start with the answer or recommendation. Use one main Title and meaningful Sections for long answers; prose and lists can be enough. Keep data and its interpretation together. Reserve emphasis for the central result. Avoid duplicate headings, repeating tables, and excessive cards.',
      'When a table occurs in both the readable answer and the OpenUI program, use identical headers and cell values in both, including the corner header. Do not paraphrase one copy: exact matching lets the interface show the table once while retaining its full content in saved answers and readable recovery.',
      'For a long answer, put a single root Col first, followed by the declarations it references. Inline small components. Reference names are case-sensitive. Declare each name used by the root and its descendants exactly once. Never reference root, an example placeholder, or an undeclared name. Use only listed components and functions. Use strings or ListItem(title, description) inside List. Escape line breaks and quotes inside Code strings.',
      'Keep the supplied values consistent in prose, expressions and chart rows. For comparisons, check that the recommendation holds at the boundaries and matches the worked examples. Label chart units and give a reset for a calculator.',
      ...(general || kinds.has('graph') || kinds.has('steps') ? [
        'Use Diagram for a connected workflow. Use unique lowercase node IDs, numeric levels 0 to 5, at most three nodes per level, and link endpoints that exactly match two distinct node IDs. Omit unused optional fields. If setting a node tone, use neutral, info, success, purple, or warning. Supply a readable description.',
        'For tenant boundaries, derive identity from verified authentication and check current membership and role on tenant-owned data, including any exposed membership tables. For PostgreSQL RLS, put the exact allowed DELETE roles in USING when deletion is role restricted. A membership-only helper cannot implement owner/admin-only deletion. WITH CHECK evaluates the proposed row for INSERT and UPDATE. Membership alone does not make tenant_id immutable for a user who belongs to both tenants. Enforce immutability separately with column privileges or a database trigger when needed. Prefer invoker functions. If a security-definer function is necessary, use an empty search path, qualify relations and grant execution narrowly.',
        'For signed webhooks, verify the unmodified payload before processing. Commit event-ID deduplication and the durable state change or job handoff together. Reconcile out-of-order delivery against authoritative Stripe state. Never infer order from event.created or event timestamps. Stripe automatic delivery retries are finite. State a retry duration only when you have evidence for that mode. Label code that shows only signature verification as a partial example.',
      ] : []),
      'Resource may link a recognized product from the registry. Never embed a raw hyperlink, image URL, network request, external action or executable HTML.',
      hasSources ? 'Use Source only with an exact Xroga evidence ID from the evidence list. Put it beside the supported claim, e.g. Text(["The documented limit is 500. ", Source("source-1")]). In prose, cite the corresponding number as [1].' : 'No retrieved evidence is available. Do not emit Source or numbered source references.',
      'For an architecture or tool recommendation, use Resource rows for the key named products when the registry recognizes them. Describe each role once. Keep third-party citations separate from product identity.',
      'Declare one root Col exactly once. Use descriptive case-sensitive names that start with a letter. Do not append an alternate version of the program. No Query, Mutation, loops, or external actions.',
      'Local Button actions may use @Set or @Reset with a declared scalar state variable.',
      'For editable checklists, use Checkbox directly with one boolean binding per item. Keep labels short and group related items in Sections. Avoid putting each Checkbox inside its own Card, ListItem or named widget.',
      'For an ordered series, subtract the preceding value from the current value before describing the direction, and rank absolute and percentage changes separately. Preserve the sign and zero of supplied observations. A Chart already shows its own accessible data table. Add a separate table only when it contributes distinct figures or comparison details.',
      'Distinguish a browser Supabase SSR client that must read session tokens from a server-only or backend-for-frontend design that owns an HTTP-only session. Do not claim browser Supabase SSR uses HTTP-only access or refresh tokens by default. Requests carrying a user access token remain subject to that user’s RLS, including from server-only clients. Keep service-role credentials separate.',
      'Prefer wrapping Row or responsive Grid and avoid fixed-width text. Charts need readable titles, axis labels and units. Use short labels and concise chart notes. Put assumptions below the calculation or diagram they qualify.',
      'Keep the main answer visible in reading order. Cite a supported claim in a Text or Markdown block beside that claim. Use Section for supporting details and Code only for code the user wants to read.',
      'Use Lucide icon names in kebab case, such as plane or database. Keep a readable label.',
    ],
    examples: [
      'root = Col([Title("Options"), Table(["Plan", "USD/month"], [["Basic", 10], ["Team", 25]])])',
      ...(general || kinds.has('calculator') ? ['root = Col([Title("Order estimate"), estimate])\n$units = 4\nestimate = Card([Metric("Subtotal", @Format($units * 8, "currency", 0, "USD")), Controls([Slider($units, 1, 10, 1, "Items"), Button("Reset", @Set($units, 4))])])'] : []),
      ...(general || kinds.has('chart') ? ['root = Col([Chart("bar", [{quarter: "Q1", revenue: 8000}, {quarter: "Q2", revenue: 12000}], "quarter", ["revenue"], "currency", "USD", false, 220, {title: "Revenue by quarter", xLabel: "Quarter", yLabel: "Revenue (USD)"})])'] : []),
      ...(general || kinds.has('steps') || kinds.has('checklist') ? ['root = Col([Section("Publishing checks", [Checkbox($proofread, "Proofread the article"), Checkbox($links, "Test links")])])\n$proofread = false\n$links = false'] : []),
      ...(general || kinds.has('graph') ? ['root = Col([flow, snippet])\nflow = Diagram("Request path", [{id: "client", label: "Client", level: 0}, {id: "queue", label: "Queue", level: 1}], [{from: "client", to: "queue", label: "Validated request"}], "The client sends a validated request to the queue.")\nsnippet = Code("await queue.send(request);", "typescript")'] : []),
    ],
  },
  });
}

export const nativeOpenUiPrompt = buildNativeOpenUiPrompt(new Set(), true);
const withoutSources = buildNativeOpenUiPrompt(new Set(), false);

export function workspaceNativeOpenUiPrompt(kinds: readonly string[], hasSources: boolean): string {
  return kinds.length ? buildNativeOpenUiPrompt(new Set(kinds), hasSources) : hasSources ? nativeOpenUiPrompt : withoutSources;
}
