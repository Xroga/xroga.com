/** Isolated component integration tests. No production auth bypass or paid execution.
 * Bundles the actual Automations components; only Next navigation, identity and API
 * boundaries are fixtures. Run: node scripts/test-automations-ui.mjs
 */
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const mock = {
  "next/image": `import React from 'react'; export default function Image({fill,unoptimized,priority,...props}) {return <img {...props}/>}`,
  "next/link": `import React from 'react'; export default function Link({href,children,...props}) {return <a href={href} {...props}>{children}</a>}`,
  "next/dynamic": `import React,{lazy,Suspense} from 'react'; export default function dynamic(load,options={}) {const Component=lazy(()=>load().then(m=>({default:m.default||m})));return function Dynamic(props){return <Suspense fallback={options.loading?<options.loading/>:null}><Component {...props}/></Suspense>}}`,
  "next/navigation": `export const useRouter=()=>({push:url=>{window.__navigation=url},replace:url=>{window.__navigation=url}}); export const useSearchParams=()=>new URLSearchParams(location.search); export const usePathname=()=>'/dashboard/automations';`,
  "@/context/TerminalChatContext": `export const useTerminalChat=()=>({restoreTerminalSession:async value=>{window.__restored=value},setPrompt:text=>window.__prompt=text,submit:async text=>{window.__submissions=(window.__submissions||[]).concat(text);await new Promise(r=>setTimeout(r,100));}});`,
  "@/components/layout/WorkspaceIdentityContext": `export const useWorkspaceIdentity=()=>({userId:localStorage.getItem('__fixtureIdentity')||'ui-fixture',status:'authenticated',isGuest:false,loading:false});`,
  "@/components/workspace/WorkspaceAuthGate": `export const useWorkspaceAuthGate=()=>({requireAuth:()=>true,requestAuth:()=>true,isGuest:false});`,
  "@/lib/api": `export const cn=(...xs)=>xs.filter(Boolean).join(' '); export async function apiFetch(url,options){const r=await fetch(url,options);if(!r.ok)throw new Error('Fixture API unavailable');return r.json()}; const status=async()=>({connected:false});export const api={github:{status},vercel:{status},supabase:{status},swarm:{history:()=>apiFetch('/api/swarm/history'),getRun:id=>apiFetch('/api/swarm/runs/'+id),cancelRun:id=>apiFetch('/api/swarm/runs/'+id+'/cancel',{method:'POST'})}};`,
};
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {AutomationsWorkspace} from './frontend/src/components/automations/AutomationsWorkspace'; createRoot(document.getElementById('root')).render(<AutomationsWorkspace/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  outdir: "memory",
  format: "esm",
  jsx: "automatic",
  tsconfig: "frontend/tsconfig.json",
  define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" },
  plugins: [
    {
      name: "test-boundaries",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) =>
          mock[args.path]
            ? { path: args.path, namespace: "fixture" }
            : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents: mock[args.path],
          loader: "tsx",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const run = {
  id: "fixture-run",
  prompt: "Fixture browser research",
  status: "completed",
  created_at: "2026-10-23T08:00:00Z",
  messages: [
    {
      id: "fixture-message",
      role: "user",
      content: "Fixture browser research",
    },
  ],
  output: { artifacts: ["https://example.com/evidence"] },
  events: [
    {
      sequence: 1,
      type: "progress",
      createdAt: "2026-10-23T08:00:00Z",
      data: { message: "Fixture verified evidence" },
    },
  ],
};
let failHistory = false;
const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/swarm/history") {
      res.statusCode = failHistory ? 503 : 200;
      res.end(JSON.stringify([run]));
    } else if (req.url.startsWith("/api/swarm/runs/"))
      res.end(JSON.stringify(run));
    else if (req.url.includes("/catalog"))
      res.end(JSON.stringify({ items: [], totalItems: 0, nextCursor: null }));
    else if (req.url.includes("/session"))
      res.end(JSON.stringify({ sessionId: "fixture-session" }));
    else if (req.url.includes("/toolkits"))
      res.end(JSON.stringify({ toolkits: [] }));
    else if (req.url.includes("/custom-mcp"))
      res.end(JSON.stringify({ items: [] }));
    else if (req.url.includes("/search"))
      res.end(
        JSON.stringify({
          tools: [
            { slug: "FIXTURE_READ", name: "Fixture read tool", risk: "read" },
          ],
        }),
      );
    else if (req.url.includes("/tool-details/"))
      res.end(
        JSON.stringify({
          tool: {
            slug: "FIXTURE_READ",
            inputSchema: { type: "object" },
            scopes: ["read"],
          },
        }),
      );
    else {
      res.statusCode = 503;
      res.end("{}");
    }
    return;
  }
  if (req.url === "/bundle.js" || req.url === "/bundle.css") {
    const file = bundle.outputFiles.find((f) =>
      f.path.endsWith(req.url.endsWith(".css") ? ".css" : ".js"),
    );
    res.setHeader(
      "Content-Type",
      req.url.endsWith(".css") ? "text/css" : "text/javascript",
    );
    res.end(file?.contents);
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><title>Automations isolated integration test</title><style>body{margin:0;background:#080808}</style></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error(e.stack);
});
const output = await mkdtemp(path.join(tmpdir(), "xroga-automations-test-"));
async function section(id) {
  console.log(`Checking ${id}`);
  await page.goto(`${base}/#${id}`);
  await page.getByTestId("automations-workspace").waitFor();
}
try {
  await section("overview");
  assert.equal(
    await page
      .getByRole("navigation", { name: "Automation sections" })
      .getByRole("link")
      .count(),
    9,
  );
  await page.getByRole("button", { name: "Use in chatbar" }).first().click();
  assert.match(
    await page
      .getByRole("textbox", { name: "Automation outcome" })
      .inputValue(),
    /workflow/,
  );
  await page
    .getByRole("textbox", { name: "Automation outcome" })
    .fill("Fixture outcome: research a topic");
  await page
    .getByRole("textbox", { name: "Automation outcome" })
    .press("Enter");
  assert.equal(await page.evaluate(() => window.__navigation), "/workspace");
  assert.deepEqual(await page.evaluate(() => window.__submissions), [
    "Fixture outcome: research a topic",
  ]);
  await page.screenshot({
    path: path.join(output, "desktop.png"),
    fullPage: true,
  });
  await section("workflows");
  await page.getByRole("button", { name: "+ Condition", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  console.log(
    "Saved graph nodes",
    await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("xroga-automation-v1:ui-fixture:workflow"),
      ).nodes.map((n) => n.data.label),
    ),
  );
  assert.ok(
    await page.evaluate(() =>
      localStorage.getItem("xroga-automation-v1:ui-fixture:workflow"),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  console.log("Validation", await page.getByRole("status").allTextContents());
  await page.getByText("Connect all isolated nodes.").waitFor();
  await section("scheduled-tasks");
  await page.getByLabel("Name", { exact: true }).fill("Fixture daily brief");
  await page
    .getByLabel("Outcome", { exact: true })
    .fill("Summarize approved sources");
  await page.getByLabel(/^Repeat/).selectOption("Daily");
  await page.getByRole("button", { name: "Save schedule draft" }).click();
  await page
    .getByText("Schedule draft saved locally.", { exact: false })
    .waitFor();
  assert.ok(
    await page.evaluate(() =>
      localStorage
        .getItem("xroga-automation-v1:ui-fixture:schedules")
        ?.includes("Fixture daily brief"),
    ),
  );
  await section("ai-employees");
  await page.getByRole("button", { name: "+ Custom employee" }).click();
  await page
    .getByLabel("Employee name", { exact: true })
    .fill("Fixture Analyst");
  await page
    .getByLabel("Responsibility", { exact: true })
    .fill("Research approved sources");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Cite reliable evidence");
  await page
    .getByLabel("Deliverables", { exact: true })
    .fill("Research report");
  await page.getByRole("button", { name: "Save local employee draft" }).click();
  await page
    .getByLabel("What should this employee accomplish?")
    .fill("Research safe automation");
  await page.getByRole("button", { name: "Add assignment to chatbar" }).click();
  assert.match(
    await page.getByLabel("Automation outcome").inputValue(),
    /Fixture Analyst/,
  );
  await section("work-packs/seo-blog");
  await page.getByRole("button", { name: "2. Connections" }).click();
  await page.getByLabel(/^Publishing destination/).selectOption("webflow");
  await page.getByRole("button", { name: "3. Permissions & timing" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "4. Review" }).click();
  await page.getByRole("button", { name: /Save.*setup/ }).click();
  assert.ok(
    await page.evaluate(() =>
      localStorage
        .getItem("xroga-automation-v1:ui-fixture:packs")
        ?.includes("webflow"),
    ),
  );
  await section("browser-automation");
  await page
    .getByRole("heading", { name: "Across the web. With evidence." })
    .waitFor();
  await section("apps-mcp");
  await page.getByRole("button", { name: "Combinations", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Use combination in chatbar" })
      .count(),
    5,
  );
  await page
    .getByRole("button", { name: "Tool Explorer", exact: true })
    .click();
  await page.getByLabel("Search tool capabilities").fill("read");
  await page.getByRole("button", { name: "Search tools", exact: true }).click();
  await page.getByRole("button", { name: /Fixture read tool/ }).click();
  await page.getByText('"inputSchema"', { exact: false }).waitFor();
  await section("run-history");
  await page.getByRole("button", { name: /Fixture browser research/ }).click();
  await page
    .getByRole("link", { name: "https://example.com/evidence ↗" })
    .waitFor();
  await page
    .getByRole("button", { name: "Open recorded conversation", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => window.__restored.sessionId),
    "fixture-run",
  );
  await page.getByLabel("Run status").selectOption("failed");
  await page.getByText("No matching runs.", { exact: false }).waitFor();
  failHistory = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByText("Could not verify current activity:", { exact: false })
    .waitFor();
  failHistory = false;
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await section("overview");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}px`,
    );
    if (width === 390)
      await page.screenshot({
        path: path.join(output, "mobile.png"),
        fullPage: true,
      });
    await section("workflows");
    await page.getByRole("button", { name: "Validate", exact: true }).waitFor();
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ))
    )
      console.log(
        "Overflow elements",
        await page.evaluate(() =>
          [...document.querySelectorAll("main *")]
            .filter(
              (e) =>
                e.getBoundingClientRect().right > innerWidth + 1 &&
                getComputedStyle(e).position !== "absolute",
            )
            .slice(0, 10)
            .map((e) => ({
              tag: e.tagName,
              cls: e.className,
              text: e.textContent.slice(0, 80),
              right: e.getBoundingClientRect().right,
            })),
        ),
      );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Workflow overflow at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 390, height: 900 });
  for (const id of [
    "scheduled-tasks",
    "ai-employees",
    "work-packs/seo-blog",
    "browser-automation",
    "apps-mcp",
    "activity",
    "run-history",
  ]) {
    await section(id);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow in ${id}`,
    );
  }
  await page.evaluate(() =>
    localStorage.setItem("__fixtureIdentity", "other-fixture"),
  );
  await page.reload();
  await section("scheduled-tasks");
  assert.equal(
    await page
      .getByRole("heading", { name: "Fixture daily brief", exact: true })
      .count(),
    0,
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "xroga-automation-v1:other-fixture:workflow",
      "{bad-json",
    ),
  );
  await section("workflows");
  await page
    .getByText("Local drafts could not be read.", { exact: false })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    `PASS: nine-section navigation, launcher handoff, graph persistence/undo, schedules, custom employee, pack setup, combinations, tool schema, evidence, API errors, responsive widths. Screenshots: ${output}`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
