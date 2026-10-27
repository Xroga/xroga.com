import './reactGlobal.testsupport';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ChangeRevision, ChangeView, DeliveryReceipt, SourceBinding } from '@/lib/existingSourceApi';
import { ChangeDetail, type ChangeDetailProps } from './ChangeDetail';
import { classifyDiff, deliveryState, isActive, progressSteps, reproductionNote, statusTone, testHeadline } from './changeView';

const DIFF = ['diff --git a/src/a.js b/src/a.js', '--- a/src/a.js', '+++ b/src/a.js', '@@ -1,2 +1,2 @@', ' keep', '-old <b>x</b>', '+new', '+++ not a header', '--- not a header either', '\\ No newline at end of file', ''].join('\n');

const revision = (over: Partial<ChangeRevision> = {}): ChangeRevision => ({
  n: 1, at: '2026-10-27T10:00:00.000Z', digest: 'd'.repeat(64), additions: 2, deletions: 1, warnings: [], diff: DIFF, diffTruncated: false, note: '',
  files: [{ path: 'src/a.js', kind: 'modified', additions: 2, deletions: 1, warnings: ['line endings changed from CRLF'] }],
  tests: { status: 'passed', summary: '1 test run passed (npm test).', runtime: 'node', evidence: 'ok 1 - sums', stages: [] }, ...over,
});
const change = (over: Partial<ChangeView> = {}): ChangeView => ({
  id: '11111111-1111-4111-8111-111111111111', bindingId: 'b', instruction: 'Fix the discount bug', status: 'verified', statusReason: 'Tests passed in isolation.', baseCommitSha: 'a'.repeat(40),
  scope: { confidence: 'high', targets: ['src/a.js'], consumers: [], tests: ['test/a.test.js'], mapStatus: 'valid' }, acceptanceCriteria: [], attempts: 1, maxAttempts: 3, revisions: [revision()],
  events: [{ at: '2026-10-27T10:00:00.000Z', type: 'change.created', message: 'Change requested.' }, { at: '2026-10-27T10:00:01.000Z', type: 'scope.resolved', message: 'Likely files: src/a.js.' }, { at: '2026-10-27T10:00:09.000Z', type: 'verification.completed', message: '1 test run passed.' }],
  files: [{ path: 'src/a.js', kind: 'modified' }], reproduction: 'reproduced', regressionTestAdded: true, deliveries: [], createdAt: '2026-10-27T10:00:00.000Z', updatedAt: '2026-10-27T10:00:10.000Z', ...over,
});
const github: Pick<SourceBinding, 'originKind' | 'permissions' | 'repositoryArchived' | 'state'> = { originKind: 'github', permissions: { pull: true, push: true, admin: false }, repositoryArchived: false, state: 'linked' };
const props = (over: Partial<ChangeDetailProps> = {}): ChangeDetailProps => ({ change: change(), binding: github, busy: null, revision: 1, acknowledged: false, conflicts: null, notice: null, onRevision() {}, onAcknowledge() {}, onCancel() {}, onResume() {}, onDeliver() {}, onExport() {}, ...over });
const html = (over: Partial<ChangeDetailProps> = {}) => renderToStaticMarkup(createElement(ChangeDetail, props(over)));

describe('change view rules', () => {
  it('classifies a diff by its first character only, so file content cannot pose as a header', () => {
    const { lines } = classifyDiff(DIFF);
    assert.deepEqual(lines.map((l) => l.kind), ['file', 'meta', 'meta', 'hunk', 'context', 'del', 'add', 'add', 'del', 'meta']);
    assert.equal(lines[7]!.text, '+++ not a header');
    assert.equal(classifyDiff('x\n'.repeat(5_000).replace(/x/g, '+x')).truncated, true);
  });

  it('delivery is allowed only for a finished change on a GitHub repository the account can push to, and says why not otherwise', () => {
    assert.deepEqual([deliveryState(change(), github).canDeliver, deliveryState(change(), github).needsAcknowledgement], [true, false]);
    assert.equal(deliveryState(change({ status: 'unverified' }), github).needsAcknowledgement, true);
    for (const [status, text] of [['working', /Wait/], ['interrupted', /Resume/], ['failed', /finished/], ['cancelled', /finished/]] as const) {
      const d = deliveryState(change({ status }), github); assert.equal(d.canDeliver, false); assert.match(d.reason ?? '', text); assert.equal(d.canExport, false);
    }
    assert.match(deliveryState(change(), { ...github, originKind: 'archive' }).reason ?? '', /never pushed/);
    assert.match(deliveryState(change(), { ...github, permissions: { pull: true, push: false, admin: false } }).reason ?? '', /cannot push/);
    assert.match(deliveryState(change(), { ...github, repositoryArchived: true }).reason ?? '', /archived/);
    assert.match(deliveryState(change(), { ...github, state: 'access_lost' }).reason ?? '', /not active/);
    assert.equal(deliveryState(change(), { ...github, originKind: 'archive' }).canExport, true, 'a ZIP project can still export');
    assert.equal(deliveryState(change({ files: [] }), github).canExport, false);
  });

  it('describes tests and reproduction without overstating them', () => {
    assert.match(testHeadline(null), /not run/);
    for (const [status, text] of [['failed', /failed/], ['unsupported', /nothing was tested/], ['unavailable', /not run/], ['timeout', /timed out/], ['error', /could not be completed/]] as const) assert.match(testHeadline({ status, summary: '', runtime: null, evidence: '', stages: [] }), text);
    assert.match(reproductionNote('not_reproduced', true) ?? '', /does not prove/);
    assert.equal(reproductionNote('not_applicable', false), null);
    assert.equal(reproductionNote('unavailable', false), null);
    assert.equal(isActive('verifying'), true); assert.equal(isActive('interrupted'), false);
    assert.equal(statusTone('unverified'), 'warn'); assert.equal(statusTone('failed'), 'bad');
    assert.equal(progressSteps(change()).length, 2, 'the creation event is not a step');
  });
});

describe('the change screen renders what the server recorded', () => {
  it('shows status, reason, files with counts and warnings, test headline and evidence, reproduction, and a colour-coded diff with escaped content', () => {
    const out = html();
    assert.match(out, /data-testid="change-status"[^>]*>.*Verified/);
    assert.match(out, /Tests passed in isolation\./);
    assert.match(out, /src\/a\.js/); assert.match(out, /\+2/); assert.match(out, /-1/);
    assert.match(out, /line endings changed from CRLF/);
    assert.match(out, /Tests passed \(node\)\./);
    assert.match(out, /fails on the original code|fails on the original code and passes/);
    assert.match(out, /ok 1 - sums/);
    assert.match(out, /data-kind="add"[^>]*>\+new/);
    assert.match(out, /data-kind="del"[^>]*>-old &lt;b&gt;x&lt;\/b&gt;/, 'diff content is escaped, never interpreted as markup');
    assert.match(out, /Likely files: src\/a\.js\./);
    assert.match(out, /role="status"/);
    assert.match(out, /aria-live="polite"/);
  });

  it('shows a running change with a live status and a cancel action, and no delivery', () => {
    const out = html({ change: change({ status: 'verifying', statusReason: 'Running the project tests in isolation.', revisions: [], files: [] }) });
    assert.match(out, /Running the project tests/);
    assert.match(out, /Cancel/);
    assert.match(out, /Wait for the change to finish/);
    assert.match(out, /disabled=""[^>]*>.*Open a draft pull request|Open a draft pull request/);
    assert.ok(!/>Patch</.test(out), 'nothing to export while it runs');
  });

  it('says plainly when a change is not test-verified, and requires an acknowledgement before a draft PR', () => {
    const c = change({ status: 'unverified', statusReason: 'No native test runner was found.', revisions: [revision({ tests: { status: 'unsupported', summary: 'none', runtime: null, evidence: '', stages: [] } })], reproduction: 'not_applicable', regressionTestAdded: false });
    const out = html({ change: c });
    assert.match(out, /data-testid="unverified-banner"/);
    assert.match(out, /nothing was tested/);
    assert.match(out, /I understand this is not test-verified/);
    assert.match(out, /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Open a draft pull request/s);
    assert.ok(!/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Open a draft pull request/s.test(html({ change: c, acknowledged: true })), 'enabled once acknowledged');
  });

  it('shows failure without implying anything was written, interruption with a resume action, and cancellation', () => {
    assert.match(html({ change: change({ status: 'failed', statusReason: 'The tests still fail.', files: [], revisions: [revision({ tests: { status: 'failed', summary: 'x', runtime: 'node', evidence: 'AssertionError 1 !== 2', stages: [] } })] }) }), /Nothing was written to your project/);
    assert.match(html({ change: change({ status: 'interrupted', statusReason: 'The run stopped.', files: [], revisions: [] }) }), /Resume/);
    assert.match(html({ change: change({ status: 'cancelled', files: [], revisions: [] }) }), /Cancelled/);
  });

  it('shows a delivery conflict with each file and reason, a receipt with a rebase warning, and revision tabs after a repair', () => {
    const conflict = html({ conflicts: [{ path: 'src/a.js', baseBlobSha: 'a', remoteBlobSha: 'b', reason: 'changed_on_remote' }] });
    assert.match(conflict, /data-testid="delivery-conflict"/); assert.match(conflict, /src\/a\.js<\/code>: changed on remote/); assert.match(conflict, /nothing was written/);
    const receipt: DeliveryReceipt = { kind: 'pull_request', at: 'x', branch: 'xroga/change-1-2', commitSha: 'c'.repeat(40), pullRequestNumber: 7, pullRequestUrl: 'https://github.com/acme/cart/pull/7', baseBranch: 'main', baseCommitSha: 'a'.repeat(40), headAtDelivery: 'b'.repeat(40), rebased: true, verified: false, draft: true, note: '' };
    const delivered = html({ change: change({ status: 'delivered', deliveries: [receipt] }) });
    assert.match(delivered, /Draft pull request/); assert.match(delivered, /xroga\/change-1-2/); assert.match(delivered, /rel="noreferrer noopener"/); assert.match(delivered, /Retest before merging/);
    assert.ok(!/Open a draft pull request/.test(delivered), 'no second delivery button after a receipt');
    const repaired = html({ change: change({ revisions: [revision({ n: 1, tests: { status: 'failed', summary: 'x', runtime: 'node', evidence: '', stages: [] } }), revision({ n: 2 })], attempts: 2 }), revision: 2 });
    assert.match(repaired, /Revision 1 \(failed\)/); assert.match(repaired, /Revision 2 \(passed\)/); assert.match(repaired, /Attempt 2 of 3/);
  });

  it('explains why a ZIP or read-only project cannot be pushed but can still export', () => {
    const zip = html({ binding: { ...github, originKind: 'archive' } });
    assert.match(zip, /never pushed anywhere/); assert.match(zip, />Patch</); assert.match(zip, /ZIP of changed files/);
    assert.match(html({ binding: { ...github, permissions: { pull: true, push: false, admin: false } } }), /cannot push/);
  });
});
