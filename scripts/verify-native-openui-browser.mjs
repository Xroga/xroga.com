import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, resolve } from 'node:path';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import AxeBuilder from '@axe-core/playwright';
import { tsImport } from 'tsx/esm/api';

const cases = {
  short: { text: 'Paris is the capital of France.' },
  recovered: {
    text: 'Some visuals could not be validated. The available explanation and verified visuals are shown below.\n\nThe API verifies organization membership before reading rows.',
    program: 'root = Col([table])\ntable = Table(["Check", "Where"], [["Membership", "API"]])',
  },
  referenceRecovered: {
    raw: 'Check current tenant membership before reading rows.\n<<<XROGA_OPENUI_V1>>>\nroot = Col([table, unavailableDetails])\ntable = Table(["Check", "Where"], [["Membership", "API"]])',
  },
  compare: { text: 'Team costs $25 and Basic costs $10.', program: 'root = Col([Title("Plan comparison"), Text("Pick Basic for an individual or Team for collaboration."), Table(["Plan", "USD/month"], [["Team", 25], ["Basic", 10]])])' },
  largeTable: {
    text: 'Review the detailed results in the table.',
    program: 'root = Col([Table(["Item", "Details"], ' +
      JSON.stringify(Array.from({ length: 110 }, (_, index) => [`Item ${index + 1}`, index % 2 ? 'A longer description that wraps on narrow screens.' : 'Brief detail.'])) + ')])',
  },
  revenue: {
    text: 'At $25 per attendee, gross revenue is $1,000 for 40 attendees.',
    prompt: 'Build a workshop revenue simulator with $25 per attendee, attendance range 10–80, and a graph for attendance 20/40/60. When I change attendees, update gross revenue locally. Include a reset control and accurate source values.',
    program: [
      '$people = 40',
      'root = Col([Title("Workshop revenue simulator", "lg"), Text("Adjust attendance to calculate gross revenue. The ticket price is fixed at **$25 per attendee**."), calculator, scenarios, Caption("Gross revenue = attendance × $25. Fees, refunds and expenses are excluded.")])',
      'calculator = Card([Grid([Metric("Gross revenue", @Format($people * 25, "currency", 0, "USD"), "Before fees and expenses", "info"), Metric("Ticket price", "$25", "Per attendee")], 2, 180), Divider(), Controls([Slider($people, 10, 80, 1, "Attendees", null, [{value: 10, label: "10 attendees"}, {value: 80, label: "80 attendees"}]), Button("Reset", @Set($people, 40))], "Attendance")], "outline")',
      'scenarios = Section("Revenue by attendance", [Chart("bar", [{attendees: "20", gross: 500}, {attendees: "40", gross: 1000}, {attendees: "60", gross: 1500}], "attendees", ["gross"], "currency", "USD", false, 215, {xLabel: "Attendees", yLabel: "Gross revenue (USD)", note: "Each bar uses the same $25 ticket price."})])',
    ].join('\n'),
  },
  architecture: {
    text: 'Use separate request and verified billing flows. PostgreSQL enforces tenant isolation.',
    prompt: 'Design a multi-tenant Next.js + Supabase + Stripe web app architecture; distinguish auth, API, database RLS, billing webhook and audit log. Include a diagram and concise security notes.',
    program: [
      'root = Col([Title("Multi-tenant SaaS architecture", "lg"), Text("Use one Next.js application and a shared Supabase database. Authorize organization membership on each request; handle Stripe events through a separate verified webhook."), graph, stack, roles, safeguards])',
      'graph = Diagram("Request and billing paths", [{id: "user", label: "Signed-in user", level: 0, detail: "Supabase Auth issues the JWT", tone: "neutral", icon: "shield"}, {id: "app", label: "Next.js API", level: 1, detail: "Validate membership and role", tone: "info", icon: "layers"}, {id: "stripe", label: "Stripe", level: 1, detail: "Hosted checkout and signed events", tone: "purple"}, {id: "database", label: "Supabase Postgres", level: 2, detail: "Enforce row-level security", tone: "success", icon: "database"}, {id: "webhook", label: "Billing webhook", level: 2, detail: "Verify signature and deduplicate", tone: "purple"}, {id: "audit", label: "Audit log", level: 3, detail: "Record scoped changes", tone: "neutral", icon: "file-text"}], [{from: "user", to: "app", label: "JWT"}, {from: "app", to: "database", label: "Tenant context"}, {from: "stripe", to: "webhook", label: "Signed event"}, {from: "webhook", to: "database"}, {from: "database", to: "audit"}], "Application requests and billing events have separate authorization checks. Both record relevant changes.")',
      'stack = Section("Technology roles", [Resource("nextjs", "Render the application and authorize requests server-side."), Resource("supabase", "Issue sessions and enforce tenant access in Postgres."), Resource("stripe", "Host checkout and send signed billing events.")])',
      'roles = Section("Authorization boundaries", [Table(["Path", "Required check"], [["App request", "Authenticated membership and PostgreSQL RLS"], ["Billing event", "Raw-body signature and idempotent event processing"], ["Audit", "Tenant-scoped visibility and restricted writes"]])])',
      'safeguards = Section("Security notes", [List([ListItem("Keep privileged service credentials server-side."), ListItem("Use the authenticated identity and stored membership, not a tenant ID supplied by the client."), ListItem("Treat Stripe delivery as at-least-once and deduplicate event IDs.")], "bullet")])',
    ].join('\n'),
  },
  flow: { text: 'The API checks membership before reading tenant rows.', program: 'root = Col([Title("Tenant request path"), Text("The API checks membership before reading tenant rows."), Svg([Rect(2, 14, 95, 32, "surface", "muted", 0.8, 1, 6), SvgText("Verify membership", 49.5, 33, 9, "ink", "middle"), Line(103, 30, 145, 30, "muted", 1.2), Polygon("145,27 150,30 145,33", "muted"), Rect(155, 14, 93, 32, "surface", "muted", 0.8, 1, 6), SvgText("Read tenant rows", 201.5, 33, 9, "ink", "middle")], "0 0 250 60", "100%", null, "Verify membership before reading tenant rows"), List([ListItem("Check authenticated membership"), ListItem("Read rows under RLS")], "number")])' },
  evidence: { text: 'PostgreSQL documents row-level security.', program: 'root = Col([Text(["PostgreSQL documents row-level security. ", Source("source-1")])])' },
  numericEvidence: { text: 'Official policy and documentation.', program: 'root = Col([Text("Official policy [3]."), Markdown("See documentation [2].")])' },
  fallbackCitations: { text: 'Check the documentation [2](https://www.w3.org/TR/). The mismatched link [2](https://untrusted.example/) is not a citation. Unknown [99] and code `[2]` are plain text.' },
  code: { text: 'TypeScript function returns the supplied constant.', program: 'root = Col([Code("const total: number = 42;", "typescript")])' },
  actionLabels: {
    text: 'No external action was taken.',
    program: 'root = Col([Button("Draft only"), IconButton("info", null, "Local note"), Pressable([Text("Read-only tile")])])',
  },
  embeddedCitations: {
    text: 'Policy detail [2].\n\nDocument note [2].\n\nQuoted claim [2].',
    program: 'root = Col([Section("Policy", [Caption("Document note [2]."), Quote("Quoted claim [2].")], "Policy detail [2].")])',
  },
  reflow: {
    text: 'المجموع التقديري: $12,345,678,901.25. These values are supplied estimates.',
    program: 'root = Col([Badge("A long label for the estimated source figures across these scenarios"), Metric("Estimated total", "$12,345,678,901.25"), Table(["Label", "Estimated value"], [["Scenario A", "$12,345,678,901.25"]])])',
  },
  tabs: { text: 'Core recommendation remains visible.\n\nInclude this separate implementation caveat.', program: 'root = Col([Text("Core recommendation remains visible."), Tabs("Scenarios", [{title: "Basic", content: [Text("Basic details")]}, {title: "Team", content: [Text("Team details")]}]), Popover("Implementation notes", [Text("All results remain visible.")]), Carousel([Text("First option"), Text("Second option")]), Code("PRIVATE_LAYOUT_CODE", "openui")])' },
  choice: { text: 'Compare local scenarios.', program: [
    '$choice = "base"',
    'root = Col([ChoicePicker($choice, "Pricing scenario", [{value: "base", label: "Base"}, {value: "growth", label: "Growth"}, {value: "trial", label: "Trial"}, {value: "enterprise", label: "Enterprise"}, {value: "custom", label: "Custom"}]), Metric("Current total", $choice == "growth" ? 200 : 100), Metric("Mean from provided values", @Stats([100, 200, 300]).mean)])',
  ].join('\n') },
  rejected: { text: 'The original readable answer is retained.', program: 'root = Col([Source("unknown")])' },
  calendar: { text: 'Adjust the end date to calculate elapsed days.', program: [
    '$end = "2028-03-01"',
    'root = Col([DatePicker($end, "End date"), Metric("Elapsed days", @DaysBetween("2028-02-28", $end)), Text(@AddMonths("2028-01-31", 1)), Button("Reset date", @Set($end, "2028-03-01"))])',
  ].join('\n') },
  capabilities: { text: 'Practice with a local timer and review the supplied distribution.', program: [
    '$seconds = 10',
    'root = Col([Title("Practice and review"), Icon("plane", "lg", "info"), Timer($seconds, "Practice timer"), Text("First entries: " + @Slice("ABC", 0, 2)), Chart("bar", @Histogram([0, 1, 1, 4], 2, 0, 4), "key", ["value"])])',
  ].join('\n') },
  stream: { text: 'The first section is available.', program: 'root = Col([Text("The first section is available.")])\ntail = Chart(' },
  conversation: { text: 'You’re welcome. Happy to help.' },
  explanation: { text: 'A cache reuses a previous result.', program: 'root = Col([Title("How caching works"), Section("Freshness", [Text("A cache reuses a previous result."), List([ListItem("Set a lifetime"), ListItem("Invalidate after writes")], "number")])])' },
  technical: { text: 'Idempotency prevents duplicate effects.', program: 'root = Col([Title("Idempotency"), Text("Idempotency prevents duplicate effects."), Quote("A retry can return the original result.")])' },
  database: { text: 'PostgreSQL supports relational transactions. SQLite runs in process.', program: 'root = Col([Table(["Database", "Deployment"], [["PostgreSQL", "Server"], ["SQLite", "In process"]])])' },
  debug: { text: 'Await the promise before reading the value.', program: 'root = Col([Text("Await the promise before reading the value."), Code("const total = await fetchTotal();", "typescript")])' },
  executable: { text: 'The function multiplies price and quantity.', program: 'root = Col([Code("def revenue(price, quantity):\\n    return price * quantity", "python")])' },
  math: { text: 'The area of a circle is pi times radius squared.', program: 'root = Col([Math("A = \\\\pi r^2"), Text("The area of a circle is pi times radius squared.")])' },
  finance: { text: 'May increased from $200 to $250.', program: 'root = Col([Chart("line", [{month:"April", total:200},{month:"May",total:250}], "month", ["total"], "currency", "USD"), Table(["Month", "Revenue"], [["April", 200], ["May", 250]])])' },
  roi: { text: 'The initial return is 20%.', program: '$gain = 120\nroot = Col([Metric("ROI", @Format(100 * ($gain - 100) / 100, "percent", 0)), Slider($gain, 100, 150, 1, "Gain"), Button("Reset", @Set($gain, 120))])' },
  roadmap: { text: 'Start with discovery, then build and validate.', program: 'root = Col([Title("Delivery roadmap"), List([ListItem("Discovery", "Week one"), ListItem("Build", "Week two"), ListItem("Validation", "Week three")], "timeline")])' },
  identifiers: { text: 'Keep tenant_id and tenant_members visible.', program: 'root = Col([Text("Keep tenant_id and tenant_members visible.", "md")])' },
  bareTransport: { raw: 'Keep the readable answer.\nroot = Col([Text("Keep the readable answer."), UnknownInternalWidget()])' },
  diagramRecovery: {
    raw: 'The web client calls the API.\n<<<XROGA_OPENUI_V1>>>\nroot = Col([Diagram("Request path", [{id:"web",label:"Web",level:"0",detail:null,tone:"blue"},{id:"api",label:"API",level:"1",tone:"purple"}], [{from:"web",to:"api",label:null}], "The web client calls the API."), Table(["Component"], [["API"]])])',
    completion: 'complete',
  },
  unfinished: { raw: 'Keep the confirmed amount of $25.\n<<<XROGA_OPENUI_V1>>>\nroot = Col([Chart(', finish: 'length' },
};
const { completeNativeWorkspaceAnswer } = await tsImport('../backend/src/ai/nativeOpenUiWorkspace.ts', import.meta.url);
for (const [name, fixture] of Object.entries(cases)) {
  if (!fixture.raw) continue;
  const answer = completeNativeWorkspaceAnswer(fixture.raw, fixture.finish ?? 'stop');
  assert.equal(answer.completion.status, fixture.completion ?? 'partial', name + ' completion status');
  cases[name] = { text: answer.response, program: answer.responseSource.text };
}
const captured = process.argv[3] ? JSON.parse(await readFile(resolve(process.argv[3]), "utf8")) : null;
if (captured) {
  assert.equal(typeof captured.text, "string");
  assert.equal(typeof captured.program, "string");
  assert.ok(captured.sources.length && captured.sources.every(source => new URL(source.url).hostname === "docs.python.org"));
  cases.capturedSearch = { ...captured, sources: captured.sources.map((source, index) => ({ ...source, id: "source-" + (index + 1) })) };
}
const compiled = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: 'import {createRoot} from "react-dom/client"; import {NativeSurface} from "./frontend/src/components/native-openui/NativeSurface"; import {ResponseSources} from "./frontend/src/components/terminal/ResponseSources"; import {ResponseSourceScope} from "./frontend/src/components/terminal/ResponseSourceScope"; import "./frontend/src/components/native-openui/evaluation.css";'
      + 'const cases = ' + JSON.stringify(cases) + ';'
      + 'const q=new URL(location.href).searchParams; const name=q.get("case") || "short";'
      + 'document.body.dataset.theme=q.get("shellTheme") || q.get("theme") || "light"; document.querySelector("main").dataset.theme=q.get("theme") || "light";'
      + 'const sources=[{id:"source-1",title:"PostgreSQL: Row Security Policies",url:"https://www.postgresql.org/docs/current/ddl-rowsecurity.html"},{id:"source-2",title:"W3C Documentation",url:"https://www.w3.org/TR/"},{id:"source-3",title:"About keyword matching options",siteName:"Google Ads Help",url:"https://support.google.com/google-ads/answer/7478529"}];'
      + 'const fixture=cases[name]; createRoot(document.getElementById("root")).render(<ResponseSourceScope>{fixture.prompt && <p className="native-evaluation-user">{fixture.prompt}</p>}<div className="native-evaluation-answer-label">Xroga</div><NativeSurface answer={{...fixture,format:"xroga-openui-v1",library:"xroga-native-v1"}} sources={fixture.sources ?? sources} isStreaming={name==="stream"} />{name==="numericEvidence" && <ResponseSources sources={[...sources, sources[0], ...[4,5,6].map(n => ({title:"Source "+n,url:"https://example.com/"+n})), {title:"Unsafe link",url:"javascript:alert(1)"}]} />}</ResponseSourceScope>);',
  },
  outdir: 'native-assets', entryNames: 'native', chunkNames: 'native-chunk-[hash]', format: 'esm', splitting: true,
  write: false, bundle: true, jsx: 'automatic', minify: true,
  tsconfig: 'frontend/tsconfig.json', define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
});
const assets = new Map(compiled.outputFiles.map(file => ['/' + basename(file.path), file.contents]));
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  if (name === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><html lang="en"><head><title>Native OpenUI browser acceptance</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/native.css"><style>body{margin:0} .native-evaluation-bar small{display:block;color:var(--iui-muted);font-size:13px}</style></head><body><main class="native-evaluation"><header class="native-evaluation-bar"><div><small>Xroga Workspace · Fixture</small><h1>Answer evaluation</h1></div></header><article class="native-evaluation-thread" id="root"></article></main><script type="module" src="/native.js"></script></body></html>');
  }
  if (/^\/native-icons\/lucide-1\.21\.0-\d{1,2}\.svg$/.test(name)) {
    const file = await readFile(resolve('frontend/public', '.' + name)).catch(() => null);
    if (file) {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.end(file);
    }
  }
  if (!assets.has(name)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/css');
  return res.end(assets.get(name));
});
const output = resolve((process.argv[2] === '-' ? undefined : process.argv[2]) ?? process.env.XROGA_LOCAL_ARTIFACTS ?? '../../outputs/workspace-native-openui-20261109');
await mkdir(output, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
const results = [];
try {
  const channel = process.env.XROGA_NATIVE_BROWSER ?? 'chrome';
  browser = await chromium.launch({ channel });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 900 }, { width: 768, height: 960 }, { width: 390, height: 844 }, { width: 320, height: 800 }]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [], external = [];
      const checked = new Set();
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        if (!route.request().url().startsWith(origin + '/')) {
          external.push(route.request().url());
          await route.abort();
        } else await route.continue();
      });
      const open = async name => {
        await page.goto(origin + '/?case=' + name + '&theme=' + theme);
        await page.getByRole('region', { name: 'Answer', exact: true }).waitFor();
        const fit = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
        assert.ok(fit, name + ' must fit the viewport');
        checked.add(name);
      };
      await open('short');
      await page.getByText(cases.short.text, { exact: true }).waitFor();
      assert.equal(await page.getByRole('slider').count(), 0);
      await open('recovered');
      await page.getByText(/Some visuals could not be validated/).waitFor();
      await page.getByText('The API verifies organization membership before reading rows.', { exact: true }).waitFor();
      await page.getByRole('cell', { name: 'Membership', exact: true }).waitFor();
      if ([390, 1440].includes(viewport.width)) {
        await page.screenshot({ path: resolve(output, channel + '-recovered-' + viewport.width + '-' + theme + '.png'), fullPage: true });
      }
      await open('referenceRecovered');
      await page.getByText('Check current tenant membership before reading rows.', { exact: true }).waitFor();
      await page.locator('.iui-col').getByRole('cell', { name: 'Membership', exact: true }).waitFor();
      assert.doesNotMatch(await page.getByRole('region', { name: 'Answer', exact: true }).innerText(), /unavailableDetails|root\s*=\s*Col/);
      if (captured) {
        await open("capturedSearch");
        const recoveredTable = page.getByRole("table");
        await recoveredTable.getByRole("cell", { name: "Path.read_text()", exact: true }).waitFor();
        assert.equal(await recoveredTable.count(), 1);
        assert.equal(await recoveredTable.locator("tbody tr").count(), 2);
        assert.ok(await recoveredTable.locator("a[href^=\"https://docs.python.org/\"] svg").count() > 0);
        assert.equal(await page.locator("a[href^=\"https://docs.python.org/\"] img").count(), 0);
        if ([390, 1440].includes(viewport.width)) {
          await recoveredTable.screenshot({ path: resolve(output, channel + "-captured-search-" + viewport.width + "-" + theme + ".png") });
        }
      }
      await open('compare');
      const table = page.getByRole('table');
      await table.waitFor();
      await table.getByRole('button', { name: 'USD/month' }).click();
      assert.match(await table.getByRole('row').nth(1).innerText(), /Basic/);
      assert.equal(await page.getByRole('region', { name: 'Answer table' }).evaluate(el => el.scrollHeight - el.clientHeight), 0);
      if (viewport.width === 390) {
        await open('largeTable');
        const region = page.getByRole('region', { name: 'Answer table' });
        const heights = await region.evaluate(el => ({ viewport: el.clientHeight, total: el.scrollHeight }));
        assert.ok(heights.viewport <= 448 && heights.total > heights.viewport);
        await region.press('End');
        await page.waitForFunction(() => {
          const region = document.querySelector('.iui-table-bounded');
          return region && region.scrollHeight - region.clientHeight - region.scrollTop < 3;
        });
        assert.equal(await region.getByRole('cell', { name: 'Item 110', exact: true }).count(), 1);
      }
      await open('revenue');
      const slider = page.getByRole('slider', { name: 'Attendees' });
      await slider.waitFor();
      if (viewport.width === 390) {
        const metrics = await page.locator('.native-answer-metric').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
        assert.equal(metrics[0], metrics[1], 'Both calculator values should fit on one row at 390px');
      }
      await slider.press('End');
      await page.getByText('$2,000', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Reset' }).click();
      await page.getByText('$1,000', { exact: true }).waitFor();
      await page.getByRole('cell', { name: '1500', exact: true }).waitFor();
      const accessibility = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(accessibility.violations.map(({id}) => id), []);
      assert.equal(await page.getByRole('columnheader', { name: 'Gross revenue (USD)' }).count(), 1);
      await page.screenshot({ path: resolve(output, channel + '-revenue-' + viewport.width + '-' + theme + '.png'), fullPage: true });
      await open('architecture');
      const graph = page.getByRole('figure', { name: 'Request and billing paths' });
      await graph.getByText('Billing webhook', { exact: true }).first().waitFor();
      await graph.locator('.react-flow__edge-path').first().waitFor();
      assert.equal(await graph.locator('.react-flow__edge-path').count(), 5);
      if (viewport.width === 390) {
        const scale = await graph.locator('.react-flow__viewport').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
        assert.ok(scale >= .85, 'Mobile diagram zoom should keep node labels legible: ' + scale);
      }
      const renderedEdge = await graph.locator('.react-flow__edge-path').first().evaluate(path => ({
        length: path.getTotalLength(), stroke: getComputedStyle(path).stroke,
        overflow: getComputedStyle(path.ownerSVGElement).overflow,
      }));
      assert.ok(renderedEdge.length > 0 && renderedEdge.stroke !== 'none' && renderedEdge.overflow === 'visible', JSON.stringify(renderedEdge));
      await graph.getByRole('button', { name: /zoom in/i }).click();
      await graph.getByRole('button', { name: /fit view/i }).click();
      await graph.locator('.native-diagram-node-title').filter({ hasText: 'Billing webhook' }).waitFor({ state: 'visible' });
      await page.waitForFunction(() => {
        const nodes = Array.from(document.querySelectorAll('.native-diagram-canvas .react-flow__node'));
        return nodes.length === 6 && nodes.every(node => getComputedStyle(node).visibility === 'visible');
      });
      assert.equal(await graph.locator('details').count(), 0);
      if (viewport.width <= 390) {
        assert.equal(await graph.locator('.react-flow__edge-text').count(), 0, 'Compact diagrams do not overprint edge labels');
      }
      await graph.getByText(/Stripe → Billing webhook/).waitFor();
      const stripe = page.getByRole('link', { name: 'Stripe', exact: true });
      assert.equal(await stripe.getAttribute('href'), 'https://stripe.com');
      assert.equal(await page.locator('.native-resource').filter({ has: stripe }).locator(':scope > svg path').count(), 1);
      const graphAccessibility = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(graphAccessibility.violations.map(({id}) => id), []);
      await page.screenshot({ path: resolve(output, channel + '-architecture-' + viewport.width + '-' + theme + '.png'), fullPage: true });
      await open('diagramRecovery');
      const recoveredEdge = page.locator('.react-flow__edge-path');
      await recoveredEdge.waitFor({ state: 'attached' });
      assert.ok(await recoveredEdge.evaluate(path => path.getTotalLength() > 0 && getComputedStyle(path).stroke !== 'none'));
      await page.locator('.native-diagram-node-neutral').getByText('Web', { exact: true }).waitFor();
      await page.locator('.native-diagram-node-purple').getByText('API', { exact: true }).waitFor();
      await page.getByText('Web → API', { exact: true }).waitFor();
      await page.getByRole('cell', { name: 'API', exact: true }).waitFor();
      assert.equal(await page.getByText(/Some visuals could not be validated/).count(), 0);
      await open('flow');
      assert.equal(await page.locator('svg line').count(), 1);
      await page.getByText('Read rows under RLS').waitFor();

      await open('code');
      const code = page.locator('.iui-codeblock code');
      await code.locator('.iui-code-token').first().waitFor();
      assert.equal(await code.innerText(), 'const total: number = 42;');
      await open('tabs');
      for (const detail of ['Basic details', 'Team details', 'Core recommendation remains visible.', 'Include this separate implementation caveat.', 'All results remain visible.', 'First option', 'Second option']) {
        await page.getByText(detail, { exact: true }).waitFor();
        assert.equal(await page.getByText(detail, { exact: true }).count(), 1);
      }
      assert.equal(await page.getByRole('tab').count(), 0);
      assert.equal(await page.getByText('PRIVATE_LAYOUT_CODE').count(), 0);
      assert.equal(await page.getByRole('button', { name: /read full text|read more|view here|next/i }).count(), 0);
      await open('evidence');
      const evidence = page.getByRole('link', { name: /PostgreSQL/ });
      assert.equal(await evidence.getAttribute('href'), 'https://www.postgresql.org/docs/current/ddl-rowsecurity.html');
      assert.equal(await page.locator('p').filter({ hasText: 'PostgreSQL documents' }).getByRole('link').count(), 1);
      await page.route('**/api/site-icon?d=w3.org', route => route.fulfill({ contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64') }));
      await open('fallbackCitations');
      const fallback = page.getByRole('link', { name: /W3C Documentation/ });
      assert.equal(await fallback.getAttribute('href'), 'https://www.w3.org/TR/');
      assert.equal(await fallback.locator('img').getAttribute('src'), '/api/site-icon?d=w3.org');
      const fallbackAnswer = page.getByRole('region', { name: 'Answer', exact: true });
      assert.equal(await fallbackAnswer.getByRole('link').count(), 1);
      assert.equal(await fallbackAnswer.locator('a[href="https://untrusted.example/"]').count(), 0);
      assert.equal(await page.locator('code').getByText('[2]', { exact: true }).count(), 1);
      await open('numericEvidence');
      const google = page.getByRole('region', { name: 'Answer', exact: true }).getByRole('link', { name: 'Open source 3: About keyword matching options' });
      assert.equal(await google.innerText(), 'Google Ads Help');
      assert.equal(await google.locator('svg path[fill="#4285F4"]').count(), 1);
      const sourceList = page.getByRole('region', { name: 'Sources', exact: true });
      await sourceList.getByRole('link', { name: /About keyword matching options/ }).waitFor({ state: 'hidden' });
      assert.equal(await sourceList.getByRole('link').count(), 4);
      assert.ok(await sourceList.getByRole('link', { name: 'Open source: example.com/6' }).isVisible());
      assert.equal(await sourceList.locator('button, summary').count(), 0);
      const tooltip = page.getByRole('tooltip');
      await google.hover();
      await tooltip.getByText('About keyword matching options').waitFor();
      assert.equal(await tooltip.getByText('Google Ads Help').count(), 1);
      const popupBounds = await tooltip.boundingBox();
      const chipBounds = await google.boundingBox();
      assert.ok(popupBounds.x >= 0 && popupBounds.x + popupBounds.width <= viewport.width);
      assert.ok(popupBounds.y >= chipBounds.y + chipBounds.height || popupBounds.y + popupBounds.height <= chipBounds.y);
      if ((viewport.width === 1440 || viewport.width === 390) && theme === 'dark') {
        await page.screenshot({ path: resolve(output, channel + '-inline-citation-' + viewport.width + '.png') });
      }
      await page.keyboard.press('Escape');
      await tooltip.waitFor({ state: 'hidden' });
      await google.focus();
      await tooltip.waitFor();
      assert.ok(await google.getAttribute('aria-describedby'));
      await page.keyboard.press('Escape');
      await tooltip.waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('region', { name: 'Answer', exact: true }).getByRole('link', { name: 'Open source 2: W3C Documentation' }).count(), 1);
      await open('choice');
      const choice = page.getByRole('group', { name: 'Pricing scenario' });
      await choice.getByRole('searchbox').fill('Grow');
      await choice.getByRole('radio', { name: 'Growth' }).check();
      await page.getByText('Applied: Base').waitFor();
      await choice.getByRole('button', { name: 'Cancel' }).click();
      await choice.getByRole('radio', { name: 'Growth' }).check();
      await choice.getByRole('button', { name: 'Apply choice' }).click();
      await page.getByText('Applied: Growth').waitFor();
      assert.equal(await page.getByText('200', { exact: true }).count(), 2);
      await open('rejected');
      await page.getByText(cases.rejected.text).waitFor();
      assert.equal(await page.getByRole('link').count(), 0);
      await open('calendar');
      await page.getByText('2028-02-29', { exact: true }).waitFor();
      await page.getByText('2', { exact: true }).waitFor();
      await page.locator('input[type="date"]').fill('2028-03-03');
      await page.getByText('4', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Reset date' }).click();
      await page.getByText('2', { exact: true }).waitFor();
      await open('capabilities');
      const timer = page.getByRole('timer', { name: 'Practice timer' });
      await timer.getByText('0:10').waitFor();
      await timer.getByRole('button', { name: 'Start' }).click();
      await timer.getByText('0:09').waitFor();
      await timer.getByRole('button', { name: 'Pause' }).click();
      await timer.getByRole('button', { name: 'Reset' }).click();
      await timer.getByText('0:10').waitFor();
      const icon = await page.locator('use[href$="#plane"]').getAttribute('href');
      const sprite = await page.request.get(origin + icon.split('#')[0]);
      assert.ok(sprite.ok());
      assert.match(await sprite.text(), /<symbol id="plane"/);
      await page.getByText('First entries: AB').waitFor();
      await page.getByRole('cell', { name: '3', exact: true }).waitFor();
      await open('stream');
      assert.equal(await page.getByRole('region', { name: 'Answer', exact: true }).getAttribute('aria-busy'), 'true');
      await page.locator('.iui-text').getByText(cases.stream.text).waitFor();
      const answer = page.getByRole('region', { name: 'Answer', exact: true });
      for (const [name, selector, visible] of [
        ['conversation', 'p', 'You’re welcome. Happy to help.'],
        ['explanation', 'li', 'Invalidate after writes'],
        ['technical', 'blockquote', 'A retry can return the original result.'],
        ['database', 'td', 'In process'],
        ['debug', 'pre', 'const total = await fetchTotal();'],
        ['executable', 'pre', 'return price * quantity'],
        ['math', '.iui-text', 'The area of a circle is pi times radius squared.'],
        ['finance', 'td', '250'],
        ['roadmap', 'li', 'Validation'],
        ['identifiers', '.iui-text', 'Keep tenant_id and tenant_members visible.'],
        ['bareTransport', 'p', 'Keep the readable answer.'],
        ['unfinished', 'p', 'Keep the confirmed amount of $25.'],
      ]) {
        await open(name);
        await answer.locator(selector).filter({ hasText: visible }).first().waitFor();
        assert.doesNotMatch(await answer.innerText(), /<<<XROGA_OPENUI_V1>>>|UnknownInternalWidget\(|root\s*=\s*Col\(/);
        if (name === 'math') await answer.locator('.katex').first().waitFor();
      }
      await open('roi');
      await answer.getByText('20%', { exact: true }).waitFor();
      await answer.getByRole('slider', { name: 'Gain' }).press('ArrowRight');
      await answer.getByText('21%', { exact: true }).waitFor();
      await answer.getByRole('button', { name: 'Reset' }).click();
      await answer.getByText('20%', { exact: true }).waitFor();
      await open('actionLabels');
      for (const label of ['Draft only', 'Local note', 'Read-only tile']) {
        await answer.getByText(label, { exact: true }).waitFor();
      }
      assert.equal(await answer.getByRole('button').count(), 0);
      await open('embeddedCitations');
      const inlineLinks = answer.getByRole('link', { name: 'Open source 2: W3C Documentation' });
      assert.equal(await inlineLinks.count(), 3);
      for (const text of ['Policy detail', 'Document note', 'Quoted claim']) {
        assert.equal(await answer.locator('p').filter({ hasText: text }).count(), 1);
      }
      await open('reflow');
      await answer.getByText(cases.reflow.text, { exact: true }).waitFor();
      assert.equal(await answer.getByText(cases.reflow.text, { exact: true }).evaluate(element => getComputedStyle(element).direction), 'rtl');
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      results.push({ viewport, theme, scenarios: checked.size, cases: [...checked], accessibilityViolations: 0, externalRequests: 0 });
      await context.close();
    }
  }
  // Tap the source directly on mobile. Intercept the popup navigation at the
  // browser context so the test proves the destination without network egress.
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const touchPage = await touch.newPage();
  const sourceUrl = 'https://support.google.com/google-ads/answer/7478529';
  await touch.route(sourceUrl, route => route.fulfill({ contentType: 'text/html', body: '<h1>Source destination</h1>' }));
  await touchPage.goto(origin + '/?case=numericEvidence&theme=dark');
  const [destination] = await Promise.all([
    touchPage.waitForEvent('popup'),
    touchPage.getByRole('link', { name: 'Open source 3: About keyword matching options' }).tap(),
  ]);
  await destination.getByRole('heading', { name: 'Source destination' }).waitFor();
  assert.equal(destination.url(), sourceUrl);
  assert.equal(await touchPage.getByRole('tooltip').count(), 0);
  await touch.close();
  const paletteContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const palettePage = await paletteContext.newPage();
  const answerRegion = palettePage.getByRole('region', { name: 'Answer', exact: true });
  await palettePage.goto(origin + '/?case=short&theme=black');
  await answerRegion.waitFor();
  assert.equal(await answerRegion.evaluate(el => getComputedStyle(el).colorScheme), 'dark', 'The real Workspace black theme uses dark answer tokens');
  await palettePage.goto(origin + '/?case=short&theme=light&shellTheme=black');
  await answerRegion.waitFor();
  assert.equal(await answerRegion.evaluate(el => getComputedStyle(el).colorScheme), 'light', 'Evaluator light mode remains readable inside a dark app shell');
  assert.equal(await palettePage.locator('.native-evaluation').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  await paletteContext.close();
  // Scale the actual answer and its container, as well as testing narrow widths.
  const zoomContext = await browser.newContext({ viewport: { width: 780, height: 1000 } });
  const zoomPage = await zoomContext.newPage();
  const zoomReflow = [];
  for (const theme of ['light', 'dark']) {
    await zoomPage.goto(origin + '/?case=reflow&theme=' + theme);
    const answer = zoomPage.getByRole('region', { name: 'Answer', exact: true });
    await answer.waitFor();
    await zoomPage.addStyleTag({ content: 'html { zoom: 2; }' });
    const geometry = await answer.evaluate(element => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      answerRight: element.getBoundingClientRect().right,
      clippedBadges: Array.from(element.querySelectorAll('.iui-badge')).filter(badge => badge.scrollWidth > badge.clientWidth + 1).length,
    }));
    assert.ok(geometry.scrollWidth <= geometry.viewport && geometry.answerRight <= geometry.viewport);
    assert.equal(geometry.clippedBadges, 0);
    zoomReflow.push({ theme, ...geometry });
  }
  await zoomContext.close();
  const evidence = { mode: 'credential-free browser fixture', browser: browser.version(), entryBytes: Object.fromEntries(['/native.js','/native.css'].map(key => [key, assets.get(key).length])), lazyChunks: [...assets.keys()].filter(key => key.startsWith('/native-chunk-')).length, zoomReflow, results };
  await writeFile(resolve(output, channel + '-native-browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await browser?.close();
  server.close();
}
