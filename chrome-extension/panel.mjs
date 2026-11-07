import { eligiblePage, operationLabels, planTask } from "./task.mjs";
import { readPage } from "./read-page.mjs";

const byId = (id) => document.getElementById(id);
const form = byId("task-form");
const request = byId("request");
const review = byId("review");
const run = byId("run");
const stop = byId("stop");
const status = byId("status");
const results = byId("results");
const report = byId("report");
let pending;
let generation = 0;

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function resetTask() {
  generation++;
  pending = undefined;
  review.hidden = true;
  run.disabled = false;
  stop.textContent = "Cancel";
}

function clearReport() {
  report.replaceChildren();
  results.hidden = true;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  resetTask();
  clearReport();
  const current = generation;
  status.textContent = "";
  try {
    const steps = planTask(request.value);
    const tab = await activeTab();
    const page = eligiblePage(tab?.url);
    if (!page || tab.id == null) throw new Error("Open an HTTPS page, then click the Xroga toolbar icon on that tab to grant access.");
    // Bind the review to the current top-frame document without reading page content.
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      func: () => location.href,
    }).catch(() => []);
    if (!frame?.documentId || frame.result !== page.href) {
      throw new Error("Click the Xroga toolbar icon on the tab you want to read, then review the task again.");
    }
    if (current !== generation) return;
    pending = { tabId: tab.id, documentId: frame.documentId, url: page.href, steps };
    byId("target").textContent = page.origin + page.pathname;
    byId("steps").replaceChildren(...steps.map((step) => element("li", operationLabels[step])));
    review.hidden = false;
    run.focus();
  } catch (error) {
    if (current === generation) status.textContent = error.message;
  }
});

request.addEventListener("input", () => {
  if (pending || !review.hidden) status.textContent = "Request changed. Review it again before reading.";
  resetTask();
});

stop.addEventListener("click", () => {
  resetTask();
  status.textContent = "Task cancelled.";
  byId("prepare").focus();
});

byId("clear").addEventListener("click", () => {
  clearReport();
  status.textContent = "Results cleared.";
  request.focus();
});

function renderReport(data) {
  for (const [step, items] of Object.entries(data)) {
    report.append(element("h3", operationLabels[step]));
    const list = document.createElement("ul");
    for (const item of items) {
      const row = element("li", typeof item === "string" ? item : item.label);
      if (item.url) row.append(element("small", item.url));
      list.append(row);
    }
    report.append(items.length ? list : element("p", "No matching content found."));
  }
  results.hidden = false;
}

run.addEventListener("click", async () => {
  if (!pending || run.disabled) return;
  const task = pending;
  const current = generation;
  run.disabled = true;
  stop.textContent = "Stop";
  status.textContent = "Reading the reviewed tab…";
  try {
    const tab = await activeTab();
    if (current !== generation) return;
    if (tab?.id !== task.tabId || tab.url !== task.url) throw new Error("The active tab changed. Review the task again.");
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId: task.tabId, documentIds: [task.documentId] },
      func: readPage,
      args: [task.url, task.steps],
    }).catch(() => []);
    if (current !== generation) return;
    if (!frame?.result?.report) throw new Error("The page changed or access ended. Review the task again.");
    renderReport(frame.result.report);
    status.textContent = frame.result.limited ? "Results are limited to the first 25 items per group and a bounded page scan." : "Tab read complete.";
  } catch (error) {
    if (current === generation) status.textContent = error.message;
  } finally {
    if (current === generation) {
      resetTask();
      byId("prepare").focus();
    }
  }
});
