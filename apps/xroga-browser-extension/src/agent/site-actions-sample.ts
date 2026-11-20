// A reviewed sample bundle for the fixture Orders page (fixtures/pages/stale-and-slow.html), used by tests and the Chromium scenario. Its rule is the loopback
// address, so it can never match a real website. It shows the three action classes the contract has: a read, a low-risk write, and a consequential action
// that this path refuses to run.
import type { VerifiedSiteAction } from './site-actions';

const source = { origin: 'fixture', repo: 'Xroga/xroga.com', licence: 'proprietary', reviewedBy: 'Xroga engineering (fixture review)', reviewedAt: '2026-11-20' };
const rule = { host: '127.0.0.1', schemes: ['http' as const], pathPrefix: '/stale-and-slow.html' };

export const SAMPLE_ACTIONS: VerifiedSiteAction[] = [
  {
    id: 'orders.list', version: '1', name: 'List orders', description: 'Read the order list shown on the Orders page.',
    rule, actionClass: 'read', inputSchema: { properties: {} }, versionFingerprint: 'Orders',
    steps: [{ tool: 'wait', args: { text: 'Order 1001', timeoutMs: 6000 } }, { tool: 'read', args: {} }],
    postcondition: '', source,
  },
  {
    id: 'orders.open', version: '1', name: 'Open an order', description: 'Open one order by its exact name (Order 1001, Order 1002 or Order 1003).',
    rule, actionClass: 'write_low',
    inputSchema: { required: ['order'], properties: { order: { type: 'string', enum: ['Order 1001', 'Order 1002', 'Order 1003'] } } },
    versionFingerprint: 'Orders',
    steps: [{ tool: 'click', args: { target: { role: 'button', name: 'Open {{input.order}}' } } }],
    postcondition: 'chosen: {{input.order}}', idempotencyKey: ['order'], source,
  },
  {
    id: 'orders.delete', version: '1', name: 'Delete an order', description: 'Delete one order (consequential: never run from this path).',
    rule, actionClass: 'write_consequential',
    inputSchema: { required: ['order'], properties: { order: { type: 'string', maxLength: 40 } } },
    versionFingerprint: 'Orders',
    steps: [{ tool: 'click', args: { target: { role: 'button', name: 'Delete {{input.order}}' } } }],
    postcondition: 'deleted: {{input.order}}', source,
  },
];
