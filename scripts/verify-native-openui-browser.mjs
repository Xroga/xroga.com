import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, resolve } from 'node:path';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import AxeBuilder from '@axe-core/playwright';
import { tsImport } from 'tsx/esm/api';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

const cases = {
  openingTitle: {
    raw: '**Sortable table — time by color**\n\nThree recorded times in seconds.\n\n| Color | Time (s) |\n| --- | --- |\n| Green | 1.15 |\n| Red | 9.2 |\n| Blue | 12.8 |\n<<<XROGA_OPENUI_V1>>>\nroot = Col([Title("Sortable table: time by color", "lg"), Markdown(_xroga_answer), Table(["Color", "Time (s)"], [["Green",1.15],["Red",9.2],["Blue",12.8]])])',
    completion: 'complete',
  },
  articleSpacing: {
    text: 'Compare the two documented sorting options.',
    program: 'root = Col([Title("Sorted versus list.sort", "lg"), Text("Choose based on whether the original list should change."), Title("Which call fits your case?", "md"), Text("Use sorted when you need a new list."), Title("Return values", "md"), Text("The in-place method returns None.")], 24)',
  },
  formattedChecklist: {
    text: 'These checkboxes update this view only.',
    program: 'root = Col([Checkbox($first, "**Goal and audience.** Write one sentence naming who the blog is for and what it helps them do."), Checkbox($second, "Check `www` redirects and <img src=x onerror=alert(1)> literally.")])\n$first = false\n$second = false',
  },
  workflowOwnership: {
    raw: 'Review the work before delivery.\n\n## Manual versus automated\n\n| Stage | Owner |\n| --- | --- |\n| Intake | Coordinator |\n<<<XROGA_OPENUI_V1>>>\nroot = Col([Markdown(_xroga_answer), Section("Manual versus automated", [Table(["Stage", "Owner"], [["Intake", "Coordinator"]])])])',
    completion: 'complete',
  },
  sharedAnswer: {
    raw: 'Basic includes one seat.\n\n1. Read the terms.\n2. Compare the total.\n\n| Plan | Seats |\n|---|---|\n| Basic | 1 |\n<<<XROGA_OPENUI_V1>>>\nroot = Col([Markdown(_xroga_answer), Table(["Plan", "Seats"], [["Basic", 1]])])',
    completion: 'complete',
  },
  scrollingCode: {
    text: 'Read the complete formula with a keyboard.',
    program: 'root = Col([Code(' + JSON.stringify('monthlyPayment = principal * monthlyRate * (1 + monthlyRate) ** paymentCount / ((1 + monthlyRate) ** paymentCount - 1)') + ', "text"), Markdown(' + JSON.stringify('```python\nmonthlyPayment = principal * monthlyRate * (1 + monthlyRate) ** paymentCount / ((1 + monthlyRate) ** paymentCount - 1)\n```') + ')])',
  },
  short: { text: 'Paris is the capital of France.' },
  metricGrid: {
    text: 'These supplied loan results stay readable inside a narrow answer.',
    program: 'root = Col([Grid([Metric("Monthly payment", "$405.53"), Metric("Total interest", "$4,331.67"), Metric("Total paid", "$24,331.67")], 3)])',
  },
  chartHeading: {
    text: 'The supplied annual balances are shown below.',
    program: 'root = Col([Section("Balance by year", [Chart("line", [{year:0,balance:10000},{year:1,balance:10600}], "year", ["balance"], "currency", "USD", false, 240, {title:"Balance by year",yLabel:"Balance (USD)",note:"Annual compounding."})])])',
  },
  themeControl: { text: 'Theme control at the left viewport edge.' },
  themeControlRight: { text: 'Theme control near the right viewport edge.' },
  markdownMath: {
    text: 'The formula stays readable with its original explanation.',
    program: 'root = Col([Markdown("## Growth formula\\n\\n$$A = P\\\\left(1 + \\\\frac{r}{n}\\\\right)^{nt}$$\\n\\nUse \\\\(r = 0.06\\\\) for six percent. Basic costs $10 and Pro costs $25.")])',
  },
  sharedFormula: {
    text: 'Starting example: $10,000 at 7% nominal annual interest compounded monthly for 10 years.',
    program: [
      'root = Col([controls, Metric("Final balance", @Format(value29, "currency", 2, "USD"))])',
      '$principal = 10000', '$rate = 7', '$years = 10',
      'controls = Col([Slider($principal, 0, 100000, 100, "Principal", "USD"), Slider($rate, 0, 20, 0.1, "Annual rate", "%"), Slider($years, 0, 30, 1, "Years", "years")])',
      'value0 = $principal * Pow(1 + $rate / 100 / 12, 12 * $years)',
      ...Array.from({length:29},(_,index)=>`value${index+1} = value${index} + 0`),
    ].join('\n'),
  },
  recovered: {
    text: 'Some visuals could not be validated. The available explanation and verified visuals are shown below.\n\nThe API verifies organization membership before reading rows.',
    program: 'root = Col([table])\ntable = Table(["Check", "Where"], [["Membership", "API"]])',
  },
  referenceRecovered: {
    raw: 'Check current tenant membership before reading rows.\n<<<XROGA_OPENUI_V1>>>\nroot = Col([table, unavailableDetails])\ntable = Table(["Check", "Where"], [["Membership", "API"]])',
  },
  rebuiltChecklist: {
    raw: 'Prepare the site before launch.\n\n**Publishing**\n- Check the links\n- Proofread the post\n<<<XROGA_OPENUI_V1>>>\nroot = Col([Text("First")])\nroot = Col([Text("Second")])',
    prompt: 'Make a publishing checklist with editable local checkboxes.',
    requiredFormats: ['checklist'],
    completion: 'complete',
  },
  rebuiltSignedChart: {
    raw: 'Use the supplied cash flows.\n<<<XROGA_OPENUI_V1>>>\nroot = Col([Text("First")])\nroot = Col([Text("Second")])',
    prompt: 'Show actual monthly cash flow in dollars: -800, 0, 500.',
    requiredFormats: ['chart'],
    completion: 'complete',
  },
  signedStackedBars: {
    text: 'Two cash flow series with gains and losses across two months.',
    program: 'root = Col([Chart("bar", [{month:"Jan",sales:4000,adjustments:-2000},{month:"Feb",sales:-3500,adjustments:1500}], "month", ["sales","adjustments"], "currency", "USD", true, 440)])',
  },
  compare: { text: 'Team costs $25 and Basic costs $10.', program: 'root = Col([Title("Plan comparison"), Text("Pick Basic for an individual or Team for collaboration."), Table(["Plan", "USD/month"], [["Team", 25], ["Basic", 10]])])' },
  wideComparison: {
    text: 'Compare documentation rows and sort the supplied measurements.',
    program: 'root = Col([Table(["Aspect", "Server Components", "Client Components", "Seconds"], [["Directive", "Default", "Opt-in", "1.5"], ["Environment", "Server-side", "Browser", "1.15"], ["Code path", "Server-side", "Hydrates", "12.8"], ["Missing", "Server-side", "Browser", "N/A"]])])',
  },
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
      'calculator = Card([Grid([Metric("Gross revenue", @Format($people * 25, "currency", 0, "USD"), "Before fees and expenses", "info"), Metric("Ticket price", "$25", "Per attendee")], 2, 180), Divider(), Controls([Slider($people, 10, 80, 1, "Attendees", "people", [{value: 10, label: "10 attendees"}, {value: 80, label: "80 attendees"}]), Button("Reset", @Set($people, 40))], "Attendance")], "outline")',
      'scenarios = Section("Revenue by attendance", [Chart("bar", [{attendees: "20", gross: 500}, {attendees: "40", gross: 1000}, {attendees: "60", gross: 1500}], "attendees", ["gross"], "currency", "USD", false, 215, {xLabel: "Attendees", yLabel: "Gross revenue (USD)", note: "Each bar uses the same $25 ticket price."})])',
    ].join('\n'),
  },
  draftCopy: {
    text: 'Edit the local RSVP draft.',
    program: [
      'root = Col([draft, simulator])',
      '$guest = ""',
      '$attendance = ""',
      '$guests = 0',
      '$needs = ""',
      '$amount = 10',
      'draft = Controls([Input($guest, "Name"), RadioGroup($attendance, [{value: "confirmed", label: "Confirmed attendance", description: "Option detail"}], "Attendance"), Input($guests, "Guests", "number"), TextArea($needs, "Accessibility needs"), Input("keep private", null, "text", "Unlabeled"), Input("keep hidden", "Hidden"), Input("keep disabled", "Disabled"), Input("keep password", "Password")], "RSVP draft", 2)',
      'simulator = Controls([Input($amount, "Amount", "number"), Slider($amount, 0, 20, 1, "Calculator slider")], "Calculator")',
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
  roi: { text: 'The initial return is 20%.', program: '$gain = 120\nroot = Col([Metric("ROI", @Format(100 * ($gain - 100) / 100, "percent", 0)), Slider($gain, 100, 150, 1, "Gain", "%"), Button("Reset", @Set($gain, 120))])' },
  roadmap: { text: 'Start with discovery, then build and validate.', program: 'root = Col([Title("Delivery roadmap"), List([ListItem("Discovery", "Week one"), ListItem("Build", "Week two"), ListItem("Validation", "Week three")], "timeline")])' },
  identifiers: { text: 'Keep tenant_id and tenant_members visible.', program: 'root = Col([Text("Keep tenant_id and tenant_members visible.", "md")])' },
  bareTransport: { raw: 'Keep the readable answer.\nroot = Col([Text("Keep the readable answer."), UnknownInternalWidget()])' },
  diagramRecovery: {
    raw: 'The web client calls the API.\n<<<XROGA_OPENUI_V1>>>\nroot = Col([Diagram("Request path", [{id:"web",label:"Web",level:"0",detail:null,tone:"blue"},{id:"api",label:"API",level:"1",tone:"purple"}], [{from:"web",to:"api",label:null}], "The web client calls the API."), Table(["Component"], [["API"]])])',
    completion: 'complete',
  },
  unfinished: { raw: 'Keep the confirmed amount of $25.\n<<<XROGA_OPENUI_V1>>>\nroot = Col([Chart(', finish: 'length' },
};
const failedEquation='{'.repeat(3500)+'x'+'}'.repeat(3500)+'<img src=x onerror="window.__xrogaMathProbe=1">';
cases.mathFailure={text:'$$'+failedEquation+'$$\n\nThe complete answer stays available.'};
const { completeNativeWorkspaceAnswer } = await tsImport('../backend/src/ai/nativeOpenUiWorkspace.ts', import.meta.url);
const { validateNativeOpenUi } = await tsImport('../backend/src/ai/nativeOpenUi.ts', import.meta.url);
const { nativeDocumentDelivery, requestedNativeDocumentFormat } = await tsImport('../backend/src/ai/nativeDocumentDownload.ts', import.meta.url);
const documentFixtures = {
  docx: { prompt: 'Draft a workshop proposal with editable sections. Provide it as a downloadable DOCX.', text: '# Workshop Proposal\n\n## Scope\n\nDiscuss the training plan.\n\n| Task | Evidence |\n| --- | --- |\n| User navigation | [Unverified claim](https://fake.example/report) |' },
  pdf: { prompt: 'Create a PDF executive report from this attached dataset.', text: '# Executive Report\n\nTotal verified revenue: $1,000.' },
  txt: { prompt: 'Make a downloadable plain-text UTF-8 handoff brief.', text: '# Field Brief\n\nRésumé / خطة\n\n07:30 • Start walkthrough.' },
  xlsx: { prompt: 'Create an XLSX budget spreadsheet with formulas.', text: '# Budget\n\n| Item | Quantity | Cost | Total |\n| --- | --- | --- | --- |\n| Workshop | 2 | 25 | |\n| Total | | | |\n\n## Formulas\n- D2: =B2*C2\n- D3: =SUM(D2:D2)' },
  pptx: { prompt: 'Create a professional PPTX slide deck from these supplied notes.', text: '# Workshop Plans\n\n## Recommended timing\nThe workshop lasts 90 minutes.\n\n## Preparation\nBring the training guide.' },
  unsupportedPdf: { prompt: 'Create a PDF report.', text: '# Report\n\nمرحبا' },
  noExport: { prompt: 'Create a PDF report, but do not export a file.', text: 'Here is the report directly in chat.' },
  partial: { prompt: 'Create a PDF report.', text: 'A readable part of the report survives.', partial: true },
  unsafeFormula: { prompt: 'Create an XLSX budget spreadsheet with formulas.', text: '# Budget\n\n| Item | Cost |\n| --- | --- |\n| Workshop | |\n\n## Formulas\n- B2: =WEBSERVICE("https://blocked.example/")', suppressed: true },
};
for (const [name, fixture] of Object.entries(documentFixtures)) {
  const delivery = nativeDocumentDelivery(requestedNativeDocumentFormat(fixture.prompt), false, fixture.prompt, fixture.text,
    fixture.partial ? { status: 'partial', reason: 'output_limit' } : { status: 'complete' });
  cases['download-' + name] = { ...fixture, partial: delivery.completion.status === 'partial', downloadFormat: delivery.downloadFormat };
}
for (const name of ['metricGrid','chartHeading']) {
  const verified=validateNativeOpenUi(cases[name].program,new Set(),cases[name].text);
  assert.ok(verified.ok,name+' fixture must satisfy the actual presentation contract: '+JSON.stringify(verified));
}
for (const [name, fixture] of Object.entries(cases)) {
  if (!fixture.raw) continue;
  const answer = completeNativeWorkspaceAnswer(fixture.raw, fixture.finish ?? 'stop', undefined, fixture.prompt, undefined, fixture.requiredFormats);
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
const capturedCalculator = process.argv[4] ? JSON.parse(await readFile(resolve(process.argv[4]),'utf8')) : null;
if(capturedCalculator){
  assert.equal(capturedCalculator.answer.responseSource.format,'xroga-openui-v1');
  assert.ok(capturedCalculator.answer.responseSource.text);
  cases.capturedCalculator={text:capturedCalculator.answer.response,program:capturedCalculator.answer.responseSource.text};
}
const compiled = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: 'import {createRoot} from "react-dom/client"; import {useEffect,useState} from "react"; import {ThemeToggle} from "./frontend/src/components/layout/ThemeToggle"; import {useThemeStore} from "./frontend/src/store/useThemeStore"; import MathEquationImpl from "./frontend/src/lib/mathRenderImpl"; import {Chart} from "./frontend/src/components/native-openui/upstream/components/chart"; import {NativeSurface} from "./frontend/src/components/native-openui/NativeSurface"; import {ResponseSources} from "./frontend/src/components/terminal/ResponseSources"; import {ResponseSourceScope} from "./frontend/src/components/terminal/ResponseSourceScope"; import "./frontend/src/components/native-openui/evaluation.css";'
      + 'import "./frontend/src/styles/answerExperience.css";'
      + 'import {NativeWorkspaceAnswer, readNativeWorkspaceAnswer} from "./frontend/src/components/native-openui/NativeWorkspaceAnswer"; import {enhanceAiResponse} from "./frontend/src/lib/xrogaResponseDocument";'
      + 'const cases = ' + JSON.stringify(cases) + ';'
      + 'const q=new URL(location.href).searchParams; const name=q.get("case") || "short";'
      + 'document.body.dataset.theme=q.get("shellTheme") || q.get("theme") || "light"; document.querySelector("main").dataset.theme=q.get("theme") || "light";'
      + 'const sources=[{id:"source-1",title:"PostgreSQL: Row Security Policies",url:"https://www.postgresql.org/docs/current/ddl-rowsecurity.html"},{id:"source-2",title:"W3C Documentation",url:"https://www.w3.org/TR/"},{id:"source-3",title:"About keyword matching options",siteName:"Google Ads Help",url:"https://support.google.com/google-ads/answer/7478529"}];'
      + 'function DelayedChart(){const [data,setData]=useState(null);useEffect(()=>{setData([{year:0,balance:10000},{year:1,balance:10600}]);},[]);const View=Chart.component;return <section role="region" aria-label="Answer"><View props={{type:"line",data,x:"year",series:["balance"],format:"currency",currency:"USD"}} renderNode={()=>null}/></section>;}'
      + 'function FailedMath(){return <section role="region" aria-label="Answer"><MathEquationImpl text={'+JSON.stringify(failedEquation)+'}/><p>The complete answer stays available.</p></section>;}'
      + 'function ThemeProbe(){const theme=useThemeStore(s=>s.theme);useEffect(()=>{useThemeStore.getState().setTheme(q.get("theme")==="dark"?"black":"white");},[]);return <section role="region" aria-label="Answer" style={{position:"fixed",top:8,...(name==="themeControl"?{left:8}:{right:8})}}><ThemeToggle placement={name==="themeControl"?"bottom-end":"right-start"}/><output aria-label="Selected theme">{theme}</output></section>;}'
      + 'function DownloadProbe({fixture}){let saved=localStorage.getItem(name); if(!saved){const turn=enhanceAiResponse(fixture.text,"document",{status:fixture.partial?"partial":"complete"},{format:"xroga-openui-v1",text:"",downloadFormat:fixture.downloadFormat});saved=JSON.stringify(turn.output);localStorage.setItem(name,saved);} const answer=readNativeWorkspaceAnswer(JSON.parse(saved));return <NativeWorkspaceAnswer answer={answer}/>;}'
      + 'const fixture=cases[name]; createRoot(document.getElementById("root")).render(name.startsWith("download-")?<DownloadProbe fixture={fixture}/>:name.startsWith("themeControl")?<ThemeProbe/>:name==="delayedChart"?<DelayedChart/>:name==="legacyMathFailure"?<FailedMath/>:<ResponseSourceScope>{fixture.prompt && <p className="native-evaluation-user">{fixture.prompt}</p>}<div className="native-evaluation-answer-label">Xroga</div><NativeSurface answer={{...fixture,format:"xroga-openui-v1",library:"xroga-native-v1"}} sources={fixture.sources ?? sources} isStreaming={name==="stream"} />{name==="numericEvidence" && <ResponseSources sources={[...sources, sources[0], ...[4,5,6].map(n => ({title:"Source "+n,url:"https://example.com/"+n})), {title:"Unsafe link",url:"javascript:alert(1)"}]} />}</ResponseSourceScope>);',
  },
  outdir: 'native-assets', entryNames: 'native', chunkNames: 'native-chunk-[hash]', format: 'esm', splitting: true,
  write: false, bundle: true, jsx: 'automatic', minify: true,
  external: ['/black-hole-user-icon.svg'],
  tsconfig: 'frontend/tsconfig.json', define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
});
const assets = new Map(compiled.outputFiles.map(file => ['/' + basename(file.path), file.contents]));
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  if (name === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><html lang="en"><head><title>Native OpenUI browser acceptance</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/native.css"><style>body{margin:0} .native-evaluation-bar small{display:block;color:var(--iui-muted);font-size:13px}</style></head><body><main class="native-evaluation"><header class="native-evaluation-bar"><div><small>Xroga Workspace · Fixture</small><h1>Answer evaluation</h1></div></header><article class="native-evaluation-thread" id="root"></article></main><script type="module" src="/native.js"></script></body></html>');
  }
  if (name === '/black-hole-user-icon.svg' || /^\/native-icons\/lucide-1\.21\.0-\d{1,2}\.svg$/.test(name)) {
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
  const documentDownloads = [];
  const downloadContext = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const downloadPage = await downloadContext.newPage();
  await downloadPage.addInitScript(() => {
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.downloadMime = blob.type; return createObjectURL(blob); };
  });
  const filenames = { docx: 'Workshop-Proposal.docx', pdf: 'Executive-Report.pdf', xlsx: 'Budget.xlsx', pptx: 'Workshop-Plans.pptx', txt: 'Field-Brief.txt' };
  for (const format of Object.keys(filenames)) {
    const label = 'Download ' + format.toUpperCase();
    await downloadPage.goto(origin + '/?case=download-' + format);
    await downloadPage.getByRole('button', { name: label }).waitFor();
    await downloadPage.reload();
    const control = downloadPage.getByRole('button', { name: label });
    await control.focus();
    const expectedDownload = downloadPage.waitForEvent('download');
    await control.press('Enter');
    const download = await expectedDownload;
    const bytes = await readFile(await download.path());
    const mime = await downloadPage.evaluate(() => window.downloadMime);
    assert.equal(download.suggestedFilename(), filenames[format]);
    if (format === 'docx') {
      assert.equal(mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const doc = await JSZip.loadAsync(bytes);
      const document = await doc.file('word/document.xml').async('string');
      assert.match(document, /Heading2.*Scope.*<w:tbl>.*<w:tblHeader\b.*User navigation.*Unverified claim.*<\/w:tbl>/);
      assert.doesNotMatch(document, /\| Task \| Evidence \|/);
      assert.doesNotMatch(await doc.file('word/_rels/document.xml.rels').async('string'), /fake\.example/);
    } else if (format === 'pdf') {
      assert.equal(mime, 'application/pdf');
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    } else if (format === 'xlsx') {
      assert.equal(mime, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const xlsx = await JSZip.loadAsync(bytes);
      const sheet = await xlsx.file('xl/worksheets/sheet1.xml').async('string');
      assert.match(sheet, /<c r="D2"><f>B2\*C2<\/f><v>50<\/v><\/c>/);
      assert.match(sheet, /<c r="D3"><f>SUM\(D2:D2\)<\/f><v>50<\/v><\/c>/);
      assert.doesNotMatch(sheet, /externalLink|WEBSERVICE/);
    } else if (format === 'txt') {
      assert.equal(mime, 'text/plain;charset=utf-8');
      assert.equal(bytes.toString('utf8'), 'Field Brief\n\nRésumé / خطة\n\n07:30 • Start walkthrough.');
    } else {
      assert.equal(mime, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      const pptx = await JSZip.loadAsync(bytes);
      assert.match(await pptx.file('ppt/slides/slide1.xml').async('string'), /90 minutes/);
      assert.match(await pptx.file('ppt/slides/slide2.xml').async('string'), /training guide/);
    }
    documentDownloads.push({ format, mime, bytes: bytes.length, savedPayloadReopened: true, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  for (const name of ['noExport', 'partial', 'unsafeFormula']) {
    await downloadPage.goto(origin + '/?case=download-' + name);
    await downloadPage.getByRole('region', { name: 'Answer' }).waitFor();
    assert.equal(await downloadPage.getByRole('button', { name: /^Download (DOCX|PDF|XLSX|PPTX|TXT)$/ }).count(), 0);
  }
  await downloadPage.goto(origin + '/?case=download-unsupportedPdf');
  await downloadPage.getByRole('button', { name: 'Download PDF', exact: true }).click();
  await downloadPage.getByRole('alert').filter({ hasText: 'PDF font does not support' }).waitFor();
  await downloadPage.getByRole('button', { name: 'Download DOCX', exact: true }).waitFor();
  await writeFile(resolve(output, channel + '-native-document-download-evidence.json'), JSON.stringify(documentDownloads, null, 2) + '\n');
  await downloadContext.close();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 900 }, { width: 768, height: 960 }, { width: 390, height: 844 }, { width: 320, height: 800 }]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
      context.setDefaultTimeout(12000);
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
        await page.getByRole('region', { name: 'Answer', exact: true }).waitFor().catch(error => {
          console.error(JSON.stringify({scenario:name,browserErrors:errors}));
          throw error;
        });
        const fit = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
        assert.ok(fit, name + ' must fit the viewport');
        checked.add(name);
      };
      await open('short');
      await page.getByText(cases.short.text, { exact: true }).waitFor();
      assert.equal(await page.getByRole('slider').count(), 0);
      for (const name of ['themeControl','themeControlRight']) {
        await open(name);
        await page.waitForFunction(expected=>document.querySelector('output')?.textContent===expected,theme==='dark'?'black':'white');
        const trigger=page.getByRole('button',{name:'Change theme',exact:true});
        await trigger.click();
        const menu=page.getByRole('menu',{name:'Theme',exact:true});
        await menu.waitFor();
        assert.equal(await menu.getByRole('menuitemradio').count(),4);
        const bounds=await menu.boundingBox();
        assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height,'Theme choices must stay inside the viewport');
        await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-checked')==='true');
        if([320,1440].includes(viewport.width))await page.screenshot({path:resolve(output,name+'-'+viewport.width+'-'+theme+'.png')});
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForFunction(()=>document.querySelector('output')?.textContent==='white');
        assert.equal(await menu.count(),0);
        await trigger.press('ArrowDown');
        await menu.waitFor();
        await page.keyboard.press('End');
        await page.waitForFunction(()=>document.activeElement?.textContent?.startsWith('Black'));
        await page.keyboard.press('Escape');
        assert.equal(await menu.count(),0);
        assert.equal(await trigger.evaluate(element=>element===document.activeElement),true);
      }
      await open('metricGrid');
      if(viewport.width<=390)await page.locator('#root').evaluate((element,width)=>{element.style.width=width+'px';element.style.maxWidth='100%';},viewport.width-100);
      const paintedNumbers=await page.locator('.native-answer-metric-value').evaluateAll(elements=>elements.map(element=>{
        const range=document.createRange();range.selectNodeContents(element);
        return {value:element.textContent,lines:new Set(Array.from(range.getClientRects(),rect=>Math.round(rect.top))).size,
          width:Math.round(element.parentElement.getBoundingClientRect().width),textWidth:Math.round(range.getBoundingClientRect().width),
          font:getComputedStyle(element).fontSize};
      }));
      assert.deepEqual(paintedNumbers.map(item=>item.value),['$405.53','$4,331.67','$24,331.67']);
      assert.ok(paintedNumbers.every(item=>item.lines===1 && item.textWidth<=item.width), 'Metrics must fit without splitting decimal values: '
        + JSON.stringify({ viewport: viewport.width, theme, paintedNumbers }));
      if([390,1440].includes(viewport.width))await page.screenshot({path:resolve(output,'metric-grid-'+viewport.width+'-'+theme+'.png'),fullPage:true});
      await open('chartHeading');
      const compactChart = page.getByRole('img',{name:'line chart of balance by year',exact:true});
      await compactChart.waitFor();
      assert.ok((await compactChart.boundingBox()).height <= 216, 'Simple charts fit the reading column at their actual render height');
      assert.equal(await page.getByText('Balance by year',{exact:true}).count(),1);
      await page.locator('figcaption').getByText('Balance (USD)',{exact:true}).waitFor();
      await page.getByText('Annual compounding.',{exact:true}).waitFor();
      await open('delayedChart');
      await page.getByRole('img',{name:'line chart of balance by year',exact:true}).waitFor();
      assert.ok(await page.locator('svg path[stroke]').evaluateAll(paths=>paths.length===1&&paths.every(path=>path.getTotalLength()>0)));
      await open('markdownMath');
      await page.locator('.katex-display .katex').waitFor();
      assert.equal(await page.locator('.katex').count(),2);
      assert.ok((await page.locator('.xroga-native-openui').innerText()).includes('Basic costs $10 and Pro costs $25.'));
      for(const name of ['mathFailure','legacyMathFailure']){
        await open(name);
        await page.getByText('The complete answer stays available.',{exact:true}).waitFor();
        assert.equal(await page.locator('img, [onerror]').count(),0,'A typesetter failure must never inject the original formula as HTML');
        assert.ok((await page.getByRole('region',{name:'Answer',exact:true}).innerText()).includes('<img src=x'));
        assert.equal(await page.evaluate(()=>window.__xrogaMathProbe),undefined);
      }
      await open('sharedFormula');
      assert.equal(await page.getByRole('slider').count(), 3);
      const sharedMetric=page.locator('.native-answer-metric');
      assert.ok((await sharedMetric.innerText()).includes('$20,096.61'));
      await page.getByRole('slider',{name:'Years',exact:true}).press('ArrowRight');
      const nextBalance=(10000*Math.pow(1+0.07/12,12*11)).toLocaleString('en-US',{style:'currency',currency:'USD'});
      await page.getByText(nextBalance,{exact:true}).waitFor();
      if([390,1440].includes(viewport.width))await page.screenshot({path:resolve(output,channel+'-shared-formula-'+viewport.width+'-'+theme+'.png'),fullPage:true});
      await open('openingTitle');
      await page.getByRole('heading', {name:'Sortable table: time by color',exact:true}).waitFor();
      assert.equal(await page.getByText('Sortable table — time by color',{exact:true}).count(),0);
      assert.equal(await page.getByRole('table').count(),1);
      await page.getByText('Three recorded times in seconds.',{exact:true}).waitFor();
      if ([390,1440].includes(viewport.width)) await page.screenshot({path:resolve(output,channel+'-opening-title-'+viewport.width+'-'+theme+'.png'),fullPage:true});
      if(capturedCalculator){
        await open('capturedCalculator');
        const comparison=page.getByRole('region',{name:'Answer table'}).filter({has:page.getByRole('columnheader',{name:'Compounding',exact:true})});
        await comparison.waitFor();
        assert.equal(await comparison.count(),1,'A changing comparison must not retain a second static copy');
        assert.equal(await page.getByRole('table').count(),3,'Milestones, chart data and one live comparison');
        await comparison.getByRole('columnheader',{name:'Balance after 10 years',exact:true}).waitFor();
        await page.getByRole('slider',{name:'Years',exact:true}).press('ArrowRight');
        await comparison.getByRole('columnheader',{name:'Balance after 11 years',exact:true}).waitFor();
        const expected=(10000*Math.pow(1+0.06/12,12*11)).toLocaleString('en-US',{style:'currency',currency:'USD'});
        const monthly=comparison.getByRole('row').filter({has:page.getByRole('cell',{name:'Monthly',exact:true})});
        assert.ok((await monthly.innerText()).includes(expected));
        assert.equal(await page.getByRole('table').count(),3);
        assert.ok(!(await page.locator('.xroga-native-openui').innerText()).includes('1.82x the principal'));
        if([390,1440].includes(viewport.width))await page.screenshot({path:resolve(output,channel+'-captured-calculator-'+viewport.width+'-'+theme+'.png'),fullPage:true});
      }
      await open('workflowOwnership');
      const ownershipHeading = page.getByRole('heading', { name: 'Manual versus automated', exact: true });
      await ownershipHeading.waitFor();
      assert.equal(await ownershipHeading.count(), 1);
      assert.equal(await page.getByRole('table').count(), 1);
      await page.getByRole('cell', { name: 'Coordinator', exact: true }).waitFor();
      await page.getByText('Review the work before delivery.', { exact: true }).waitFor();
      await open('sharedAnswer');
      await page.getByText('Basic includes one seat.', { exact: true }).waitFor();
      assert.equal(await page.getByText('Basic includes one seat.', { exact: true }).count(), 1);
      assert.equal(await page.locator('ol li').count(), 2);
      assert.equal(await page.getByRole('table').count(), 1);
      await page.getByRole('cell', { name: 'Basic', exact: true }).waitFor();
      assert.doesNotMatch(await page.getByRole('region', { name: 'Answer', exact: true }).innerText(), /_xroga_answer|root\s*=/);
      await open('articleSpacing');
      await page.getByText('The in-place method returns None.', { exact: true }).waitFor();
      const rhythm = await page.locator('.iui-col:has(> .iui-title)').evaluate(column => {
        const boxes = [...column.children].map(child => child.getBoundingClientRect());
        return {
          headingToText: boxes[3].top - boxes[2].bottom,
          textToHeading: boxes[2].top - boxes[1].bottom,
        };
      });
      assert.ok(rhythm.headingToText >= 4 && rhythm.headingToText <= 12);
      assert.ok(rhythm.textToHeading >= 18 && rhythm.textToHeading <= 28);
      if ([390, 1440].includes(viewport.width)) {
        await page.screenshot({ path: resolve(output, channel + '-article-spacing-' + viewport.width + '-' + theme + '.png'), fullPage: true });
      }
      await open('sharedAnswer');
      if ([390, 1440].includes(viewport.width)) {
        await page.screenshot({ path: resolve(output, channel + '-shared-answer-' + viewport.width + '-' + theme + '.png'), fullPage: true });
      }
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
      await open('rebuiltChecklist');
      const firstCheck = page.getByRole('checkbox', { name: 'Check the links' });
      const secondCheck = page.getByRole('checkbox', { name: 'Proofread the post' });
      await firstCheck.focus();
      await page.keyboard.press('Space');
      assert.equal(await firstCheck.isChecked(), true);
      assert.equal(await secondCheck.isChecked(), false);
      assert.equal(await page.getByText('Check the links', { exact: true }).count(), 1);
      await open('formattedChecklist');
      const formattedCheck = page.getByRole('checkbox', { name: 'Goal and audience. Write one sentence naming who the blog is for and what it helps them do.', exact: true });
      await formattedCheck.focus();
      await page.keyboard.press('Space');
      assert.equal(await formattedCheck.isChecked(), true);
      await page.locator('.iui-check strong').click();
      assert.equal(await formattedCheck.isChecked(), false);
      assert.equal(await page.locator('.iui-check code').innerText(), 'www');
      assert.equal(await page.locator('.iui-check img').count(), 0);
      assert.doesNotMatch(await page.locator('.iui-check').first().innerText(), /\*\*/);
      const positions = await formattedCheck.evaluate(input => ({ input: input.getBoundingClientRect().top, label: input.nextElementSibling.getBoundingClientRect().top }));
      assert.ok(Math.abs(positions.input - positions.label) < 8, 'Multiline checkbox aligns with its first line');
      const labelAudit = await new AxeBuilder({ page }).include('.iui-check').analyze();
      assert.deepEqual(labelAudit.violations.map(({ id }) => id), []);
      if ([390, 1440].includes(viewport.width)) await page.screenshot({ path: resolve(output, 'formatted-checklist-' + viewport.width + '-' + theme + '.png'), fullPage: true });
      await open('rebuiltSignedChart');
      const signedTable = page.getByRole('table', { name: 'Chart data' });
      await signedTable.getByRole('cell', { name: '-800', exact: true }).waitFor();
      for (const value of ['0', '500']) assert.equal(await signedTable.getByRole('cell', { name: value, exact: true }).count(), 1);
      assert.equal(await page.getByRole('table').count(), 1);
      assert.equal(await page.getByText('Cash flow in dollars', { exact: true }).count(), 1);
      if (viewport.width === 390) {
        await page.getByRole('region', { name: 'Answer', exact: true }).screenshot({ path: resolve(output, 'signed-chart-390-' + theme + '.png') });
      }
      await open('signedStackedBars');
      const stacked = page.getByRole('img', { name: 'bar chart of sales, adjustments by month' });
      await stacked.waitFor();
      const geometry = await stacked.evaluate(svg => {
        const zero = Number(svg.querySelector('line.iui-chart-grid:not([stroke-dasharray])')?.getAttribute('y1'));
        const bars = [...svg.querySelectorAll('rect[fill^="var(--iui-chart-"]')].map(rect => ({
          top: Number(rect.getAttribute('y')),
          height: Number(rect.getAttribute('height')),
        }));
        return { zero, bars, width: svg.clientWidth, height: svg.clientHeight };
      });
      assert.ok(geometry.zero > 0);
      assert.equal(geometry.bars.length, 4);
      for (const index of [0, 3]) assert.ok(geometry.bars[index].top < geometry.zero && geometry.bars[index].height > 0);
      for (const index of [1, 2]) assert.ok(geometry.bars[index].top >= geometry.zero && geometry.bars[index].height > 0);
      if (geometry.width < 440) assert.ok(geometry.height <= 317, 'Compact panes constrain tall charts');
      await page.getByRole('table', { name: 'Chart data' }).getByRole('cell', { name: '-$2,000.00', exact: true }).waitFor();
      if ([390, 1440].includes(viewport.width)) {
        await page.getByRole('region', { name: 'Answer', exact: true }).screenshot({ path: resolve(output, 'signed-stacked-' + viewport.width + '-' + theme + '.png') });
      }
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
      await open('scrollingCode');
      const codeBlocks = page.getByRole('group', {name: 'Code block', exact: true});
      assert.equal(await codeBlocks.count(), 2);
      const panels = page.locator('.iui-codeblock');
      assert.deepEqual(await panels.locator('.iui-codeblock-language').allTextContents(), ['Plain text', 'Python']);
      for (const [index, panel] of (await panels.all()).entries()) {
        const expected = await panel.locator('pre code').textContent();
        await panel.getByRole('button', { name: index === 0 ? 'Copy text' : 'Copy code', exact: true }).click();
        await panel.getByText('Copied', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
      }
      for (const code of await codeBlocks.all()) {
        assert.equal(await code.getAttribute('tabindex'), '0');
        await code.focus();
        assert.equal(await code.evaluate(element => element === document.activeElement), true);
        if (await code.evaluate(element => element.scrollWidth > element.clientWidth)) {
          await code.press('ArrowRight');
          await page.waitForFunction(element => element.scrollLeft > 0, await code.elementHandle());
        }
      }
      const codeAccessibility = await new AxeBuilder({page}).analyze();
      assert.deepEqual(codeAccessibility.violations.map(({id}) => id), []);
      await open('compare');
      const table = page.getByRole('table');
      await table.waitFor();
      await table.getByRole('button', { name: 'USD/month' }).click();
      assert.match(await table.getByRole('row').nth(1).innerText(), /Basic/);
      assert.equal(await page.getByRole('region', { name: 'Answer table' }).evaluate(el => el.scrollHeight - el.clientHeight), 0);
      await open('wideComparison');
      const wideRegion = page.getByRole('region', { name: 'Answer table' });
      const seconds = wideRegion.getByRole('button', { name: 'Seconds' });
      await seconds.click();
      const labels = () => wideRegion.locator('tbody td:first-child').allTextContents();
      assert.deepEqual(await labels(), ['Environment', 'Directive', 'Code path', 'Missing']);
      await seconds.click();
      assert.deepEqual(await labels(), ['Code path', 'Directive', 'Environment', 'Missing']);
      await seconds.press('Enter');
      assert.deepEqual(await labels(), ['Environment', 'Directive', 'Code path', 'Missing']);
      assert.equal(await wideRegion.getByRole('columnheader', { name: 'Seconds' }).getAttribute('aria-sort'), 'ascending');
      if (viewport.width <= 390) {
        const directive = wideRegion.getByRole('cell', { name: 'Directive', exact: true });
        assert.equal(await directive.evaluate(cell => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          return range.getClientRects().length;
        }), 1, 'A wide comparison scrolls inside its region and keeps row labels readable');
        assert.ok(await wideRegion.evaluate(el => el.scrollWidth > el.clientWidth));
      }
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
      assert.equal(await slider.getAttribute('aria-valuetext'), '40 people');
      if (viewport.width === 390) {
        const lines = await page.locator('.native-answer-metric > dd:first-of-type').evaluateAll(nodes => nodes.map(node => {
          const range=document.createRange();range.selectNodeContents(node);
          return new Set(Array.from(range.getClientRects(),rect=>Math.round(rect.top))).size;
        }));
        assert.ok(lines.every(count=>count===1),'Calculator values stay readable while preserving the model-specified minimum widths');
      }
      await slider.press('End');
      await page.getByText('$2,000', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Reset' }).click();
      await page.getByText('$1,000', { exact: true }).waitFor();
      await page.getByRole('cell', { name: '$1,500.00', exact: true }).waitFor();
      const accessibility = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(accessibility.violations.map(({id}) => id), []);
      assert.equal(await page.getByRole('columnheader', { name: 'Gross revenue (USD)' }).count(), 1);
      await page.screenshot({ path: resolve(output, channel + '-revenue-' + viewport.width + '-' + theme + '.png'), fullPage: true });
      await open('draftCopy');
      const draft = page.getByRole('group', { name: 'RSVP draft', exact: true });
      const copyDraft = draft.getByRole('button', { name: 'Copy filled fields' });
      await draft.getByRole('textbox', { name: 'Hidden', exact: true }).evaluate(input => { input.closest('label').hidden = true; });
      await draft.getByRole('textbox', { name: 'Disabled', exact: true }).evaluate(input => { input.disabled = true; });
      await draft.getByRole('textbox', { name: 'Password', exact: true }).evaluate(input => { input.type = 'password'; });
      await draft.getByRole('textbox', { name: 'Name', exact: true }).fill('Example guest');
      await draft.getByRole('radio', { name: 'Confirmed attendance Option detail' }).check();
      await draft.getByRole('textbox', { name: 'Accessibility needs' }).fill('Line one\nLine two');
      const draftWrites = [];
      const trackDraftWrites = request => { if (request.method() !== 'GET') draftWrites.push(request.method()); };
      page.on('request', trackDraftWrites);
      await copyDraft.press('Enter');
      await draft.getByRole('status').getByText('Filled fields copied.').waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText().then(text => text.replace(/\r\n/g, '\n'))),
        'Name: Example guest\nAttendance: Confirmed attendance\nGuests: 0\nAccessibility needs: Line one\nLine two');
      assert.equal(await page.getByRole('group', { name: 'Calculator' }).getByRole('button', { name: 'Copy filled fields' }).count(), 0);
      assert.deepEqual(draftWrites, []);
      page.off('request', trackDraftWrites);
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
      const gain = answer.getByRole('slider', { name: 'Gain' });
      assert.equal(await gain.getAttribute('aria-valuetext'), '120%');
      await gain.press('ArrowRight');
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
  // Use the actual independently selectable Workspace skin tokens. Axe alone
  // cannot reliably infer a transparent answer's background through every shell.
  const skinCss = (await readFile('frontend/src/app/globals.css', 'utf8'))
    .match(/  \.terminal-skin-[a-z-]+ \{[^}]+\}/g)?.join('\n');
  assert.ok(skinCss, 'Workspace skin definitions must be present');
  for (const shellTheme of ['black', 'white']) {
    for (const skin of ['dark', 'amoled', 'light', 'light-grid', 'gray', 'midnight', 'forest', 'matrix', 'amber', 'solar']) {
      await palettePage.goto(origin + '/?case=embeddedCitations&theme=' + shellTheme);
      await answerRegion.waitFor();
      await palettePage.addStyleTag({ content: skinCss });
      await palettePage.locator('#root').evaluate((el, skin) => {
        el.className = 'xv-workspace-shell terminal-skin-' + skin;
      }, skin);
      const colors = await answerRegion.evaluate(el => {
        const shell = el.closest('.xv-workspace-shell');
        const style = getComputedStyle(el);
        const shellStyle = getComputedStyle(shell);
        const luminance = color => {
          const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
            const channel = value / 255;
            return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
          });
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        const ink = luminance(style.color);
        const canvas = luminance(shellStyle.backgroundColor);
        return {
          ink: style.color, shellInk: shellStyle.color, scheme: style.colorScheme,
          contrast: (Math.max(ink, canvas) + .05) / (Math.min(ink, canvas) + .05),
        };
      });
      assert.equal(colors.ink, colors.shellInk, shellTheme + '/' + skin + ' follows the local surface');
      assert.ok(colors.contrast >= 4.5, shellTheme + '/' + skin + ' text contrast: ' + colors.contrast);
      assert.equal(colors.scheme, ['light', 'light-grid', 'solar'].includes(skin) ? 'light' : 'dark');
      for (const chip of await answerRegion.locator('[data-source-citation]').all()) {
        assert.equal(await chip.evaluate(el => getComputedStyle(el).color), colors.ink,
          'Caption citations use readable primary ink on ' + skin);
      }
      const citationContrast = await new AxeBuilder({ page: palettePage })
        .include('.xroga-native-openui').withRules(['color-contrast']).analyze();
      assert.deepEqual(citationContrast.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [],
        shellTheme + '/' + skin + ' caption and citation contrast');
      if ((shellTheme === 'white' && skin === 'dark') || (shellTheme === 'black' && skin === 'light')) {
        await palettePage.screenshot({ path: resolve(output, 'mixed-theme-' + shellTheme + '-' + skin + '.png'), fullPage: true });
      }
    }
  }
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
  const evidence = { mode: 'credential-free browser fixture', browser: browser.version(), entryBytes: Object.fromEntries(['/native.js','/native.css'].map(key => [key, assets.get(key).length])), lazyChunks: [...assets.keys()].filter(key => key.startsWith('/native-chunk-')).length, zoomReflow, documentDownloads, results };
  await writeFile(resolve(output, channel + '-native-browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await browser?.close();
  server.close();
}
