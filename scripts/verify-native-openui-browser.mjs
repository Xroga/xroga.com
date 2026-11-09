import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, resolve } from 'node:path';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import AxeBuilder from '@axe-core/playwright';

const cases = {
  short: { text: 'Paris is the capital of France.' },
  compare: { text: 'Team costs $25 and Basic costs $10.', program: 'root = Col([Title("Plan comparison"), Text("Pick Basic for an individual or Team for collaboration."), Table(["Plan", "USD/month"], [["Team", 25], ["Basic", 10]])])' },
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
  evidence: { text: 'PostgreSQL documents row-level security.', program: 'root = Col([Text("PostgreSQL documents row-level security."), Source("source-1")])' },
  code: { text: 'TypeScript function returns the supplied constant.', program: 'root = Col([Code("const total: number = 42;", "typescript")])' },
  tabs: { text: 'Core recommendation remains visible.', program: 'root = Col([Text("Core recommendation remains visible."), Tabs("Scenarios", [{title: "Basic", content: [Text("Basic details")]}, {title: "Team", content: [Text("Team details")]}])])' },
  rejected: { text: 'The original readable answer is retained.', program: 'root = Col([Source("unknown")])' },
  stream: { text: 'The first section is available.', program: 'root = Col([Text("The first section is available.")])\ntail = Chart(' },
};
const compiled = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: 'import {createRoot} from "react-dom/client"; import {NativeSurface} from "./frontend/src/components/native-openui/NativeSurface"; import "./frontend/src/components/native-openui/evaluation.css";'
      + 'const cases = ' + JSON.stringify(cases) + ';'
      + 'const q=new URL(location.href).searchParams; const name=q.get("case") || "short";'
      + 'document.body.dataset.theme=q.get("theme") || "light"; document.querySelector("main").dataset.theme=document.body.dataset.theme;'
      + 'const sources=[{id:"source-1",title:"PostgreSQL: Row Security Policies",url:"https://www.postgresql.org/docs/current/ddl-rowsecurity.html"}];'
      + 'createRoot(document.getElementById("root")).render(<>{cases[name].prompt && <p className="native-evaluation-user">{cases[name].prompt}</p>}<div className="native-evaluation-answer-label">Xroga</div><NativeSurface answer={{...cases[name],format:"xroga-openui-v1",library:"xroga-native-v1"}} sources={sources} isStreaming={name==="stream"} /></>);',
  },
  outdir: 'native-assets', entryNames: 'native', chunkNames: 'native-chunk-[hash]', format: 'esm', splitting: true,
  write: false, bundle: true, jsx: 'automatic', minify: true,
  tsconfig: 'frontend/tsconfig.json', define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
});
const assets = new Map(compiled.outputFiles.map(file => ['/' + basename(file.path), file.contents]));
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  if (name === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><html lang="en"><head><title>Native OpenUI browser acceptance</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/native.css"><style>body{margin:0} .native-evaluation-bar small{display:block;color:var(--iui-muted);font-size:13px}</style></head><body><main class="native-evaluation"><header class="native-evaluation-bar"><div><small>Xroga Workspace · Fixture</small><h1>Answer evaluation</h1></div></header><article class="native-evaluation-thread" id="root"></article></main><script type="module" src="/native.js"></script></body></html>');
  }
  if (!assets.has(name)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/css');
  return res.end(assets.get(name));
});
const output = resolve(process.argv[2] ?? '../../outputs/workspace-native-openui-20261109');
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
      };
      await open('short');
      await page.getByText(cases.short.text, { exact: true }).waitFor();
      assert.equal(await page.getByRole('slider').count(), 0);
      await open('compare');
      const table = page.getByRole('table');
      await table.waitFor();
      await table.getByRole('button', { name: 'USD/month' }).click();
      assert.match(await table.getByRole('row').nth(1).innerText(), /Basic/);
      await open('revenue');
      const slider = page.getByRole('slider', { name: 'Attendees' });
      await slider.waitFor();
      await slider.press('End');
      await page.getByText('$2,000', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Reset' }).click();
      await page.getByText('$1,000', { exact: true }).waitFor();
      await page.getByText('Chart data', { exact: true }).click();
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
      const renderedEdge = await graph.locator('.react-flow__edge-path').first().evaluate(path => ({
        length: path.getTotalLength(), stroke: getComputedStyle(path).stroke,
        overflow: getComputedStyle(path.ownerSVGElement).overflow,
      }));
      assert.ok(renderedEdge.length > 0 && renderedEdge.stroke !== 'none' && renderedEdge.overflow === 'visible', JSON.stringify(renderedEdge));
      await graph.getByRole('button', { name: /zoom in/i }).click();
      await graph.getByRole('button', { name: /fit view/i }).click();
      await graph.getByText('Diagram relationships', { exact: true }).click();
      await graph.getByText(/Stripe → Billing webhook/).waitFor();
      const stripe = page.getByRole('link', { name: 'Stripe', exact: true });
      assert.equal(await stripe.getAttribute('href'), 'https://stripe.com');
      assert.equal(await page.locator('.native-resource').filter({ has: stripe }).locator(':scope > svg path').count(), 1);
      const graphAccessibility = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(graphAccessibility.violations.map(({id}) => id), []);
      await page.screenshot({ path: resolve(output, channel + '-architecture-' + viewport.width + '-' + theme + '.png'), fullPage: true });
      await open('flow');
      assert.equal(await page.locator('svg line').count(), 1);
      await page.getByText('Read rows under RLS').waitFor();

      await open('code');
      const code = page.locator('.iui-codeblock code');
      await code.locator('.iui-code-token').first().waitFor();
      assert.equal(await code.innerText(), 'const total: number = 42;');
      await open('tabs');
      const basic = page.getByRole('tab', { name: 'Basic' });
      await basic.press('ArrowRight');
      await page.getByRole('tabpanel', { name: 'Team' }).getByText('Team details').waitFor();
      await page.getByText('Core recommendation remains visible.').waitFor();
      assert.equal(await page.getByRole('tab', { name: 'Team' }).getAttribute('aria-selected'), 'true');
      await open('evidence');
      const evidence = page.getByRole('link', { name: /PostgreSQL/ });
      assert.equal(await evidence.getAttribute('href'), 'https://www.postgresql.org/docs/current/ddl-rowsecurity.html');
      await open('rejected');
      await page.getByText(cases.rejected.text).waitFor();
      assert.equal(await page.getByRole('link').count(), 0);
      await open('stream');
      assert.equal(await page.getByRole('region', { name: 'Answer', exact: true }).getAttribute('aria-busy'), 'true');
      await page.locator('.iui-text').getByText(cases.stream.text).waitFor();
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      results.push({ viewport, theme, scenarios: Object.keys(cases).length, accessibilityViolations: 0, externalRequests: 0 });
      await context.close();
    }
  }
  const evidence = { mode: 'credential-free browser fixture', browser: browser.version(), entryBytes: Object.fromEntries(['/native.js','/native.css'].map(key => [key, assets.get(key).length])), lazyChunks: [...assets.keys()].filter(key => key.startsWith('/native-chunk-')).length, results };
  await writeFile(resolve(output, channel + '-native-browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await browser?.close();
  server.close();
}
