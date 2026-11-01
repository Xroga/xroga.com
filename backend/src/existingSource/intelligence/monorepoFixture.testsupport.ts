/**
 * A realistic TypeScript monorepo, generated deterministically for tests and the Phase 2 benchmark.
 *
 * Fourteen packages (billing, invoicing, notifications, auth, customers, orders, inventory, shipping, reporting, a gateway, an admin
 * web app and shared libraries), each with several domain entities, and each entity with types, a repository, a service, validators,
 * routes and tests that import one another and import across packages through workspace names. Names are domain-specific on purpose:
 * "validate", "notification" and "invoice" appear in many unrelated places, so a retrieval method that only matches words is
 * visibly worse than one that follows the code. The hand-written files carry the scenarios whose correct answers are known.
 */
import type { FakeFile } from '../fakeGitHub.testsupport.js';

interface Pkg { dir: string; name: string; entities: string[]; api?: boolean; web?: boolean }

const PACKAGES: Pkg[] = [
  { dir: 'packages/billing', name: '@acme/billing', entities: ['invoice', 'payment', 'refund', 'subscription', 'taxRate', 'creditNote', 'dunningStep'], api: true },
  { dir: 'packages/invoicing', name: '@acme/invoicing', entities: ['invoiceTemplate', 'invoiceBatch', 'reminder', 'lineItem', 'discountRule', 'numberingSequence'] },
  { dir: 'packages/notifications', name: '@acme/notifications', entities: ['emailMessage', 'smsMessage', 'pushMessage', 'template', 'deliveryAttempt', 'suppressionEntry'], api: true },
  { dir: 'packages/auth', name: '@acme/auth', entities: ['session', 'credential', 'role', 'permissionGrant', 'apiKey', 'passwordReset'], api: true },
  { dir: 'packages/customers', name: '@acme/customers', entities: ['customer', 'contact', 'address', 'segment', 'consentRecord', 'note'], api: true },
  { dir: 'packages/orders', name: '@acme/orders', entities: ['order', 'cart', 'checkout', 'promotion', 'orderLine', 'fulfillmentTask'], api: true },
  { dir: 'packages/inventory', name: '@acme/inventory', entities: ['stockItem', 'warehouse', 'stockMovement', 'supplier', 'purchaseOrder', 'reorderPolicy'] },
  { dir: 'packages/shipping', name: '@acme/shipping', entities: ['shipment', 'carrier', 'rateQuote', 'label', 'trackingEvent', 'returnRequest'], api: true },
  { dir: 'packages/reporting', name: '@acme/reporting', entities: ['salesReport', 'cohort', 'forecast', 'exportJob', 'dashboardWidget', 'metricSeries'] },
  { dir: 'packages/catalog', name: '@acme/catalog', entities: ['product', 'category', 'variant', 'priceList', 'bundle', 'brand'], api: true },
  { dir: 'packages/support', name: '@acme/support', entities: ['ticket', 'macro', 'slaPolicy', 'escalation', 'satisfactionSurvey', 'knowledgeArticle'], api: true },
  { dir: 'packages/gateway', name: '@acme/gateway', entities: ['route', 'rateLimit', 'cacheRule', 'requestLog', 'upstream', 'healthProbe'], api: true },
  { dir: 'apps/admin-web', name: '@acme/admin-web', entities: ['dashboardPage', 'customerPage', 'orderPage', 'settingsPage', 'reportPage'], web: true },
  { dir: 'libs/shared', name: '@acme/shared', entities: ['logger', 'config', 'httpClient', 'validation', 'clock', 'idGenerator', 'moneyMath', 'retryPolicy'] },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function entityFiles(pkg: Pkg, entity: string): FakeFile[] {
  const E = cap(entity); const k = kebab(entity); const d = `${pkg.dir}/src/${k}`;
  const files: FakeFile[] = [];
  files.push({ path: `${d}/${k}.types.ts`, content: `export interface ${E} {\n  id: string;\n  tenantId: string;\n  createdAt: Date;\n  status: '${k}_active' | '${k}_archived';\n  ${entity}Version: number;\n}\n\nexport interface Create${E}Input {\n  tenantId: string;\n  ${entity}Label: string;\n}\n` });
  files.push({ path: `${d}/${k}.repository.ts`, content: `import type { ${E}, Create${E}Input } from './${k}.types';\nimport { createLogger } from '@acme/shared';\n\nconst log = createLogger('${pkg.name}:${k}');\nconst rows = new Map<string, ${E}>();\n\nexport async function find${E}ById(id: string): Promise<${E} | null> {\n  log.debug('find ${k}', { id });\n  return rows.get(id) ?? null;\n}\n\nexport async function insert${E}(input: Create${E}Input): Promise<${E}> {\n  const row: ${E} = { id: \`${k}-\${rows.size + 1}\`, tenantId: input.tenantId, createdAt: new Date(), status: '${k}_active', ${entity}Version: 1 };\n  rows.set(row.id, row);\n  return row;\n}\n\nexport async function list${E}sForTenant(tenantId: string): Promise<${E}[]> {\n  return [...rows.values()].filter((r) => r.tenantId === tenantId);\n}\n` });
  files.push({ path: `${d}/${k}.validators.ts`, content: `import type { Create${E}Input } from './${k}.types';\n\nexport class ${E}ValidationError extends Error {}\n\nexport function validateCreate${E}Input(input: Create${E}Input): void {\n  if (!input.tenantId) throw new ${E}ValidationError('tenant id is required for ${k}');\n  if (input.${entity}Label.length > 120) throw new ${E}ValidationError('${k} label is too long');\n}\n` });
  files.push({ path: `${d}/${k}.service.ts`, content: `import { find${E}ById, insert${E}, list${E}sForTenant } from './${k}.repository';\nimport { validateCreate${E}Input } from './${k}.validators';\nimport type { ${E}, Create${E}Input } from './${k}.types';\n\nexport async function create${E}(input: Create${E}Input): Promise<${E}> {\n  validateCreate${E}Input(input);\n  return insert${E}(input);\n}\n\nexport async function get${E}(id: string): Promise<${E}> {\n  const row = await find${E}ById(id);\n  if (!row) throw new Error('${k} not found: ' + id);\n  return row;\n}\n\nexport async function count${E}sForTenant(tenantId: string): Promise<number> {\n  return (await list${E}sForTenant(tenantId)).length;\n}\n` });
  files.push({ path: `${d}/${k}.service.test.ts`, content: `import { create${E}, get${E} } from './${k}.service';\n\ndescribe('${k} service', () => {\n  it('creates and reads a ${k}', async () => {\n    const row = await create${E}({ tenantId: 't1', ${entity}Label: 'x' });\n    expect((await get${E}(row.id)).id).toBe(row.id);\n  });\n  it('rejects a missing tenant for ${k}', async () => {\n    await expect(create${E}({ tenantId: '', ${entity}Label: 'x' })).rejects.toThrow();\n  });\n});\n` });
  files.push({ path: `${d}/${k}.validators.test.ts`, content: `import { validateCreate${E}Input } from './${k}.validators';\n\ndescribe('${k} validators', () => {\n  it('accepts a normal input', () => { validateCreate${E}Input({ tenantId: 't', ${entity}Label: 'ok' }); });\n  it('rejects an over-long label', () => { expect(() => validateCreate${E}Input({ tenantId: 't', ${entity}Label: 'x'.repeat(200) })).toThrow(); });\n});\n` });
  if (pkg.api) files.push({ path: `${d}/${k}.routes.ts`, content: `import { Router } from 'express';\nimport { create${E}, get${E} } from './${k}.service';\n\nexport const ${entity}Routes = Router();\n\n${entity}Routes.post('/${k}s', async (req, res) => {\n  res.status(201).json(await create${E}({ tenantId: req.header('x-tenant') ?? '', ${entity}Label: String(req.body?.label ?? '') }));\n});\n\n${entity}Routes.get('/${k}s/:id', async (req, res) => {\n  res.json(await get${E}(req.params.id));\n});\n` });
  if (pkg.web) files.push({ path: `${d}/${E}.tsx`, content: `import React from 'react';\nimport { createLogger } from '@acme/shared';\n\nconst log = createLogger('web:${k}');\n\nexport function ${E}() {\n  log.debug('render ${k}');\n  return <section data-page="${k}"><h1>${E}</h1></section>;\n}\n` });
  return files;
}

/** The hand-written files that carry the scenarios with known answers, and the cross-package wiring. */
function scenarioFiles(): FakeFile[] {
  return [
    { path: 'packages/billing/src/notifications/validateInvoiceNotification.ts', content: `import type { InvoiceNotification } from './types';\n\nexport class InvoiceNotificationError extends Error {}\n\n/** An invoice notification must name an invoice, a recipient and a due date that is not in the past. */\nexport function validateInvoiceNotification(notification: InvoiceNotification, now: Date = new Date()): void {\n  if (!notification.invoiceId) throw new InvoiceNotificationError('invoice id is required');\n  if (!notification.recipientEmail.includes('@')) throw new InvoiceNotificationError('recipient email is invalid');\n  if (notification.dueDate.getTime() < now.getTime()) throw new InvoiceNotificationError('due date is in the past');\n}\n` },
    { path: 'packages/billing/src/notifications/types.ts', content: `export interface InvoiceNotification {\n  invoiceId: string;\n  recipientEmail: string;\n  dueDate: Date;\n  amountCents: number;\n}\n` },
    { path: 'packages/billing/src/notifications/sendInvoiceNotification.ts', content: `import { validateInvoiceNotification } from './validateInvoiceNotification';\nimport type { InvoiceNotification } from './types';\nimport { sendEmailMessage } from '@acme/notifications';\n\nexport async function sendInvoiceNotification(notification: InvoiceNotification): Promise<void> {\n  validateInvoiceNotification(notification);\n  await sendEmailMessage({ to: notification.recipientEmail, subject: 'Invoice ' + notification.invoiceId });\n}\n` },
    { path: 'packages/billing/src/notifications/sendInvoiceNotification.test.ts', content: `import { sendInvoiceNotification } from './sendInvoiceNotification';\n\ndescribe('sendInvoiceNotification', () => {\n  it('rejects a notification without a recipient', async () => {\n    await expect(sendInvoiceNotification({ invoiceId: 'i1', recipientEmail: 'nope', dueDate: new Date(Date.now() + 1e6), amountCents: 100 })).rejects.toThrow();\n  });\n});\n` },
    { path: 'packages/billing/src/notifications/validateInvoiceNotification.test.ts', content: `import { validateInvoiceNotification } from './validateInvoiceNotification';\n\ndescribe('validateInvoiceNotification', () => {\n  it('accepts a complete notification', () => {\n    validateInvoiceNotification({ invoiceId: 'i1', recipientEmail: 'a@b.c', dueDate: new Date(Date.now() + 1e6), amountCents: 5 });\n  });\n  it('rejects a past due date', () => {\n    expect(() => validateInvoiceNotification({ invoiceId: 'i1', recipientEmail: 'a@b.c', dueDate: new Date(0), amountCents: 5 })).toThrow();\n  });\n});\n` },
    { path: 'packages/billing/src/api/invoiceNotificationRoutes.ts', content: `import { Router } from 'express';\nimport { validateInvoiceNotification } from '../notifications/validateInvoiceNotification';\nimport { sendInvoiceNotification } from '../notifications/sendInvoiceNotification';\n\nexport const invoiceNotificationRoutes = Router();\n\ninvoiceNotificationRoutes.post('/invoices/:id/notify', async (req, res) => {\n  const notification = { invoiceId: req.params.id, recipientEmail: String(req.body?.email ?? ''), dueDate: new Date(req.body?.dueDate), amountCents: Number(req.body?.amountCents ?? 0) };\n  validateInvoiceNotification(notification);\n  await sendInvoiceNotification(notification);\n  res.status(202).end();\n});\n` },
    { path: 'packages/billing/src/index.ts', content: `export { validateInvoiceNotification, InvoiceNotificationError } from './notifications/validateInvoiceNotification';\nexport { sendInvoiceNotification } from './notifications/sendInvoiceNotification';\nexport { invoiceNotificationRoutes } from './api/invoiceNotificationRoutes';\nexport { createInvoice, getInvoice } from './invoice/invoice.service';\nexport { createPayment } from './payment/payment.service';\n` },
    { path: 'packages/invoicing/src/reminders/reminderJob.ts', content: `import { validateInvoiceNotification } from '@acme/billing';\nimport { listReminderRows } from './reminderStore';\n\nexport async function runReminderJob(now: Date): Promise<number> {\n  let sent = 0;\n  for (const row of await listReminderRows()) {\n    validateInvoiceNotification({ invoiceId: row.invoiceId, recipientEmail: row.email, dueDate: row.dueDate, amountCents: row.amountCents }, now);\n    sent += 1;\n  }\n  return sent;\n}\n` },
    { path: 'packages/invoicing/src/reminders/reminderStore.ts', content: `export interface ReminderRow { invoiceId: string; email: string; dueDate: Date; amountCents: number }\nexport async function listReminderRows(): Promise<ReminderRow[]> { return []; }\n` },
    // distractors that share words with the scenario
    { path: 'packages/notifications/src/validation/validateNotificationPayload.ts', content: `export function validateNotificationPayload(payload: { to: string; subject: string }): void {\n  if (!payload.to) throw new Error('recipient required');\n  if (!payload.subject) throw new Error('subject required');\n}\n` },
    { path: 'packages/notifications/src/index.ts', content: `export { createEmailMessage as sendEmailMessage } from './email-message/email-message.service';\nexport { validateNotificationPayload } from './validation/validateNotificationPayload';\n` },
    { path: 'packages/billing/src/invoices/validateInvoice.ts', content: `export function validateInvoice(invoice: { id: string; totalCents: number }): void {\n  if (invoice.totalCents < 0) throw new Error('negative invoice total');\n}\n` },
    { path: 'packages/invoicing/src/validation/validateInvoiceTemplate.ts', content: `export function validateInvoiceTemplate(template: { name: string }): void {\n  if (!template.name) throw new Error('template name required');\n}\n` },
    { path: 'packages/customers/src/notifications/customerNotificationPreferences.ts', content: `export interface CustomerNotificationPreferences { email: boolean; sms: boolean }\nexport function defaultCustomerNotificationPreferences(): CustomerNotificationPreferences { return { email: true, sms: false }; }\n` },
    // other scenarios
    { path: 'packages/orders/src/pricing/calculateOrderTotal.ts', content: `import { roundMoney } from '@acme/shared';\n\nexport interface PricedLine { unitCents: number; quantity: number; discountPercent: number }\n\n/** Sums the lines and applies each line discount before rounding once at the end. */\nexport function calculateOrderTotal(lines: PricedLine[]): number {\n  const raw = lines.reduce((sum, l) => sum + l.unitCents * l.quantity * (1 - l.discountPercent / 100), 0);\n  return roundMoney(raw);\n}\n` },
    { path: 'packages/orders/src/pricing/calculateOrderTotal.test.ts', content: `import { calculateOrderTotal } from './calculateOrderTotal';\n\ndescribe('calculateOrderTotal', () => {\n  it('rounds once at the end', () => { expect(calculateOrderTotal([{ unitCents: 333, quantity: 3, discountPercent: 10 }])).toBe(899); });\n});\n` },
    { path: 'packages/orders/src/checkout/checkoutSummary.ts', content: `import { calculateOrderTotal } from '../pricing/calculateOrderTotal';\n\nexport function checkoutSummary(lines: { unitCents: number; quantity: number; discountPercent: number }[]) {\n  return { totalCents: calculateOrderTotal(lines), lineCount: lines.length };\n}\n` },
    { path: 'packages/gateway/src/orders/orderTotalProxy.ts', content: `import { calculateOrderTotal } from '@acme/orders';\nexport const orderTotalProxy = (lines: never[]) => calculateOrderTotal(lines);\n` },
    { path: 'packages/orders/src/index.ts', content: `export { calculateOrderTotal } from './pricing/calculateOrderTotal';\nexport { checkoutSummary } from './checkout/checkoutSummary';\n` },
    { path: 'libs/shared/src/moneyMath/roundMoney.ts', content: `export function roundMoney(value: number): number { return Math.round(value); }\n` },
    { path: 'libs/shared/src/index.ts', content: `export { createLogger } from './logger/logger.service';\nexport { roundMoney } from './moneyMath/roundMoney';\n` },
    { path: 'libs/shared/src/logger/logger.service.ts', content: `export function createLogger(scope: string) {\n  return { debug: (m: string, x?: object) => void [scope, m, x], info: (m: string) => void [scope, m] };\n}\n` },
    { path: 'packages/auth/src/session/refreshToken.ts', content: `import { findSessionById } from './session.repository';\n\nexport async function refreshToken(sessionId: string): Promise<string> {\n  const session = await findSessionById(sessionId);\n  if (!session) throw new Error('unknown session');\n  const expiresAt = session.createdAt.getTime() + 3_600_000;\n  if (Date.now() > expiresAt) throw new Error('session expired');\n  return 'token-' + session.id;\n}\n` },
    { path: 'packages/auth/src/session/session.repository.ts', content: `export async function findSessionById(id: string): Promise<{ id: string; createdAt: Date } | null> { return id ? { id, createdAt: new Date() } : null; }\n` },
    { path: 'packages/shipping/src/label/createShipmentLabel.ts', content: `export async function createShipmentLabel(shipmentId: string, carrierId: string | null): Promise<string> {\n  if (!carrierId) throw new Error('carrier is missing');\n  return 'label-' + shipmentId + '-' + carrierId;\n}\n` },
    { path: 'packages/gateway/src/shipments/shipmentLabelRoute.ts', content: `import { Router } from 'express';\nimport { createShipmentLabel } from '@acme/shipping';\n\nexport const shipmentLabelRoute = Router();\nshipmentLabelRoute.get('/shipments/:id/label', async (req, res) => {\n  res.json({ label: await createShipmentLabel(req.params.id, req.query.carrier ? String(req.query.carrier) : null) });\n});\n` },
    { path: 'packages/shipping/src/index.ts', content: `export { createShipmentLabel } from './label/createShipmentLabel';\n` },
  ];
}

const manifest = (pkg: Pkg, deps: string[]) => JSON.stringify({ name: pkg.name, version: '1.0.0', main: 'src/index.ts', scripts: { test: 'jest' }, dependencies: Object.fromEntries(deps.map((d) => [d, '*'])) }, null, 2);

export function monorepoFiles(): FakeFile[] {
  const files: FakeFile[] = [
    { path: 'package.json', content: JSON.stringify({ name: 'acme-monorepo', private: true, workspaces: ['packages/*', 'apps/*', 'libs/*'], scripts: { test: 'npm run test --workspaces' } }, null, 2) },
    { path: 'tsconfig.base.json', content: JSON.stringify({ compilerOptions: { target: 'es2022', strict: true } }) },
    { path: 'README.md', content: '# acme monorepo\n\nBilling, orders, shipping and support services.\n' },
    { path: 'package-lock.json', content: '{"lockfileVersion":3,"packages":{}}' },
    { path: '.env', content: 'DATABASE_URL=postgres://user:secret@db/acme\n' },
  ];
  for (const pkg of PACKAGES) {
    files.push({ path: `${pkg.dir}/package.json`, content: manifest(pkg, ['@acme/shared']) });
    files.push({ path: `${pkg.dir}/tsconfig.json`, content: JSON.stringify({ extends: '../../tsconfig.base.json', compilerOptions: { baseUrl: '.', paths: { '~/*': ['src/*'] } } }) });
    for (const e of pkg.entities) files.push(...entityFiles(pkg, e));
  }
  // vendored and generated noise a real repository carries
  files.push({ path: 'node_modules/left-pad/index.js', content: 'module.exports = function leftPad(s, n) { return s.padStart(n); };\n' });
  files.push({ path: 'packages/billing/dist/index.js', content: 'exports.built = true;\n' });
  files.push({ path: 'apps/admin-web/public/logo.png', content: 'PNG' });
  files.push({ path: 'libs/shared/src/generated/schema.min.js', content: 'var a=1;' });
  const scenario = scenarioFiles();
  const scenarioPaths = new Set(scenario.map((f) => f.path));
  // a scenario file replaces a generated one at the same path
  return [...files.filter((f) => !scenarioPaths.has(f.path)), ...scenario];
}

/** Known answers for the benchmark: what a correct locator must find for each request. */
export interface GroundTruthTask {
  readonly id: string;
  readonly request: string;
  readonly targets: readonly string[];
  readonly consumers: readonly string[];
  readonly tests: readonly string[];
}

export const GROUND_TRUTH: readonly GroundTruthTask[] = [
  {
    id: 'invoice-notification-validation',
    request: 'Change the invoice notification validation only in the billing service and its affected consumers: reject notifications whose amount is zero.',
    targets: ['packages/billing/src/notifications/validateInvoiceNotification.ts'],
    consumers: ['packages/billing/src/notifications/sendInvoiceNotification.ts', 'packages/billing/src/api/invoiceNotificationRoutes.ts', 'packages/invoicing/src/reminders/reminderJob.ts'],
    tests: ['packages/billing/src/notifications/validateInvoiceNotification.test.ts', 'packages/billing/src/notifications/sendInvoiceNotification.test.ts'],
  },
  {
    id: 'order-total-rounding',
    request: 'The order total is off by a cent when discounts apply. Fix `calculateOrderTotal` so it rounds once.',
    targets: ['packages/orders/src/pricing/calculateOrderTotal.ts'],
    consumers: ['packages/orders/src/checkout/checkoutSummary.ts', 'packages/gateway/src/orders/orderTotalProxy.ts'],
    tests: ['packages/orders/src/pricing/calculateOrderTotal.test.ts'],
  },
  {
    id: 'stack-trace-session-expiry',
    request: 'Users get logged out early. Error: session expired\n    at refreshToken (packages/auth/src/session/refreshToken.ts:7:15)\n    at handler (packages/auth/src/session/session.routes.ts:4:3)',
    targets: ['packages/auth/src/session/refreshToken.ts'],
    consumers: [],
    tests: [],
  },
  {
    id: 'shipment-label-500',
    request: 'GET /shipments/:id/label returns a 500 when the carrier is missing. It should be a 400 with a clear message.',
    targets: ['packages/shipping/src/label/createShipmentLabel.ts', 'packages/gateway/src/shipments/shipmentLabelRoute.ts'],
    consumers: [],
    tests: [],
  },
];
