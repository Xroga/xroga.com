import test from "node:test";
import assert from "node:assert/strict";
import {
  sections,
  packs,
  employees,
  combinations,
  packPrompt,
  statusGroup,
} from "./catalog";
import { evidenceLinks } from "./evidence";

test("all nine sections and thirteen outcome packs are present with valid specialists", () => {
  assert.equal(sections.length, 9);
  assert.equal(packs.length, 13);
  assert.equal(new Set(packs.map((p) => p.id)).size, 13);
  for (const pack of packs) {
    assert.ok(pack.steps.length > 2);
    assert.ok(pack.outputs.length);
    assert.ok(pack.roles.every((r) => r.apps.length));
    assert.ok(pack.employees.every((id) => employees.some((e) => e.id === id)));
    assert.match(pack.approval, /explicit approval/);
  }
  assert.ok(combinations.every((c) => packs.some((p) => p.id === c.pack)));
});
test("launcher prompt retains outcome, preferred destinations and authorization boundaries", () => {
  const prompt = packPrompt(
    packs[0],
    { "Publishing destination": "webflow" },
    "Write about responsible automation",
  );
  assert.match(prompt, /^Write about responsible automation/);
  assert.match(prompt, /Publishing destination: webflow/);
  assert.match(prompt, /Verify account connections/);
  assert.match(prompt, /explicit approval/);
  for (const step of packs[0].steps) assert.ok(prompt.includes(step));
});
test("unrecognized states are never fabricated as successful executions", () => {
  assert.equal(statusGroup("new_backend_status"), "unknown");
  assert.equal(statusGroup("awaiting_approval"), "approval-needed");
  assert.equal(statusGroup("queued"), "queued");
  assert.equal(statusGroup("running"), "running");
  assert.equal(statusGroup("paused"), "paused");
  assert.equal(statusGroup("completed"), "completed");
  assert.equal(statusGroup("failed"), "failed");
});
test("evidence links reject executable schemes and deduplicate safe artifacts", () => {
  assert.deepEqual(
    evidenceLinks({
      artifacts: [
        "https://example.com/report",
        "javascript:alert(1)",
        "data:text/html,bad",
        "https://example.com/report",
      ],
    }),
    ["https://example.com/report"],
  );
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.deepEqual(evidenceLinks(cyclic), []);
});
