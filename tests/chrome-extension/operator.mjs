import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.argv[2] ? resolve(process.argv[2]) : "playwright",
);
const chrome = process.argv[3];
const live = process.argv.includes("--live-zurelay");
const formOnly = live && process.argv.includes("--form-only");
const documentOnly = live && process.argv.includes("--document-only");
const liveKey = live ? process.env.XROGA_CHROME_PROBE_KEY : undefined;
delete process.env.XROGA_CHROME_PROBE_KEY;
if (live)
  assert.ok(
    liveKey,
    "An existing credential is required for the authorized live probe.",
  );
const providerModel = "deepseek-v4.1-flash-1017";
const receipts = [];
let liveRequests = 0;
let spentMicros = 0;
// Chrome's IndexedDB files can exceed Windows' path limit under a deeply nested job root.
const root = await realpath(process.argv[4] ?? tmpdir());
const profile = await mkdtemp(join(root, "xr-op-"));
const audioFixture = join(profile, "dictation.wav");
const dist = fileURLToPath(
  new URL("../../apps/xroga-browser-extension/dist", import.meta.url),
);
const site = "https://operator-fixture.test";
const searchOrigin = "https://www.google.com";
const workspaceOrigin = "https://xroga.com";
const fixtureOwner = "00000000-0000-4000-8000-000000000001";
let fixtureAccount = fixtureOwner;
const repo = fileURLToPath(new URL("../../", import.meta.url));
const goal = "Open the catalog and report the published fixture price.";
const answer = "The verified fixture price is $39.";
const formGoal =
  "Enter Synthetic Applicant in the application, submit only after my approval, then read the receipt.";
const formAnswer = "The fixture confirmed the application.";
const stopGoal = "Stop this task before its pending model turn can act.";
const recoveryGoal = "Open the catalog and verify the price even if a model request is interrupted.";
const fileGoal =
  "Use the target product from the attached file. Follow the catalog link, find the listed price and report it.";
const workbookGoal =
  "Use the final order row in the attached workbook. Open the catalog and follow its product link for the final price. Report the product, quantity, unit price and total.";
const runs = new Map();
let voiceRequests = 0;
const actionCues = new Set();
let rejectPairing = !live;
let browser;

async function buildWorkspacePairingFailure() {
  const { build } = require("esbuild");
  const result = await build({
    stdin: {
      contents: `
        import { createRoot } from 'react-dom/client';
        import { WorkspaceBrowserOperator } from './frontend/src/components/browser/WorkspaceBrowserOperator';
        const extensionId = new URL(location.href).searchParams.get('browserExtension');
        createRoot(document.querySelector('#app')).render(<WorkspaceBrowserOperator extensionId={extensionId} />);
      `,
      resolveDir: repo,
      loader: "tsx",
    },
    jsx: "automatic",
    bundle: true,
    write: false,
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{
      name: "isolated-workspace-api",
      setup(plugin) {
        plugin.onResolve({ filter: /^@\/lib\/(api|supabase\/client|voiceApi)$/ }, args => ({
          path: args.path, namespace: "fixture",
        }));
        plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => {
          if (args.path === "@/lib/api") return { contents: `
            export class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
            export async function getAccessToken() { return 'fixture-authenticated-user'; }
            export async function apiFetch(path) {
              if (path !== '/api/browser/local/session') throw new Error('Unexpected request');
              throw new ApiError('Not found', 404);
            }
          ` };
          return { contents: `
            export function createClient() { throw new Error('Pairing should stop on an unavailable API'); }
            export function transcribeVoiceAudio() { throw new Error('Unexpected voice request'); }
          ` };
        });
      },
    }],
  });
  return result.outputFiles[0].text;
}

async function liveReply(run, request) {
  const body = {
    model: providerModel,
    messages: request.messages,
    tools: request.tools,
    tool_choice: request.tool_choice,
    stream: false,
    reasoning_effort: "none",
    max_tokens: 768,
  };
  const wire = JSON.stringify(body);
  // Conservative: UTF-8 wire bytes upper-bound text tokens for these synthetic requests.
  assert.ok(
    ++liveRequests <= 14 &&
      spentMicros + Math.ceil(Buffer.byteLength(wire) * 0.03 + 768 * 0.12) <=
        25_000,
    "Live probe reached its request or $0.025 spend ceiling.",
  );
  const { validateZurelayRequest, verifyZurelayResponse } =
    await import("../../backend/src/ai/zurelayWire.ts");
  const { actualProviderCostMicroUsd } =
    await import("../../backend/src/ai/providerBudget.ts");
  validateZurelayRequest(body, providerModel);
  const started = performance.now();
  const response = await fetch("https://api.zurelay.com/v1/chat/completions", {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(35_000),
    headers: {
      authorization: `Bearer ${liveKey}`,
      "content-type": "application/json",
      "x-zurelay-fallback": "off",
    },
    body: wire,
  });
  assert.ok(
    response.ok,
    `Live Zurelay request failed with HTTP ${response.status}`,
  );
  await verifyZurelayResponse(response, providerModel, false);
  const payload = await response.json();
  const usage = payload.usage;
  const costMicros = actualProviderCostMicroUsd({
    modelId: "deepseek_v4_1_flash_1017",
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
  });
  spentMicros += costMicros;
  const choice = payload.choices[0];
  const tools = (choice.message.tool_calls ?? []).map(
    (call) => call.function.name,
  );
  run.turns.push(...tools);
  const receipt = {
    id: response.headers.get("x-request-id"),
    elapsedMs: Math.round(performance.now() - started),
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    costMicros,
    tools,
  };
  receipts.push(receipt);
  console.log(JSON.stringify(receipt));
  return { id: payload.id, model: "deepseek_v4_1_flash_1017", choice, usage };
}

function reply(run, request) {
  const history = JSON.stringify(request.messages);
  const observation =
    request.messages.findLast((message) => message.role === "tool")?.content ??
    "";
  const ref = (label) => {
    const line = observation.split("\n").find((item) => item.includes(label));
    const value = /\[([ae]\d+)\]/.exec(line ?? "")?.[1];
    assert.ok(value, observation.slice(-2500));
    return { ref: value };
  };
  const call = (name, args) => ({
    id: `tool_${request.turn}`,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  });
  let tool;
  if (request.turn === 1) tool = call("snapshot", {});
  else if (run.goal === formGoal) {
    if (request.turn === 2)
      tool = call("fill_form", {
        fields: [
          { target: ref("Applicant name"), value: "Synthetic Applicant" },
        ],
        submit: ref("Submit application"),
      });
    else if (request.turn === 3) tool = call("read", {});
    else if (request.turn === 4) {
      assert.match(history, /Application received: Synthetic Applicant/);
      tool = call("done", { outcome: "success", summary: formAnswer });
    }
  } else if (request.turn === 2) {
    tool = call("click", { target: ref("Browse catalog") });
  } else if (run.goal === recoveryGoal) {
    if (request.turn === 4) tool = call("snapshot", {});
    if (request.turn === 5) tool = call("read", {});
    if (request.turn === 6) tool = call("done", { outcome: "success", summary: answer });
  } else if (request.turn === 3) tool = call("read", {});
  else if (request.turn === 4) tool = call("screenshot", {});
  else if (request.turn === 5) {
    assert.match(history, /Fixture price: \$39/);
    assert.doesNotMatch(history, /image_url|data:image/);
    tool = call("done", { outcome: "success", summary: answer });
  }
  if (!tool) throw new Error("Unexpected extra model request");
  run.turns.push(tool.function.name);
  return {
    id: `fixture_${request.turn}`,
    model: "deepseek_v4_1_flash_1017",
    choice: {
      finish_reason: "tool_calls",
      message: { content: null, tool_calls: [tool] },
    },
    usage: { prompt_tokens: 150, completion_tokens: 20, total_tokens: 170 },
  };
}

try {
  const workspaceFailureScript = live ? null : await buildWorkspacePairingFailure();
  if (!live) {
    const rate = 16_000;
    const wav = Buffer.alloc(44 + 4 * rate * 2);
    wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
    for (let i = 0; i < 4 * rate; i++)
      wav.writeInt16LE(Math.round(4000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
    await writeFile(audioFixture, wav);
  }
  browser = await chromium.launchPersistentContext(profile, {
    ...(chrome ? { executablePath: chrome } : { channel: "chromium" }),
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      "--enable-unsafe-extension-debugging",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--use-mock-keychain",
      ...(live ? [] : ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-audio-capture=${audioFixture}`]),
    ],
    timeout: 20_000,
  });
  console.log("Chrome started");
  browser.on("page", page => page.on("pageerror", error => console.error("Fixture page error:", error.message)));
  const tab = browser.pages()[0];
  const cdp = await browser.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", { path: dist });
  console.log("Agent extension loaded");
  if (!live) {
    await browser.exposeFunction("fixtureActionCue", action => actionCues.add(action));
    await browser.addInitScript(origin => {
      if (location.origin !== origin) return;
      for (const event of ["click", "input"]) {
        document.addEventListener(event, () => {
          if (document.querySelector("[data-xroga-action-point]"))
            void window.fixtureActionCue(event);
        }, true);
      }
    }, site);
  }
  await browser.exposeFunction(
    "fixtureBrowserRequest",
    async ({ op, value }) => {
      if (op === "voice" && !live) {
        const wav = Buffer.from(value.body, "base64");
        const { requireVoicePcm } = await import("../../backend/src/ai/voicePcm.ts");
        assert.ok(requireVoicePcm(wav).seconds > 0);
        voiceRequests++;
        return { text: "Synthetic dictation draft" };
      }
      if (op === "start") {
        assert.ok(
          [goal, formGoal, stopGoal, fileGoal, workbookGoal, recoveryGoal].includes(
            value.goal,
          ),
        );
        if (value.goal === fileGoal || value.goal === workbookGoal)
          assert.equal(value.attachmentCount, 1);
        const runId = globalThis.crypto.randomUUID();
        assert.ok([site, searchOrigin].includes(value.startUrl), "Persist only the starting origin");
        runs.set(runId, { goal: value.goal, turns: [], startUrl: value.startUrl });
        return { runId, turns: 0, maxTurns: 48, remainingMs: 40 * 60_000 };
      }
      const run = runs.get(value.runId);
      assert.ok(
        run,
        "turns and results use the admitted canonical run identity",
      );
      if (op === "turn") {
        if (run.goal === recoveryGoal) {
          (run.ordinals ??= []).push(value.body.turn);
          if (value.body.turn === 3) {
            // Hang after the provider admission boundary, then pause from the actual side panel.
            await new Promise(resolve => { run.release = resolve; });
            throw new Error("Synthetic unknown provider receipt");
          }
        }
        if (run.goal === stopGoal) {
          run.pending = true;
          await new Promise((resolve) => {
            run.release = resolve;
          });
        }
        return live && run.goal !== stopGoal
          ? liveReply(run, value.body)
          : reply(run, value.body);
      }
      if (op === "resume" && run.goal === recoveryGoal) {
        assert.deepEqual(run.ordinals, [1, 2, 3]);
        return { runId: value.runId, turns: 3, maxTurns: 48, remainingMs: 39 * 60_000 };
      }
      if (op === "finish") {
        if (run.goal === recoveryGoal && !(run.finishAttempts ?? 0)) {
          run.finishAttempts = 1;
          run.firstFinish = value.body;
          throw new Error("Synthetic finalization acknowledgement lost");
        }
        if (run.goal === recoveryGoal) {
          run.finishAttempts++;
          assert.deepEqual(value.body, run.firstFinish, "Resend only the durable outcome");
        }
        run.result = value.body;
        return { status: value.body.status };
      }
      throw new Error("Unexpected request");
    },
  );
  await browser.route(/^https?:\/\//, (route) => {
    const url = new URL(route.request().url());
    if (url.origin === site || (!live && url.origin === searchOrigin)) {
      const body =
        url.pathname === "/catalog"
          ? documentOnly
            ? '<title>Catalog</title><main><h1>Catalog</h1><button id="reveal">Show products</button><div id="products"></div></main><script>document.querySelector("#reveal").onclick = () => setTimeout(() => { document.querySelector("#products").innerHTML = "<a href=\'/products/orion\'>Orion product details</a>"; }, 250);</script>'
            : "<title>Catalog</title><main><h1>Catalog</h1><p>Atlas Fixture price: $39</p><p>Orion Fixture price: $82</p></main>"
          : url.pathname === "/products/orion"
            ? "<title>Orion details</title><main><h1>Orion</h1><p>Verified unit price: $82</p></main>"
            : url.pathname === "/apply"
              ? '<title>Application</title><main><form action="/received"><label>Applicant name<input name="applicant" required></label><button type="submit">Submit application</button></form></main>'
              : url.pathname === "/received" &&
                  url.searchParams.get("applicant") === "Synthetic Applicant"
                ? "<title>Receipt</title><main><p>Application received: Synthetic Applicant</p></main>"
                : '<title>Store</title><main><h1>Store</h1><a href="/catalog">Browse catalog</a></main>';
      return route.fulfill({ contentType: "text/html", body });
    }
    if (url.origin === workspaceOrigin && url.pathname === "/workspace") {
      if (rejectPairing) {
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><div id="app"></div><script>${workspaceFailureScript.replaceAll("</script", "<\\/script")}</script>`,
        });
      }
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Workspace bridge fixture</title>
        <div id="state">connecting</div><script>
        const query = new URLSearchParams(location.search);
        const port = chrome.runtime.connect(query.get('browserExtension'), {name:'xroga-browser-v1'});
        window.events = [];
        window.startTask = (goal, startUrl, files) => port.postMessage({type:'start-task',goal,startUrl,files});
        window.resumeTask = runId => port.postMessage({type:'resume-task',runId});
        port.onMessage.addListener(async m => {
          events.push(m.type === 'activity' ? [m.type,m.tool,m.status] : [m.type,m.runId]);
          if(m.type==='paired') document.querySelector('#state').textContent='paired';
          if(m.type==='pair-rejected') document.querySelector('#state').textContent='account rejected';
          if(m.type==='request') {
            try { port.postMessage({type:'result',id:m.id,ok:true,value:await fixtureBrowserRequest(m)}); }
            catch (e) { document.querySelector('#state').textContent=e.message; port.postMessage({type:'result',id:m.id,ok:false}); }
          }
        });
        port.postMessage({type:'pair',nonce:query.get('browserPair'),account:${JSON.stringify(fixtureAccount)}});
        </script>`,
      });
    }
    return route.abort();
  });
  await tab.goto(site);
  const { targetInfos } = await cdp.send("Target.getTargets", {
    filter: [{ type: "tab" }],
  });
  const target = targetInfos.find((item) => item.url === tab.url());
  assert.ok(target);
  await cdp.send("Extensions.triggerAction", { id, targetId: target.targetId });
  const panel = await browser.newPage();
  await tab.bringToFront();
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  const connect = () => panel.getByRole("button", { name: "Connect Xroga Workspace" })
    .evaluate((button) => button.click());
  if (!live) {
    // Opening the side panel attempts an authenticated handoff in the background.
    await panel.getByRole("alert").filter({hasText:"Browser Automation is unavailable"}).waitFor({timeout: 15_000})
      .catch(async error => {
        for (const page of browser.pages()) {
          if (page === panel || page.url().startsWith(`${workspaceOrigin}/workspace?`)) {
            console.error("Pairing fixture page:", (await page.locator("body").innerText()).slice(0, 500));
          }
        }
        throw error;
      });
    const pairingPages = browser.pages().filter(page => page.url().startsWith(`${workspaceOrigin}/workspace?`));
    assert.equal(pairingPages.length, 1);
    await pairingPages[0].getByRole("status").filter({hasText:"Browser Automation is unavailable"}).waitFor();
    const [pairingTab] = await panel.evaluate(() => chrome.tabs.query({ url: "https://xroga.com/workspace*" }));
    assert.equal(pairingTab?.active, false);
    rejectPairing = false;
    await connect();
  }
  let workspace;
  const deadline = Date.now() + 15_000;
  while (!workspace && Date.now() < deadline) {
    workspace = browser
      .pages()
      .find((page) => page.url().startsWith(`${workspaceOrigin}/workspace?`));
    if (!workspace) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(
    workspace,
    `Expected pairing page. Open pages: ${browser
      .pages()
      .map((page) => page.url())
      .join(", ")}`,
  );
  await workspace
    .getByText("paired", { exact: true })
    .waitFor({ timeout: 15_000 })
    .catch(async (error) => {
      console.error(
        "Pairing state:",
        await workspace.locator("body").innerText(),
      );
      console.error(
        "Extension panel:",
        await panel.locator("body").innerText(),
      );
      throw error;
    });
  console.log("Workspace fixture paired");
  await panel.getByRole("status").filter({ hasText: "Workspace connected" }).waitFor({timeout: 15_000});
  await panel.getByRole("button", { name: "Connect Xroga Workspace" }).waitFor({ state: "hidden" });
  assert.equal(await panel.getByLabel("Website or search").count(), 0);
  const input = panel.locator("textarea");
  if (!live) {
    const settings = await browser.newPage();
    await settings.goto(`chrome-extension://${id}/options.html#permissions`);
    await settings.getByText("Xroga Browser Automation", { exact: true }).waitFor();
    const permissions = await settings.evaluate(() => chrome.permissions.getAll());
    assert.ok(permissions.permissions.includes("tabGroups"));
    assert.ok(permissions.permissions.includes("downloads"));
    assert.ok(!permissions.permissions.includes("notifications"));
    await settings.getByRole("button", { name: "General" }).click();
    assert.equal(await settings.getByText("Maximum turns").count(), 0);
    await settings.getByRole("button", { name: "Workflows" }).click();
    await settings.getByText("Custom instructions", { exact: true }).waitFor();
    await settings.getByRole("button", { name: "New shortcut" }).click();
    await settings.locator('input[type="file"]').setInputFiles({
      name: "SKILL.md", mimeType: "text/markdown",
      buffer: Buffer.from("---\nname: product-research\ndescription: Review listings\n---\nCompare the public listings."),
    });
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await settings.getByText("/product-research", { exact: true }).waitFor();
    await settings.close();
    await panel.bringToFront();
    await panel.getByRole("button", { name: "Voice input" }).click();
    const stopVoice = panel.getByRole("button", { name: "Stop recording" });
    await stopVoice.waitFor();
    await new Promise(resolve => setTimeout(resolve, 450));
    await stopVoice.click();
    await panel.waitForFunction(() => document.querySelector("textarea")?.value === "Synthetic dictation draft", undefined, { timeout: 12_000 })
      .catch(async error => {
        console.error("Dictation fixture", { voiceRequests, alerts: await panel.getByRole("alert").allTextContents() });
        throw error;
      });
    assert.equal(voiceRequests, 1);
    assert.equal(runs.size, 0, "Dictation must not send a task");
  }
  const waitForFinish = async (expected) => {
    await workspace
      .waitForFunction(
        (count) =>
          window.events.filter((event) => event[0] === "finished").length ===
          count,
        expected,
        { timeout: live ? 100_000 : 25_000, polling: 100 },
      )
      .catch(async (error) => {
        console.error(
          "Workspace fixture:",
          await workspace.locator("#state").textContent(),
        );
        console.error("Events:", await workspace.evaluate(() => window.events));
        console.error(
          "Panel:",
          (await panel.locator("body").innerText()).slice(-1500),
        );
        throw error;
      });
  };
  if (documentOnly) {
    const { default: ExcelJS } = await import("exceljs");
    const { readBrowserDocument } =
      await import("../../backend/src/routes/browserDocuments.ts");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Orders");
    sheet.addRow(["Product", "Quantity", "Notes"]);
    for (let index = 1; index <= 600; index++) {
      sheet.addRow([
        `Archive row ${index}`,
        1,
        "Prior reference only. It is not the order to process.",
      ]);
    }
    sheet.addRow(["Orion", 7, "Final order to process"]);
    const text = await readBrowserDocument(
      "orders.xlsx",
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );
    assert.ok(text.length > 40_000);
    await workspace.evaluate(
      ({ goal, site, text }) =>
        window.startTask(goal, site, [{ name: "orders.xlsx.txt", text }]),
      { goal: workbookGoal, site, text },
    );
    await waitForFinish(1);
    const run = [...runs.values()][0];
    assert.equal(run.result?.status, "completed", await workspace.locator("#state").textContent());
    assert.match(run.result.result, /Orion/i);
    assert.match(run.result.result, /\b574\b/);
    assert.ok(run.turns.includes("read_attachment"));
    assert.ok(
      browser.pages().some((page) => page.url() === `${site}/products/orion`),
    );
    console.log(
      JSON.stringify({
        scenario: "live-workbook-and-dynamic-catalog",
        attachmentChars: text.length,
        result: run.result,
        costMicros: spentMicros,
      }),
    );
  } else if (!formOnly) {
    await input.fill(goal);
    if (!live) await tab.bringToFront();
    await input.press("Enter");
    console.log("Side-panel task submitted");
    await waitForFinish(1);
    console.log("Side-panel task reached a terminal state");
    console.log("First task receipt:", JSON.stringify([...runs.values()]));
    assert.equal(
      [...runs.values()][0]?.result?.status,
      "completed",
      await workspace.locator("#state").textContent(),
    );
    assert.ok(browser.pages().some((page) => page.url() === `${site}/catalog`));
    await workspace.evaluate(
      ({ goal, site, live }) =>
        window.startTask(
          goal,
          live ? site : undefined,
          live
            ? [
                {
                  name: "purchase-order.csv",
                  text: "product,quantity\nOrion,2",
                },
              ]
            : undefined,
        ),
      { goal: live ? fileGoal : goal, site, live },
    );
    await waitForFinish(2);
    assert.equal(
      browser.pages().filter((page) => [`${site}/catalog`, `${searchOrigin}/catalog`].includes(page.url())).length,
      2,
    );
    assert.equal(runs.size, 2);
    if (!live) assert.ok([...runs.values()].some(run => run.startUrl === searchOrigin));
    for (const run of runs.values()) {
      if (live) {
        assert.equal(run.result?.status, "completed");
        assert.match(
          run.result.result,
          run.goal === fileGoal ? /Orion[\s\S]*82|82[\s\S]*Orion/i : /39/,
        );
        assert.ok(
          run.result.actions.some(
            (action) => action === "click" || action === "navigate",
          ),
        );
      } else {
        assert.deepEqual(run.turns, ["snapshot", "click", "read", "screenshot", "done"]);
        assert.deepEqual(run.result, {
          status: "completed",
          result: answer,
          actions: ["snapshot", "click", "read", "screenshot"],
        });
      }
    }
  }
  if (!documentOnly) {
    await tab.goto(`${site}/apply`);
    await input.fill(formGoal);
    if (!live) await tab.bringToFront();
    await input.press("Enter");
    const allow = panel.getByRole("button", { name: "Allow", exact: true });
    await allow
      .waitFor({ timeout: live ? 70_000 : 15_000 })
      .catch(async (error) => {
        console.error(
          "Form receipt:",
          [...runs.values()].find((run) => run.goal === formGoal),
        );
        console.error(
          "Workspace state:",
          await workspace.locator("#state").textContent(),
        );
        console.error("Form panel:", await panel.locator("body").innerText());
        throw error;
      });
    assert.equal(
      await panel
        .getByRole("button", { name: "Always allow", exact: false })
        .count(),
      0,
    );
    await workspace.waitForFunction(
      () => window.events.some((event) => event[2] === "approval-required"),
      undefined,
      {
        timeout: 5_000,
        polling: 100,
      },
    );
    assert.equal(
      browser.pages().some((page) => page.url().startsWith(`${site}/received`)),
      false,
    );
    await allow.click();
    await waitForFinish(formOnly ? 1 : 3);
    assert.ok(
      browser.pages().some((page) => page.url().startsWith(`${site}/received`)),
    );
    const formRun = [...runs.values()].find((run) => run.goal === formGoal);
    if (live) assert.equal(formRun.result?.status, "completed");
    else
      assert.deepEqual(formRun.result, {
        status: "completed",
        result: formAnswer,
        actions: ["snapshot", "fill_form", "read"],
      });

    await tab.goto(site);
    await input.fill(stopGoal);
    await input.press("Enter");
    const stop = panel.getByRole("button", { name: "Stop", exact: true });
    await stop.waitFor({ timeout: 15_000 });
    const pendingDeadline = Date.now() + 10_000;
    let stopRun;
    while (!stopRun?.pending && Date.now() < pendingDeadline) {
      stopRun = [...runs.values()].find((run) => run.goal === stopGoal);
      if (!stopRun?.pending)
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(stopRun?.pending);
    await stop.click();
    try {
      await waitForFinish(formOnly ? 2 : 4);
      assert.deepEqual(stopRun.result, { status: "cancelled", actions: [] });
    } finally {
      stopRun.release();
    }
  }
  if (!live) {
    await tab.goto(site);
    await input.fill(recoveryGoal);
    await input.press("Enter");
    const pause = panel.getByRole("button", { name: "Pause and take over", exact: true });
    await pause.waitFor({ timeout: 25_000 });
    const claimDeadline = Date.now() + 20_000;
    let recovery;
    while (!recovery?.release && Date.now() < claimDeadline) {
      recovery = [...runs.values()].find(run => run.goal === recoveryGoal);
      if (!recovery?.release) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(recovery?.release, "the third request crossed the fixture provider admission boundary");
    await pause.click();
    const resume = panel.getByRole("button", { name: "Resume", exact: true });
    await resume.waitFor({ timeout: 25_000 });
    recovery.release();
    assert.deepEqual(recovery.ordinals, [1, 2, 3]);
    assert.equal(recovery.result, undefined);
    await resume.click();
    await panel.getByText("Task saved locally. Resume to sync the result without rerunning any action.", { exact: true }).waitFor({ timeout: 25_000 }).catch(async error => {
      console.error("Recovery fixture state:", JSON.stringify({ ordinals: recovery.ordinals, finishAttempts: recovery.finishAttempts, events: await workspace.evaluate(() => window.events.slice(-12)), panel: (await panel.locator('body').innerText()).slice(-1200) }));
      throw error;
    });
    assert.equal(recovery.result, undefined);
    assert.deepEqual(recovery.ordinals, [1, 2, 3, 4, 5, 6]);
    const runId = [...runs.entries()].find(([, candidate]) => candidate === recovery)?.[0];
    assert.ok(runId);

    // Kill the actual Chrome service worker. Only the owner can re-pair this profile and sync the saved result.
    const workerClient = await browser.newCDPSession(tab);
    await workerClient.send("ServiceWorker.enable");
    fixtureAccount = "00000000-0000-4000-8000-000000000002";
    await workerClient.send("ServiceWorker.stopAllWorkers");
    await workerClient.detach();
    await workspace.close();
    const reopening = browser.waitForEvent("page", { timeout: 20_000, predicate: page => page !== panel });
    await tab.bringToFront();
    await panel.reload();
    workspace = await reopening;
    await workspace.getByText("account rejected", { exact: true }).waitFor({ timeout: 15_000 });
    assert.equal(recovery.finishAttempts, 1);

    fixtureAccount = fixtureOwner;
    await connect();
    await workspace.getByText("paired", { exact: true }).waitFor({ timeout: 15_000 });
    await workspace.waitForFunction(id => window.events.some(([type, run]) => type === 'checkpoint' && run === id), runId);
    await workspace.evaluate(id => window.resumeTask(id), runId);
    await waitForFinish(1);
    assert.deepEqual(recovery.ordinals, [1, 2, 3, 4, 5, 6]);
    assert.equal(recovery.finishAttempts, 2);
    assert.equal(recovery.result.status, "completed");
    assert.equal(recovery.result.actions.filter(action => action === "click").length, 1);
    assert.ok(actionCues.has("click"), "The blue marker was visible when Chrome clicked");
    assert.ok(actionCues.has("input"), "The blue marker was visible when Chrome typed");
  }
  const { product } = await cdp.send("Browser.getVersion");
  console.log(
    JSON.stringify({
      result: "PASS",
      product,
      approvedSubmission: !documentOnly,
      cancelledPendingTurn: !documentOnly,
      voiceFixtureRequests: voiceRequests,
      actionCues: [...actionCues].sort(),
      resumedWithoutReplay: !live,
      restartAndAccountBoundary: !live,
      manualPauseAndResume: !live,
      screenshotPixelsSentToModel: false,
      entryPoints: ["side panel", "Workspace fixture"],
      model: live ? providerModel : "deterministic fixture",
      liveModelCalls: receipts.length,
      costMicros: spentMicros,
    }),
  );
} finally {
  try {
    await browser?.close();
  } finally {
    if (dirname(await realpath(profile)) !== root)
      throw new Error("Chrome profile is outside its owned directory.");
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}
