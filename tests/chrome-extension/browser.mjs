import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] ? resolve(process.argv[2]) : "playwright");
const chromeExecutable = process.argv[3];
const extensionPath = fileURLToPath(new URL("../../chrome-extension", import.meta.url));
const temporaryRoot = await realpath(tmpdir());
const profile = await mkdtemp(join(temporaryRoot, "xroga-extension-"));
let browser;
const fixture = `<!doctype html><title>Research report</title>
  <main><h1>Market research</h1><h2>Sources</h2>
  <a href="/method?token=fixture-query#fixture-fragment">Method</a>
  <a href="/method">Method</a>
  <a href="javascript:void(0)">Unsafe link</a>
  <a href="/file" download>Download fixture</a>
  <h2 hidden>Fixture hidden text</h2>
  <h2 style="visibility:hidden">Fixture hidden style</h2>
  <form><h2>Fixture form text</h2><input type="password" value="fixture-password"></form>
  <iframe srcdoc="<h2>Fixture iframe text</h2>"></iframe>
  </main>`;

try {
  browser = await chromium.launchPersistentContext(profile, {
    ...(chromeExecutable ? { executablePath: chromeExecutable } : { channel: "chromium" }),
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging", "--disable-background-networking"],
  });
  const tab = browser.pages()[0];
  const cdp = await browser.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", { path: extensionPath });
  const worker = browser.serviceWorkers().find((entry) => new URL(entry.url()).hostname === id) ??
    await browser.waitForEvent("serviceworker", { predicate: (entry) => new URL(entry.url()).hostname === id, timeout: 5_000 });
  browser.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) console.error(message.text());
  });
  const requests = [];
  await browser.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    if (url.origin === "https://xroga-fixture.test" || url.origin === "https://other-fixture.test") {
      await route.fulfill({ contentType: "text/html", body: fixture });
    } else {
      await route.abort();
    }
  });
  await tab.goto("https://xroga-fixture.test/report");
  const { targetInfos: tabs } = await cdp.send("Target.getTargets", { filter: [{ type: "tab" }] });
  const target = tabs.find(({ url }) => url === tab.url());
  assert.ok(target, "the fixture tab is available to the browser action");
  assert.ok(await worker.evaluate(() => chrome.action.onClicked.hasListeners()), "the extension worker registered its toolbar handler");
  await cdp.send("Extensions.triggerAction", { id, targetId: target.targetId });
  // Playwright does not expose Chrome's side-panel target as a Page. Verify it
  // opened, then use its same extension URL in a background tab for UI automation.
  const panelUrl = `chrome-extension://${id}/panel.html`;
  let opened = false;
  for (let attempt = 0; attempt < 30 && !opened; attempt++) {
    const contexts = await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] }));
    opened = contexts.some(({ documentUrl }) => documentUrl === panelUrl);
    if (!opened) await new Promise((resume) => setTimeout(resume, 100));
  }
  assert.ok(opened, "the toolbar action opened the real Chrome side panel");

  const panel = await browser.newPage();
  panel.on("pageerror", (error) => console.error(error.message));
  panel.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await panel.goto(panelUrl);
  const request = panel.getByLabel("What should Xroga collect?");
  const review = panel.getByRole("button", { name: "Review task" });
  const run = panel.getByRole("button", { name: "Read this tab" });
  const status = panel.getByRole("status");
  const submit = async (input) => {
    await request.fill(input);
    await tab.bringToFront();
    await review.evaluate((button) => button.click());
  };

  await submit("Collect the page title, headings and links.");
  await run.waitFor({ state: "visible", timeout: 4_000 }).catch(async (error) => {
    console.error("Review status:", await status.textContent());
    console.error("Active fixture access:", await worker.evaluate(async () => {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      return { hasUrl: !!active?.url };
    }));
    throw error;
  });
  assert.equal(await panel.locator("#report").innerText(), "");
  await run.evaluate((button) => button.click());
  await panel.getByText("Tab read complete.", { exact: true }).waitFor({ timeout: 4_000 });
  const report = await panel.locator("#report").innerText();
  for (const text of ["Research report", "Market research", "Sources", "https://xroga-fixture.test/method"]) {
    assert.ok(report.includes(text), text);
  }
  for (const text of ["Fixture hidden", "fixture-query", "fixture-fragment", "Fixture form", "fixture-password", "Fixture iframe", "Unsafe link", "Download fixture"]) {
    assert.ok(!report.includes(text), text);
  }
  assert.equal(report.match(/https:\/\/xroga-fixture\.test\/method/g)?.length, 1);

  await submit("Collect links and publish an ad");
  await panel.getByText(/This version reads the page title/).waitFor({ timeout: 4_000 });
  assert.equal(await run.isVisible(), false);

  await submit("Collect headings");
  await run.waitFor({ state: "visible", timeout: 4_000 });
  await panel.getByRole("button", { name: "Cancel" }).evaluate((button) => button.click());
  assert.equal(await status.textContent(), "Task cancelled.");
  assert.equal(await panel.locator("#results").isVisible(), false);

  await submit("Collect headings");
  await run.waitFor({ state: "visible", timeout: 4_000 });
  await tab.reload();
  await run.evaluate((button) => button.click());
  await panel.getByText("The page changed or access ended. Review the task again.").waitFor({ timeout: 4_000 });
  assert.equal(await panel.locator("#results").isVisible(), false);

  await tab.goto("https://other-fixture.test/report");
  await submit("Collect headings");
  await panel.getByText(/click the Xroga toolbar icon/i).waitFor({ timeout: 4_000 });
  assert.equal(await run.isVisible(), false);
  assert.deepEqual(new Set(requests.map((requestUrl) => new URL(requestUrl).origin)),
    new Set(["https://xroga-fixture.test", "https://other-fixture.test"]));
  const { product } = await cdp.send("Browser.getVersion");
  console.log(JSON.stringify({ result: "PASS", product, actualSidePanelOpened: true, browserAutomation: "isolated HTTPS fixture", modelCalls: 0, thirdPartyRequests: 0 }));
} finally {
  try { await browser?.close(); }
  finally {
    if (dirname(await realpath(profile)) !== temporaryRoot) throw new Error("Test profile is outside owned temporary storage.");
    await rm(profile, { recursive: true, force: true });
  }
}
