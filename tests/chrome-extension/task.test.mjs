import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { eligiblePage, planTask } from "../../chrome-extension/task.mjs";

test("turns supported requests into an ordered, deduplicated read plan", () => {
  assert.deepEqual(planTask("Please collect the page title, headings, and visible links from this tab."), ["title", "headings", "links"]);
  assert.deepEqual(planTask("Show me the links and outline and links"), ["links", "headings"]);
});

test("rejects unsupported instructions without executing a partial plan", () => {
  for (const request of ["", "Publish my Meta ad", "Collect headings and click Publish", "List links to open in new tabs", "Show me links and run alert(1)"]) {
    assert.throws(() => planTask(request), Error, request);
  }
});

test("only accepts eligible HTTPS destinations", () => {
  assert.equal(eligiblePage("https://example.com/page?q=x#fragment")?.origin, "https://example.com");
  for (const url of [undefined, "chrome://settings", "file:///tmp/file", "http://example.com", "https://127.1", "https://[::1]", "https://app.local.", "https://foo.localhost", "https://localhost", "https://user:pass@example.com"]) {
    assert.equal(eligiblePage(url), null, url);
  }
});

test("uses temporary tab permissions with no host, storage or remote-message privileges", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../chrome-extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.incognito, "not_allowed");
  assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "scripting", "sidePanel"]);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
  for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions", "externally_connectable", "content_scripts", "web_accessible_resources"]) {
    assert.equal(Object.hasOwn(manifest, key), false, key);
  }
});
