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
  revenue: { text: 'Revenue is $1,000 before fees at $25 × 40.', program: '$people = 40\nroot = Col([Title("Workshop revenue"), Text("At $25 per seat, gross revenue is $1,000 before fees."), Card([Slider($people, 0, 80, 1, "Attendees"), Text("Gross revenue: $" + ($people * 25)), Button("Reset", @Set($people, 40))]), Title("Revenue at different attendance levels", "sm"), Chart("bar", [{attendees: "20", gross: 500}, {attendees: "40", gross: 1000}, {attendees: "60", gross: 1500}], "attendees", ["gross"]), Caption("Gross revenue in USD at $25 per attendee")])' },
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
    contents: 'import {createRoot} from "react-dom/client"; import {NativeSurface} from "./frontend/src/components/native-openui/NativeSurface";'
      + 'const cases = ' + JSON.stringify(cases) + ';'
      + 'const q=new URL(location.href).searchParams; const name=q.get("case") || "short";'
      + 'document.body.dataset.theme=q.get("theme") || "light";'
      + 'const sources=[{id:"source-1",title:"PostgreSQL: Row Security Policies",url:"https://www.postgresql.org/docs/current/ddl-rowsecurity.html"}];'
      + 'createRoot(document.getElementById("root")).render(<NativeSurface answer={{...cases[name],format:"xroga-openui-v1",library:"xroga-native-v1"}} sources={sources} isStreaming={name==="stream"} />);',
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
    res.setHeader('Content-Type', 'text/html');
    return res.end('<!doctype html><html lang="en"><head><title>Native OpenUI browser acceptance</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/native.css"><style>body{margin:0;color:#111;background:#fff}body[data-theme=dark]{background:#18181b;color:#fafafa}main{max-width:740px;margin:auto;padding:24px 16px}</style></head><body><main><h1 style="position:absolute;clip-path:inset(50%)">Native answer verification</h1><div id="root"></div></main><script type="module" src="/native.js"></script></body></html>');
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
  browser = await chromium.launch({ channel: 'chrome' });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 960 }, { width: 390, height: 844 }]) {
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
      await page.getByText('Gross revenue: $2000', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Reset' }).click();
      await page.getByText('Gross revenue: $1000', { exact: true }).waitFor();
      await page.getByText('Chart data', { exact: true }).click();
      await page.getByRole('cell', { name: '1500', exact: true }).waitFor();
      const accessibility = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(accessibility.violations.map(({id}) => id), []);
      if (viewport.width !== 768) await page.screenshot({ path: resolve(output, 'native-revenue-' + viewport.width + '-' + theme + '.png'), fullPage: true });
      await open('flow');
      assert.equal(await page.locator('svg line').count(), 1);
      await page.getByText('Read rows under RLS').waitFor();
      if (viewport.width !== 768) await page.screenshot({ path: resolve(output, 'native-flow-' + viewport.width + '-' + theme + '.png'), fullPage: true });
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
  await writeFile(resolve(output, 'native-browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await browser?.close();
  server.close();
}
