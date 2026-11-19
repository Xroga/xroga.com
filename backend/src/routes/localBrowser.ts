import { EgressDenied } from '../security/egress/egressPolicy.js';
import { createHash, randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { createCanonicalExecutionState, type ExecutableTaskNode } from '../ai/executionRuntime.js';
import { actualProviderCostMicroUsd } from '../ai/providerBudget.js';
import { resolveModelSpec } from '../ai/models.js';
import { DIRECT_READ_MAX_AGE_MS, isPlainOpenAndRead, namesSite } from './localBrowserDirectRead.js';
import { browserDeviceExtension, localBrowserAccountAllowed, type BrowserDeviceRequest } from './localBrowserDevice.js';
import { boundedPublicGet, publicHttpsUrl } from '../security/boundedPublicGet.js';
import { RepoRunError, runRepository } from '../sandbox/repoRun.js';
import { getUserPluginPermissionMode, type PluginPermissionMode } from '../services/integrations/pluginPermissionPolicy.js';
import { classifyOutboundData } from '../security/egress/dataClassification.js';
import { requireTenantContext } from '../security/tenantContext.js';
import { createPool } from '../storage/runtime.js';
import { BROWSER_RUN_DEFAULTS } from '../workers/browserCapability.js';
import { parseBrowserJob } from '../workers/browserJob.js';
import type { Lease, LeaseStore } from '../workers/leaseStore.js';
import { dispatchBrowserModel } from '../workers/browserModelDispatch.js';
import { isTerminalRunStatus, PostgresBrowserRunStore, type BrowserRunRecord, type BrowserRunStore } from '../workers/browserRunStore.js';
import { PostgresLeaseStore } from '../workers/postgresLeaseStore.js';
import { DocumentError, readBrowserDocument } from './browserDocuments.js';
import { createLocalBrowserPluginCatalog } from './localBrowserPlugins.js';
import { canUserAccessComposioToolkit, createComposioConnectionLink, executeComposioReadTool, getComposioToolDetails, listPinnedCustomReadTools, listPinnedCustomWriteTools, isComposioConfigured, searchComposioActionTools, searchComposioTools } from '../services/integrations/composioClient.js';
import type { XrogaConnectSearchResult } from '../services/integrations/composioClient.js';
import { cancelBusinessActionConfirmation, confirmBusinessAction } from '../services/integrations/businessActionConfirmations.js';
import { preparedActionDigest } from '../security/authority/digest.js';
import { isFinancialAction, prepareBusinessAction } from '../services/integrations/businessAction.js';
import { createBusinessActionConfirmation } from '../services/integrations/businessActionConfirmations.js';

const MODEL = 'deepseek_v4_1_flash_1017';
const MAX_TURNS = 400;
// A run is admitted in segments: when it reaches the end of one, `extend` grants the next, so a task is bounded by its outcome, not by a
// turn or time count. Money is bounded where it is spent: every model turn reserves and settles against the owner's canonical
// entitlement ledger, and a refused reservation stops the run with its progress saved (BROWSER_ALLOWANCE_EXHAUSTED).
const SEGMENT_TURNS = 96;
const TURN_CEILING_MICROS = 3_000;
const MINUTE = 60_000;
const SEGMENT_MS = 90 * MINUTE;
/** A run's wall-clock segment is renewed when less than this is left. */
const RENEW_BEFORE_MS = 10 * MINUTE;
const MAX_GOAL = 16_000;
// These bound the size of one run's saved state, not what a person may do: a long task makes many searches, reads and changes.
const MAX_PLUGIN_ACTIONS = 200;
const MAX_PLUGIN_DISCOVERIES = 100;
const MAX_PLUGIN_READS = 400;

/**
 * Whether a connected-app call runs without a card. Reading never needs one, and neither does a change that only touches the owner's own
 * data in their own connected app (create, update, run, add, draft...). A card is kept for what reaches other people or the public
 * (send, post, publish, invite, share, reply, forward, call, notify...). Destructive and financial calls are refused outright, before this.
 * An operator can turn automatic approval off for a deployment with XROGA_LOCAL_BROWSER_AUTO_APPROVE=off.
 */
const OUTBOUND_TOKENS = new Set(['SEND', 'POST', 'PUBLISH', 'TWEET', 'TWEETS', 'INVITE', 'SHARE', 'REPLY', 'FORWARD', 'CALL', 'NOTIFY', 'BROADCAST', 'SMS', 'DM', 'TEXT', 'EMAIL', 'EMAILS', 'MESSAGE', 'MESSAGES', 'COMMENT', 'ANNOUNCE', 'SCHEDULE', 'GRANT', 'PERMISSION', 'COLLABORATOR', 'TRANSFER', 'DISPATCH', 'DELIVER', 'TRIGGER', 'WEBHOOK', 'PUBLIC', 'SUBSCRIBE', 'MENTION', 'ASSIGN', 'INVOICE', 'PAYOUT', 'PAYMENT', 'SUBSCRIPTION', 'ORDER', 'CHARGE', 'REFUND', 'MERGE', 'DEPLOY', 'ATTENDEE', 'ATTENDEES', 'RECIPIENT', 'RECIPIENTS']);
/** Tool names that run code, queries or commands: a name with such a word is never a plain read, whatever else it says. */
const EXECUTES_TOKENS = new Set(['EXECUTE', 'EXEC', 'SQL', 'MUTATION', 'MUTATE', 'INVOKE', 'EVAL', 'SHELL', 'COMMAND', 'SCRIPT', 'RAW']);
/** Outbound words that a draft may carry without becoming a send: the draft stays on the owner's side. */
const DRAFT_SAFE_TOKENS = new Set(['EMAIL', 'EMAILS', 'MESSAGE', 'MESSAGES', 'TEXT', 'COMMENT']);
/** An outbound word in any form: SEND, SENDS, SENDING, SENT, POSTED, REPLIES, SHARING. */
function isOutboundToken(token: string): boolean {
  if (OUTBOUND_TOKENS.has(token) || token === 'SENT') return true;
  const stems = [token.replace(/(?:ING|ED|ES|S)$/, ''), token.replace(/IES$/, 'Y'), token.replace(/(?:ING|ED)$/, 'E'), token.replace(/ING$/, '')];
  return stems.some(stem => stem.length >= 2 && OUTBOUND_TOKENS.has(stem));
}
export function autoApprovesCall(kind: 'read' | 'change', slug: string, env: NodeJS.ProcessEnv = process.env, mode: PluginPermissionMode = 'low_risk'): boolean {
  if (env.XROGA_LOCAL_BROWSER_AUTO_APPROVE === 'off') return false;
  // The owner's own choice for the app wins: "always ask" asks for everything, and "read only" never lets a change through (it is refused
  // before this point). "Low risk" and "full access" run reads and changes inside the owner's own app; sending, publishing, deleting and
  // paying keep their card in every mode.
  if (mode === 'always_ask') return false;
  const tokens = slug.toUpperCase().split(/[^A-Z0-9]+/);
  if (tokens.some(token => EXECUTES_TOKENS.has(token)) && !/^MONID_/.test(slug.toUpperCase())) return false;
  if (kind === 'read') return true;
  // "Draft" and "create draft" stay on the owner's side; any outbound word makes it a card.
  const outbound = tokens.filter(isOutboundToken);
  return outbound.length === 0 || tokens.includes('DRAFT') && outbound.every(token => DRAFT_SAFE_TOKENS.has(token));
}
// The job is built for each model turn, so this bounds ONE request (a safety bound, many times its reservation), not the run.
const PER_TURN_JOB_COST_MICROS = 36_000;
const limits = { ...BROWSER_RUN_DEFAULTS, maxModelCostMicros: PER_TURN_JOB_COST_MICROS };
const id = z.string().uuid();
const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : undefined);

/** A tool's parameters as the model needs them: names, types, which are required, allowed values, a short description. */
export function compactSchema(schema: unknown): Record<string, unknown> | undefined {
  const s = schema as { properties?: Record<string, unknown>; required?: unknown } | null;
  if (!s || typeof s !== 'object' || !s.properties || typeof s.properties !== 'object') return undefined;
  const properties: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(s.properties).slice(0, 40)) {
    const d = (raw ?? {}) as { type?: unknown; description?: unknown; enum?: unknown; default?: unknown; items?: { type?: unknown } };
    const small = d.default !== undefined && JSON.stringify(d.default).length < 80;
    properties[name] = {
      ...(typeof d.type === 'string' || Array.isArray(d.type) ? { type: d.type } : {}),
      ...(clip(d.description, 180) ? { description: clip(d.description, 180) } : {}),
      ...(Array.isArray(d.enum) ? { enum: d.enum.slice(0, 12) } : {}),
      ...(small ? { default: d.default } : {}),
      ...(d.items && typeof d.items.type === 'string' ? { items: { type: d.items.type } } : {}),
    };
  }
  const required = Array.isArray(s.required) ? s.required.filter((name): name is string => typeof name === 'string').slice(0, 40) : [];
  return { type: 'object', properties, required };
}

const hasProperties = (schema: unknown) => !!schema && typeof schema === 'object' && !!(schema as { properties?: unknown }).properties && typeof (schema as { properties?: unknown }).properties === 'object';

/**
 * Search can return a reference instead of a full definition. A tool without a parameter list makes the model guess
 * argument names, so the full definition is fetched for it (bounded, in parallel); a failed lookup leaves the tool as it was.
 */
export async function withFullSchemas<T extends { slug: string; inputSchema?: Record<string, unknown> }>(
  tools: T[], details: ((slug: string, actor?: Parameters<typeof getComposioToolDetails>[1]) => Promise<{ inputSchema?: Record<string, unknown> }>) | undefined,
  actor: Parameters<typeof getComposioToolDetails>[1],
): Promise<T[]> {
  if (!details) return tools;
  return Promise.all(tools.map(async tool => {
    if (hasProperties(tool.inputSchema)) return tool;
    try {
      const full = await details(tool.slug, actor);
      return hasProperties(full.inputSchema) ? { ...tool, inputSchema: full.inputSchema } : tool;
    } catch {
      return tool;
    }
  }));
}

/** What the provider says about doing this task well: its plan, known pitfalls, notes, and which apps are connected. */
export function searchGuidance(result: Pick<XrogaConnectSearchResult, 'skill' | 'guidance' | 'toolkits'>) {
  const list = (items: unknown, count: number, max: number) =>
    (Array.isArray(items) ? items : []).map(item => clip(item, max)).filter((item): item is string => !!item).slice(0, count);
  const plan = list(result.skill?.recommendedPlanSteps, 8, 240);
  const pitfalls = list(result.skill?.knownPitfalls, 6, 240);
  const guidance = clip(result.guidance, 400);
  const apps = result.toolkits.slice(0, 6).map(app => ({ app: app.toolkit, connected: app.connected, ...(clip(app.statusMessage, 160) ? { note: clip(app.statusMessage, 160) } : {}) }));
  return { ...(plan.length ? { plan } : {}), ...(pitfalls.length ? { pitfalls } : {}), ...(guidance ? { guidance } : {}), ...(apps.length ? { apps } : {}) };
}

/**
 * Orders an owner's pinned tools by how well their names match the search words, so the few that fit (a stored discovery holds six)
 * are the ones about the task rather than the first six pinned.
 */
export function rankPinnedByQuery<T extends { slug: string }>(query: string, tools: T[]): T[] {
  const words = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 3))];
  const score = (slug: string) => words.filter(word => slug.toLowerCase().includes(word)).length;
  return tools.map((tool, index) => ({ tool, index, score: score(tool.slug) })).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.tool);
}

/**
 * The connected apps a request names ("create a page in Notion", "read my Google Sheets"). When it names one, the search is about that app
 * and only its tools are offered: tools of other connected apps do not crowd the answer, and the agent is not led to call them. A request
 * that names no connected app (a general data question) is not narrowed.
 */
export function namedToolkits(query: string, toolkits: Array<{ toolkit: string; name?: string; connected?: boolean; noAuth?: boolean }>): Set<string> {
  const flat = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const asked = flat(query);
  const found = new Set<string>();
  for (const item of toolkits) {
    if (!item.connected || item.noAuth) continue;
    const names = [item.toolkit, item.name ?? ''].map(flat).filter(name => name.length >= 4);
    if (names.some(name => asked.includes(name))) found.add(item.toolkit.toLowerCase());
  }
  return found;
}

/** Names of an owner's pinned change tools for a note to the agent (slugs only, never definitions). */
export function changeToolsNote(tools: Array<{ slug: string }>): string | undefined {
  if (!tools.length) return undefined;
  return `This account also has connected tools that change data or run things (${tools.slice(0, 10).map(tool => tool.slug).join(', ')}). They are not in this list: find them with plugin_action_search (describe what to run or create), then call them; the owner approves each call.`;
}

/** Parameter names (never values) of a discovered tool, kept so the agent's arguments can be checked before anything is approved. */
const toolArgs = z.object({ props: z.array(z.string().max(80)).max(80), required: z.array(z.string().max(80)).max(40) });
type ToolArgs = z.infer<typeof toolArgs>;
const pluginState = z.object({
  discoveries: z.array(z.object({
    query: z.string(), sessionId: z.string().optional(), tools: z.array(z.object({ slug: z.string(), toolkit: z.string(), args: toolArgs.optional() })).max(24),
  })).max(MAX_PLUGIN_DISCOVERIES),
  reads: z.array(z.object({
    digest: z.string(), slug: z.string(), toolkit: z.string(), approvalId: z.string().uuid().optional(), used: z.boolean(),
  })).max(MAX_PLUGIN_READS),
  /** Changes the agent asked to make through a connected app; each needs the user's approval on its own card. */
  actions: z.array(z.object({
    digest: z.string(), slug: z.string(), toolkit: z.string(), approvalId: z.string().uuid().optional(), used: z.boolean(),
  })).max(MAX_PLUGIN_ACTIONS).default([]),
  actionDiscoveries: z.array(z.object({
    query: z.string(), sessionId: z.string().optional(), tools: z.array(z.object({ slug: z.string(), toolkit: z.string(), args: toolArgs.optional() })).max(24),
  })).max(MAX_PLUGIN_DISCOVERIES).default([]),
});
function runPlugins(row: BrowserRunRecord) {
  return pluginState.parse(row.state.productManifest.localBrowserPlugins ?? { discoveries: [], reads: [], actions: [], actionDiscoveries: [] });
}
const startBody = z.object({
  goal: z.string().trim().min(1).max(MAX_GOAL),
  startUrl: z.string().max(2_048),
  attachmentCount: z.number().int().min(0).max(5).default(0),
}).strict();

function runAllowance(goal: string, attachmentCount: number) {
  const extended = attachmentCount > 0 || goal.length > 2_000;
  const configuredTurns = Number(process.env.XROGA_LOCAL_BROWSER_MAX_TURNS);
  const ceiling = Number.isInteger(configuredTurns) && configuredTurns >= 16
    ? Math.min(configuredTurns, MAX_TURNS) : MAX_TURNS;
  return { turns: Math.min(extended ? 200 : 96, ceiling), durationMs: (extended ? 180 : 90) * MINUTE };
}
const tool = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string().regex(/^[a-z_]{1,50}$/),
    description: z.string().max(6_000).optional(),
    parameters: z.record(z.string(), z.unknown()),
    strict: z.boolean().optional(),
  }).strict(),
}).strict();
const toolCall = z.object({
  id: z.string().max(200), type: z.literal('function'),
  function: z.object({ name: z.string().max(50), arguments: z.string().max(16_000) }).strict(),
}).strict();
const textPart = z.object({ type: z.literal('text'), text: z.string().max(48_000) }).strict();
// A page or file image from the user's own browser, as a PNG data URI. It is data, never an instruction, and only a model whose spec
// says it accepts images receives one (see vetTurnImages).
const imagePart = z.object({
  type: z.literal('image_url'),
  image_url: z.object({ url: z.string().max(1_800_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/), detail: z.enum(['low', 'high', 'auto']).optional() }).strict(),
}).strict();
const message = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([z.string().max(48_000), z.array(z.union([textPart, imagePart])).max(24), z.null()]).optional(),
  tool_calls: z.array(toolCall).max(20).optional(),
  tool_call_id: z.string().max(200).optional(),
}).strict();
const turnBody = z.object({
  turn: z.number().int().min(1),
  messages: z.array(message).min(1).max(140),
  tools: z.array(tool).max(64).optional(),
  tool_choice: z.enum(['auto', 'none', 'required']).optional(),
  max_tokens: z.number().int().min(1).max(4_096).optional(),
  vision_probe_png: z.string().min(32).max(24_000).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional(),
}).strict();
const endBody = z.object({
  status: z.enum(['completed', 'failed', 'cancelled']),
  result: z.string().max(12_000).optional(),
  actions: z.array(z.string().regex(/^[a-z_]{1,50}$/)).max(500).default([]),
  /** A read answered from the page by the extension itself, with no model turn (agent/direct-read.ts). See DIRECT_READ_ACTIONS. */
  direct: z.literal(true).optional(),
}).strict();
/**
 * The only actions a result without a model turn may report: opening a page and reading it. Nothing that changes anything can be
 * completed this way, so the rule that a completed result needs a model turn still covers every write, upload, download and app action.
 */
const DIRECT_READ_ACTIONS = new Set(['navigate', 'read']);
const DIRECT_READ_RESULT_MAX = 600;

type Runtime = { runs: BrowserRunStore; leases: LeaseStore };
let runtime: Runtime | undefined;
const configured = () => {
  if (process.env.XROGA_LOCAL_BROWSER_ENABLED !== 'true') return null;
  if (!runtime) {
    const pool = createPool();
    runtime = { runs: new PostgresBrowserRunStore(pool), leases: new PostgresLeaseStore(pool) };
  }
  return runtime;
};

class BrowserRequestError extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail?: Record<string, string[]>) { super(code); }
}

function summarizeToolArgs(schema: unknown): ToolArgs | undefined {
  const s = schema as { properties?: unknown; required?: unknown } | null;
  if (!s || typeof s !== 'object' || !s.properties || typeof s.properties !== 'object') return undefined;
  const props = Object.keys(s.properties as object).filter(name => name.length <= 80).slice(0, 80);
  const required = Array.isArray(s.required) ? s.required.filter((name): name is string => typeof name === 'string' && name.length <= 80).slice(0, 40) : [];
  return { props, required };
}
/** An argument the tool does not define, or a required one that is missing, is refused with the names involved; nothing is sent. */
function assertToolArguments(args: Record<string, unknown>, summary: ToolArgs | undefined) {
  if (!summary || !summary.props.length) return;
  const known = new Set(summary.props);
  const unknown = Object.keys(args).filter(name => !known.has(name)).slice(0, 12);
  const missing = summary.required.filter(name => args[name] === undefined || args[name] === null).slice(0, 12);
  if (unknown.length || missing.length) {
    throw new BrowserRequestError(422, 'BROWSER_PLUGIN_ARGUMENTS_INVALID', { unknown, missing, allowed: summary.props.slice(0, 40) });
  }
}

function checkData(value: unknown) {
  try {
    if (classifyOutboundData(value).classification !== 'CREDENTIAL_SECRET') return;
  } catch { /* unbounded or invalid payload */ }
  throw new BrowserRequestError(400, 'BROWSER_DATA_DENIED');
}

function sendError(res: Response, error: unknown) {
  if (error instanceof BrowserRequestError) return res.status(error.status).json({ error: error.code, ...(error.detail ?? {}) });
  if (error instanceof z.ZodError) {
    // Only where the request failed and why (field path and rule code), never a value: enough to find a limit or shape mismatch.
    const fields = error.issues.slice(0, 5).map(issue => `${issue.path.slice(0, 6).join('.')}:${issue.code}`);
    console.warn(`[local-browser] request invalid: ${fields.join(', ')}`);
    return res.status(400).json({ error: 'BROWSER_REQUEST_INVALID', fields });
  }
  // No user payload, raw provider error, or credential is returned. Only Xroga's own fixed business-action
  // codes are surfaced (and logged), so a failed approval is diagnosable without exposing anything private.
  const code = (error as { code?: unknown } | null)?.code;
  // The owner's entitlement ledger refused a model turn: nothing was charged, the run's progress is kept, and it can resume.
  if (code === 'PAID_PROVIDER_CAPACITY_UNAVAILABLE') {
    const next = (error as { nextUnlockAt?: unknown }).nextUnlockAt;
    return res.status(402).json({ error: 'BROWSER_ALLOWANCE_EXHAUSTED', ...(typeof next === 'string' ? { nextUnlockAt: next } : {}) });
  }
  // A security-policy refusal (secret in the data, unsafe address, untrusted tool...) says which fixed rule refused, never what was sent.
  if (error instanceof EgressDenied) return res.status(403).json({ error: 'BROWSER_POLICY_DENIED', reason: error.reason });
  if (typeof code === 'string' && /^(?:BUSINESS_ACTION|COMPOSIO)_[A-Z_]{2,60}$/.test(code)) {
    console.error('[local-browser] business action failed:', code);
    const providerMessage = (error as { providerMessage?: unknown }).providerMessage;
    return res.status(503).json({ error: 'BROWSER_GATEWAY_UNAVAILABLE', reason: code,
      ...(typeof providerMessage === 'string' ? { providerMessage: providerMessage.slice(0, 300) } : {}) });
  }
  // Nothing from the request or the provider is returned. The server log keeps the error's name, its fixed code and, only where the
  // staging diagnostic flag is set, the first characters of its message, so an unexplained 503 can be found.
  const failure = error as { name?: unknown; message?: unknown; status?: unknown } | null;
  console.error('[local-browser] request failed:', {
    name: typeof failure?.name === 'string' ? failure.name.slice(0, 60) : undefined,
    code: typeof code === 'string' ? code.slice(0, 60) : undefined,
    status: typeof failure?.status === 'number' ? failure.status : undefined,
    ...(process.env.XROGA_COMPOSIO_ERROR_DETAIL === '1' && typeof failure?.message === 'string'
      ? { message: failure.message.replace(/[\t\n\r ]+/g, ' ').slice(0, 160) } : {}),
  });
  return res.status(503).json({ error: 'BROWSER_GATEWAY_UNAVAILABLE' });
}

function publicStart(input: string) {
  try {
    const url = publicHttpsUrl(input);
    // Persist the target, never session-bearing query parameters or fragments.
    return url.origin + url.pathname;
  } catch {
    throw new BrowserRequestError(400, 'BROWSER_TARGET_DENIED');
  }
}

function browserTask(goal: string, durationMs: number): ExecutableTaskNode {
  return {
    id: 'browser-1', objective: goal, operationType: 'browser_automation', requiredCapabilities: ['browser_automation'],
    selectedRuntime: 'local_chrome', selectedProvider: 'zurelay', selectedModel: MODEL, requiredContextReferences: [],
    allowedFiles: [], expectedOutputSchema: {}, dependencies: [], riskLevel: 'medium', timeoutMs: durationMs,
    retryPolicy: { maximumAttempts: 1, initialBackoffMs: 0, maximumBackoffMs: 0 },
    budget: { maximumUsd: limits.maxModelCostMicros / 1_000_000 }, validationMethod: ['local_browser_receipt'],
    evidenceRequirements: ['local_browser_receipt'], fallbackRoutes: [], status: 'pending', attempts: 0, evidence: [],
  };
}

function localRecord(row: BrowserRunRecord | null, owner: string) {
  if (!row || row.tenantId !== owner || row.userId !== owner || row.projectKey !== `user:${owner}`
      || row.spec.executionTarget !== 'local_chrome' || row.state.tasks[0]?.selectedRuntime !== 'local_chrome') {
    throw new BrowserRequestError(404, 'BROWSER_RUN_NOT_FOUND');
  }
  return row;
}

function active(record: BrowserRunRecord) {
  if (record.cancelRequested || isTerminalRunStatus(record.status) || remainingMs(record) <= 0) {
    throw new BrowserRequestError(409, 'BROWSER_RUN_INACTIVE');
  }
}

function remainingMs(record: BrowserRunRecord) {
  return Date.parse(record.state.createdAt) + Number(record.state.productManifest.localBrowserDurationMs ?? 10 * MINUTE) - Date.now();
}

/**
 * How many local browser runs one account may have active at once (a parent run plus its parallel workers). Four by default; an operator
 * may provision more for a deployment (XROGA_LOCAL_BROWSER_MAX_ACTIVE_RUNS, 4 to 12). The extension is told the number and never starts
 * more workers than fit, so a worker is queued instead of refused.
 */
export function activeRunLimit(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.XROGA_LOCAL_BROWSER_MAX_ACTIVE_RUNS);
  return Number.isInteger(configured) && configured >= 4 && configured <= 24 ? configured : 13;
}

function allowance(record: BrowserRunRecord) {
  const turns = Number(record.state.productManifest.localBrowserTurn ?? 0);
  const maxTurns = Number(record.state.productManifest.localBrowserMaxTurns ?? 12);
  return { runId: record.runId, turns, maxTurns, remainingMs: Math.max(0, remainingMs(record)), activeRunLimit: activeRunLimit() };
}

const MAX_IMAGES_PER_TURN = 3;
const MAX_IMAGE_BYTES = 1_200_000;
const MAX_IMAGE_SIDE = 4_096;
const PNG_MAGIC = '89504e470d0a1a0a0000000d49484452';

/**
 * Checks the images of a turn before anything is forwarded to the model and returns the same messages with each image replaced by a
 * placeholder, for the secret check and the text-size cap. An image is accepted only when the model's spec supports images, is a real
 * PNG of a bounded size and dimensions, and there are at most three per turn.
 */
export function vetTurnImages(messages: Array<{ content?: unknown }>, supportsImages: boolean): { textOnly: unknown[]; images: number } {
  let images = 0;
  const textOnly = messages.map(message => {
    if (!Array.isArray(message.content)) return message;
    return { ...message, content: message.content.map((part: { type?: string; image_url?: { url: string } }) => {
      if (part.type !== 'image_url' || !part.image_url) return part;
      if (!supportsImages) throw new BrowserRequestError(400, 'BROWSER_IMAGES_NOT_SUPPORTED');
      images++;
      if (images > MAX_IMAGES_PER_TURN) throw new BrowserRequestError(400, 'BROWSER_IMAGES_TOO_MANY');
      const bytes = Buffer.from(part.image_url.url.slice(part.image_url.url.indexOf(',') + 1), 'base64');
      if (bytes.length < 33 || bytes.length > MAX_IMAGE_BYTES || bytes.subarray(0, 16).toString('hex') !== PNG_MAGIC ||
          ![bytes.readUInt32BE(16), bytes.readUInt32BE(20)].every(side => side > 0 && side <= MAX_IMAGE_SIDE)) {
        throw new BrowserRequestError(400, 'BROWSER_IMAGE_INVALID');
      }
      return { type: 'text', text: '[image]' };
    }) };
  });
  return { textOnly, images };
}

// The operator pins one sanitized test capture to one already admitted run.
// Ordinary browser turns cannot attach arbitrary pixel data or remote image URLs.
function visionProbe(runId: string, turn: number, encoded: string) {
  const bytes = Buffer.from(encoded, 'base64');
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (turn !== 1 || process.env.XROGA_LOCAL_BROWSER_VISION_PROBE !== `${runId}:${hash}` ||
      !resolveModelSpec(MODEL)?.supportsImages ||
      bytes.toString('base64') !== encoded || bytes.length < 33 ||
      bytes.subarray(0, 16).toString('hex') !== '89504e470d0a1a0a0000000d49484452' ||
      ![bytes.readUInt32BE(16), bytes.readUInt32BE(20)].every(side => side > 0 && side <= 768)) {
    throw new BrowserRequestError(400, 'BROWSER_VISION_PROBE_DENIED');
  }
  return { type: 'image_url', image_url: { url: `data:image/png;base64,${encoded}`, detail: 'low' } };
}

const defaultPlugins = {
  configured: isComposioConfigured,
  discover: searchComposioTools,
  prepare: executeComposioReadTool,
  confirm: confirmBusinessAction,
  cancel: cancelBusinessActionConfirmation,
  discoverActions: searchComposioActionTools,
  prepareAction: prepareBusinessAction,
  createActionConfirmation: createBusinessActionConfirmation,
  details: getComposioToolDetails,
  pinnedReads: listPinnedCustomReadTools,
  pinnedWrites: listPinnedCustomWriteTools,
  connectLink: createComposioConnectionLink,
};

type ActionMembers = 'discoverActions' | 'prepareAction' | 'createActionConfirmation' | 'details' | 'pinnedReads' | 'pinnedWrites' | 'connectLink';
/** The read members are required; the action members are optional so a test or a release can run without them. */
type PluginAdapter = Omit<typeof defaultPlugins, ActionMembers> & Partial<Pick<typeof defaultPlugins, ActionMembers>>;

/** How long a repository change check may run before it answers with what it has (the extension's call limit is 85 s). */
const REPO_CHANGE_BUDGET_MS = 70_000;

export function createLocalBrowserRouter(resolve = configured, dispatch = dispatchBrowserModel, plugins: PluginAdapter = defaultPlugins) {
  const actionPlugins = () => {
    if (!plugins.discoverActions || !plugins.prepareAction || !plugins.createActionConfirmation) {
      throw new BrowserRequestError(403, 'BROWSER_PLUGIN_ACTIONS_NOT_AVAILABLE');
    }
    return { discoverActions: plugins.discoverActions, prepareAction: plugins.prepareAction, createActionConfirmation: plugins.createActionConfirmation };
  };
  const router = Router();
  router.use('/plugins', createLocalBrowserPluginCatalog());
  const route = (handler: (req: BrowserDeviceRequest, res: Response, runtime: Runtime) => Promise<unknown>) =>
    async (req: BrowserDeviceRequest, res: Response) => {
      res.set('Cache-Control', 'no-store');
      try {
        const rt = resolve();
        if (!rt) throw new BrowserRequestError(503, 'LOCAL_BROWSER_DISABLED');
        if (!localBrowserAccountAllowed(requireTenantContext(req.tenantContext).userId)) {
          throw new BrowserRequestError(403, 'LOCAL_BROWSER_ACCOUNT_NOT_ENABLED');
        }
        return await handler(req, res, rt);
      } catch (error) { return sendError(res, error); }
    };

  router.post('/runs', route(async (req, res, { runs, leases }) => {
    const ctx = requireTenantContext(req.tenantContext);
    const data = startBody.parse(req.body);
    checkData(data);
    const startUrl = publicStart(data.startUrl);
    const lease = await leases.acquire({ tenantId: ctx.tenantId, runId: ctx.userId, taskId: 'local-chrome-admission' }, `chrome-api-${randomUUID()}`, 10_000);
    if (!lease) throw new BrowserRequestError(429, 'BROWSER_ADMISSION_BUSY');
    try {
      if (await runs.countActive(ctx.tenantId) >= activeRunLimit()) throw new BrowserRequestError(429, 'BROWSER_RUN_LIMIT');
      const admitted = runAllowance(data.goal, data.attachmentCount);
      const state = createCanonicalExecutionState({
        projectId: `user:${ctx.userId}`, requiredCapabilities: ['browser_automation'], tasks: [browserTask(data.goal, admitted.durationMs)],
      });
      state.productManifest.localBrowserMaxTurns = admitted.turns;
      state.productManifest.localBrowserDurationMs = admitted.durationMs;
      await runs.create({ tenantId: ctx.tenantId, userId: ctx.userId, state, spec: {
        executionTarget: 'local_chrome', goal: data.goal, startUrl, allowedOrigins: [new URL(startUrl).origin],
        limits, plan: null, driveProject: null,
      } });
      return res.status(201).json({ runId: state.runId, turns: 0, maxTurns: admitted.turns, remainingMs: admitted.durationMs, activeRunLimit: activeRunLimit(),
        ...(resolveModelSpec(MODEL)?.supportsImages ? { vision: true } : {}),
        ...(req.revalidateBrowserDevice && plugins.configured() ? { plugins: true } : {}) });
    } finally {
      await leases.release(lease).catch(() => undefined);
    }
  }));

  router.get('/session', route(async (req, res) => {
    const ctx = requireTenantContext(req.tenantContext);
    return res.json({ account: ctx.userId, deviceExtension: browserDeviceExtension() });
  }));

  router.post('/documents', route(async (req, res, { leases }) => {
    const ctx = requireTenantContext(req.tenantContext);
    const data = z.object({ name: z.string().max(200).regex(/\.(?:pdf|docx|xlsx)$/i),
      base64: z.string().max(34_952_536).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict().parse(req.body);
    const bytes = Buffer.from(data.base64, 'base64');
    if (bytes.length > 25 * 1024 * 1024 || bytes.toString('base64') !== data.base64) {
      throw new BrowserRequestError(400, 'BROWSER_DOCUMENT_INVALID');
    }
    const lease = await leases.acquire({ tenantId: ctx.tenantId, runId: ctx.userId, taskId: 'local-chrome-document' },
      `chrome-api-${randomUUID()}`, 30_000);
    if (!lease) throw new BrowserRequestError(429, 'BROWSER_DOCUMENT_BUSY');
    try {
      const text = await readBrowserDocument(data.name, bytes);
      return res.json({ text });
    } catch (error) {
      // An uppercase string code: the extension's error filter keeps only that form (never free text).
      return res.status(422).json({ error: 'BROWSER_DOCUMENT_UNREADABLE', reason: `DOC_${(error instanceof DocumentError ? error.reason : 'invalid').toUpperCase()}` });
    } finally {
      await leases.release(lease).catch(() => undefined);
    }
  }));

  router.get('/runs/:runId', route(async (req, res, { runs }) => {
    const ctx = requireTenantContext(req.tenantContext);
    const row = localRecord(await runs.load(ctx.userId, id.parse(req.params.runId)), ctx.userId);
    const task = row.state.tasks[0]!;
    const expired = !isTerminalRunStatus(row.status) && remainingMs(row) <= 0;
    return res.json({ ...allowance(row), status: expired ? 'interrupted' : row.status,
      cancelRequested: row.cancelRequested, result: task.output ?? null, evidence: task.evidence });
  }));

  router.delete('/runs/:runId', route(async (req, res, { runs }) => {
    const ctx = requireTenantContext(req.tenantContext);
    const row = localRecord(await runs.load(ctx.userId, id.parse(req.params.runId)), ctx.userId);
    return res.json({ outcome: await runs.requestCancel(ctx.userId, row.runId) });
  }));

  const withLease = (handler: (req: BrowserDeviceRequest, res: Response, rt: Runtime, record: BrowserRunRecord, lease: Lease) => Promise<unknown>) =>
    route(async (req, res, rt) => {
      const ctx = requireTenantContext(req.tenantContext);
      const runId = id.parse(req.params.runId);
      localRecord(await rt.runs.load(ctx.userId, runId), ctx.userId);
      const lease = await rt.leases.acquire({ tenantId: ctx.tenantId, runId, taskId: 'execute' }, `chrome-api-${randomUUID()}`, 100_000);
      if (!lease) throw new BrowserRequestError(409, 'BROWSER_RUN_BUSY');
      try {
        return await handler(req, res, rt, localRecord(await rt.runs.load(ctx.userId, runId), ctx.userId), lease);
      } finally {
        await rt.leases.release(lease).catch(() => undefined);
      }
    });

  const assertPluginRun = async (req: BrowserDeviceRequest, row: BrowserRunRecord) => {
    active(row);
    if (!req.revalidateBrowserDevice || !await req.revalidateBrowserDevice() || !plugins.configured()) {
      throw new BrowserRequestError(403, 'BROWSER_PLUGIN_NOT_AVAILABLE');
    }
    return requireTenantContext(req.tenantContext);
  };

  // A direct read of a public web address (an official free API, a documentation page, a data file) for the browser agent. Credential-free:
  // nothing of the user's is attached, the address must be public HTTPS (no private network, no ports, no embedded logins), the answer is
  // size- and time-bounded and returned as untrusted text. It reads only; a change to a service goes through its own authorised tool.
  router.post('/runs/:runId/public-get', withLease(async (req, res, _rt, row) => {
    active(row);
    if (!req.revalidateBrowserDevice || !await req.revalidateBrowserDevice()) throw new BrowserRequestError(403, 'BROWSER_DEVICE_REVOKED');
    requireTenantContext(req.tenantContext);
    const { url } = z.object({ url: z.string().trim().min(10).max(2_000) }).strict().parse(req.body);
    checkData(url);
    try { publicHttpsUrl(url); } catch { throw new BrowserRequestError(403, 'BROWSER_POLICY_DENIED', { reason: ['public_https_only'] }); }
    const got = await boundedPublicGet(url, { maxBytes: 400_000, timeoutMs: 15_000, maxRedirects: 3, allowHttpErrors: true, signal: AbortSignal.timeout(20_000) })
      .catch(() => { throw new BrowserRequestError(502, 'BROWSER_PUBLIC_GET_FAILED'); });
    const type = got.contentType.toLowerCase();
    if (!/^(?:text\/|application\/(?:json|xml|[a-z.+-]*\+(?:json|xml)|csv|javascript|x-ndjson))/.test(type)) {
      return res.json({ status: got.statusCode, contentType: got.contentType.slice(0, 80), finalUrl: got.finalUrl, body: '', note: 'Not a text or data response; open it in the browser instead.' });
    }
    const text = got.bytes.toString('utf8');
    return res.json({ status: got.statusCode, contentType: got.contentType.slice(0, 80), finalUrl: got.finalUrl,
      body: text.slice(0, 40_000), ...(text.length > 40_000 ? { truncated: true, totalChars: text.length } : {}) });
  }));

  // Runs a pinned public GitHub repository's code in the isolated sandbox worker (no network, no secrets, nothing kept) and returns the real
  // output and any files it wrote. The agent may add its own small script. Nothing here reaches the user's accounts or browser.
  router.post('/runs/:runId/repo-run', withLease(async (req, res, _rt, row) => {
    active(row);
    if (!req.revalidateBrowserDevice || !await req.revalidateBrowserDevice()) throw new BrowserRequestError(403, 'BROWSER_DEVICE_REVOKED');
    const tenant = requireTenantContext(req.tenantContext);
    const data = z.object({
      url: z.string().trim().min(10).max(300),
      ref: z.string().trim().max(200).optional(),
      command: z.enum(['python3', 'node', 'sh']),
      args: z.array(z.string().max(4_000)).max(40).default([]),
      files: z.array(z.object({ path: z.string().min(1).max(200), content: z.string().max(400_000) }).strict()).max(20).default([]),
      timeoutSeconds: z.number().int().min(5).max(300).optional(),
      dependencies: z.object({
        ecosystem: z.enum(['pip', 'npm']),
        packages: z.array(z.object({ name: z.string().min(1).max(120), version: z.string().min(1).max(40) }).strict()).min(1).max(40),
        acknowledgedLicences: z.array(z.string().max(120)).max(40).optional(),
      }).strict().optional(),
      repositories: z.array(z.object({ url: z.string().trim().min(10).max(300), ref: z.string().trim().max(200).optional(), directory: z.string().min(1).max(200) }).strict()).max(3).optional(),
      inspectSkill: z.string().max(200).optional(),
    }).strict().parse(req.body);
    checkData(data);
    try {
      const result = await runRepository({ url: data.url, ref: data.ref, command: data.command, args: data.args, files: data.files, timeoutMs: (data.timeoutSeconds ?? 120) * 1_000, owner: { userId: tenant.userId, runId: row.runId },
        dependencies: data.dependencies, repositories: data.repositories, inspectSkill: data.inspectSkill });
      return res.json({ ...result, stdout: result.stdout.slice(-20_000), stderr: result.stderr.slice(-8_000) });
    } catch (error) {
      // The extension keeps a reason only as a plain code string and a short provider message, so both are sent in that form.
      const known = error instanceof RepoRunError;
      console.error('[repo-run] failed:', known ? { code: error.code, message: error.message.slice(0, 200) } : { name: (error as Error)?.name, message: String((error as Error)?.message).slice(0, 200) });
      const status = known ? (error.code === 'SANDBOX_UNAVAILABLE' ? 503 : error.code.startsWith('REPO_') ? 422 : 400) : 502;
      return res.status(status).json({ error: 'BROWSER_REPO_RUN_FAILED', reason: known ? error.code : 'RUN_FAILED', providerMessage: known ? error.message.slice(0, 300) : 'The run did not complete.' });
    }
  }));

  // A change to a public GitHub repository at an exact version: the edits are applied through the change workflow's write policy, the project's own
  // tests run before and after in the isolated sandbox, and the result is a diff and a patch file the person can apply. Nothing is written to GitHub.
  router.post('/runs/:runId/repo-change', withLease(async (req, res, _rt, row) => {
    active(row);
    if (!req.revalidateBrowserDevice || !await req.revalidateBrowserDevice()) throw new BrowserRequestError(403, 'BROWSER_DEVICE_REVOKED');
    const tenant = requireTenantContext(req.tenantContext);
    const data = z.object({
      url: z.string().trim().min(10).max(300),
      ref: z.string().trim().max(200).optional(),
      edits: z.array(z.object({ path: z.string().min(1).max(300), find: z.string().max(100_000).optional(), replace: z.string().max(200_000) }).strict()).min(1).max(10),
    }).strict().parse(req.body);
    checkData(data);
    try {
      const [{ selectSandboxProvider }, { createWorkerExecutionPort }, { runPublicRepoChange }] = await Promise.all([
        import('../sandbox/sandboxProviders.js'), import('../sandbox/workerExecutionPort.js'), import('../existingSource/change/publicRepoChange.js'),
      ]);
      const selected = await selectSandboxProvider();
      if (!selected.runtime) throw new RepoRunError('SANDBOX_UNAVAILABLE', selected.availability.detail ?? 'No isolated execution worker is available.');
      const runtime = selected.runtime;
      const port = createWorkerExecutionPort({ runtime: async () => runtime, owner: async () => ({ userId: tenant.userId, runId: row.runId }) });
      // The caller (the extension) gives up on a request after 85 s and the service after 90 s, so the check stops at its own deadline and reports what it has.
      const deadline = AbortSignal.timeout(REPO_CHANGE_BUDGET_MS);
      const result = await runPublicRepoChange({ url: data.url, ref: data.ref, edits: data.edits, port, signal: deadline });
      const stoppedAtDeadline = deadline.aborted;
      const brief = (t: typeof result.baseline) => ({ status: t.status, summary: t.summary, durationMs: t.durationMs, stages: t.stages.map((s) => ({ id: s.id, exitCode: s.exitCode, durationMs: s.durationMs })), evidence: t.evidence.slice(0, 3_000) });
      const patch = result.diff;
      return res.json({
        repository: result.repository, commit: result.commit, verdict: stoppedAtDeadline && result.verdict === 'verified' ? 'unverified' : result.verdict,
        verdictReason: stoppedAtDeadline ? `Stopped at the ${REPO_CHANGE_BUDGET_MS / 1000} second limit, so the tests were not all run. ${result.verdictReason}` : result.verdictReason, files: result.files,
        baseline: brief(result.baseline), after: brief(result.after), diff: patch.slice(0, 60_000), diffTruncated: patch.length > 60_000,
        artifacts: patch ? [{ path: 'change.patch', contentBase64: Buffer.from(patch.slice(0, 400_000), 'utf8').toString('base64') }] : [],
      });
    } catch (error) {
      const known = error instanceof RepoRunError;
      console.error('[repo-change] failed:', known ? { code: error.code, message: error.message.slice(0, 200) } : { name: (error as Error)?.name, message: String((error as Error)?.message).slice(0, 200) });
      const status = known ? (error.code === 'SANDBOX_UNAVAILABLE' ? 503 : 422) : 502;
      return res.status(status).json({ error: 'BROWSER_REPO_RUN_FAILED', reason: known ? error.code : 'RUN_FAILED', providerMessage: known ? error.message.slice(0, 300) : 'The change could not be verified.' });
    }
  }));

  // An authorization link for an app the user has not connected yet. The person opens it and approves access with the app itself; Xroga never
  // sees their password and nothing is connected until the provider says so. The link belongs to this run's own search session.
  router.post('/runs/:runId/plugin-connect', withLease(async (req, res, _rt, row) => {
    const actor = await assertPluginRun(req, row);
    if (!plugins.connectLink) throw new BrowserRequestError(403, 'BROWSER_PLUGIN_NOT_AVAILABLE');
    const { toolkit } = z.object({ toolkit: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/) }).strict().parse(req.body);
    if (!canUserAccessComposioToolkit(actor.userId, toolkit)) throw new BrowserRequestError(404, 'BROWSER_PLUGIN_NOT_FOUND');
    const state = runPlugins(row);
    const read = [...state.discoveries].reverse().find(item => item.sessionId);
    const change = [...state.actionDiscoveries].reverse().find(item => item.sessionId);
    const session = read?.sessionId ?? change?.sessionId;
    if (!session) throw new BrowserRequestError(409, 'BROWSER_PLUGIN_SEARCH_FIRST');
    const frontend = (process.env.FRONTEND_URL?.trim() || 'https://xroga.com').replace(/\/$/, '');
    const link = await plugins.connectLink(actor.userId, { sessionId: session, toolkit,
      callbackUrl: `${frontend}/dashboard/integrations/connect/callback`, mode: read?.sessionId ? 'read' : 'action' }, actor);
    return res.json({ toolkit: link.toolkit, url: link.redirectUrl });
  }));

  router.post('/runs/:runId/plugin-search', withLease(async (req, res, { runs }, row, lease) => {
    const actor = await assertPluginRun(req, row);
    const { query } = z.object({ query: z.string().trim().min(2).max(120) }).strict().parse(req.body);
    checkData(query);
    const state = runPlugins(row);
    if (state.discoveries.length >= MAX_PLUGIN_DISCOVERIES || state.discoveries.some(item => item.query.toLowerCase() === query.toLowerCase())) {
      throw new BrowserRequestError(409, 'BROWSER_PLUGIN_DISCOVERY_LIMIT');
    }
    const discovery: typeof state.discoveries[number] = { query, tools: [] };
    state.discoveries.push(discovery);
    row.state.productManifest.localBrowserPlugins = state;
    const save = () => runs.stateStore(actor.userId, () => lease).save(row.state);
    await save();
    const result = await plugins.discover(actor.userId, { query }, actor);
    await assertPluginRun(req, localRecord(await runs.load(actor.userId, row.runId), actor.userId));
    const connected = new Set(result.toolkits.filter(item => item.connected && !item.noAuth).map(item => item.toolkit.toLowerCase()));
    // Owner-pinned custom MCP read tools (flag XROGA_CUSTOM_MCP_EXECUTION) join the catalogue tools; each was re-verified against the live definition.
    const pinned = plugins.pinnedReads ? await plugins.pinnedReads(actor).catch(() => []) : [];
    const focus = namedToolkits(query, result.toolkits);
    const catalogue = result.tools.filter(item => item.risk === 'read' && connected.has(item.toolkit.toLowerCase()) && (!focus.size || focus.has(item.toolkit.toLowerCase())));
    // An owner's pinned tools are few and are the ones they chose, so more of them are shown than catalogue matches (a connected service
    // with a discover / inspect / run / get-run set must show the whole set, not the six whose names happen to match the words).
    // Pinned tools whose names match what was asked for come first; then the connected apps' own tools; the rest of the pinned set comes last,
    // so a long pinned set (a marketplace's whole tool list) can never push another connected app's tools out of the answer.
    const wanted = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 3));
    const unlisted = pinned.filter(p => !catalogue.some(item => item.slug === p.slug));
    const matches = (slug: string) => [...wanted].some(word => slug.toLowerCase().includes(word));
    const tools = await withFullSchemas([...unlisted.filter(p => matches(p.slug)).slice(0, 10), ...catalogue].slice(0, 24), plugins.details, actor);
    // A pinned tool is the owner's consent to run that one tool; it is never pushed at the agent. It is mentioned only when the request names it.
    const writeNote = changeToolsNote((plugins.pinnedWrites ? await plugins.pinnedWrites(actor).catch(() => []) : []).filter(p => matches(p.slug)));
    discovery.sessionId = result.sessionId;
    discovery.tools = tools.map(({ slug, toolkit, inputSchema }) => ({ slug, toolkit, args: summarizeToolArgs(inputSchema) }));
    await save();
    const readGuidance = searchGuidance(result);
    return res.json({ tools: tools.map(item => ({ slug: item.slug, toolkit: item.toolkit,
      description: item.description?.slice(0, 400), parameters: compactSchema(item.inputSchema) ?? item.inputSchema })), ...readGuidance,
      ...(writeNote ? { guidance: [readGuidance.guidance, writeNote].filter(Boolean).join(' ') } : {}) });
  }));

  // Changes through a connected app. The browser agent names the tool and its arguments; the plan, its digest, the authority scope and
  // the confirmation are the platform's own (prepareBusinessAction with a fixed selection, then the durable confirmation), so a change
  // happens only after the user approves this exact action on its own card. Destructive and financial actions are not offered.
  router.post('/runs/:runId/plugin-action-search', withLease(async (req, res, { runs }, row, lease) => {
    const actor = await assertPluginRun(req, row);
    const { query } = z.object({ query: z.string().trim().min(2).max(120) }).strict().parse(req.body);
    checkData(query);
    const state = runPlugins(row);
    if (state.actionDiscoveries.length >= MAX_PLUGIN_DISCOVERIES || state.actionDiscoveries.some(item => item.query.toLowerCase() === query.toLowerCase())) {
      throw new BrowserRequestError(409, 'BROWSER_PLUGIN_DISCOVERY_LIMIT');
    }
    const discovery: typeof state.actionDiscoveries[number] = { query, tools: [] };
    state.actionDiscoveries.push(discovery);
    row.state.productManifest.localBrowserPlugins = state;
    const save = () => runs.stateStore(actor.userId, () => lease).save(row.state);
    await save();
    const result = await actionPlugins().discoverActions(actor.userId, { query }, actor);
    await assertPluginRun(req, localRecord(await runs.load(actor.userId, row.runId), actor.userId));
    const connected = new Set(result.toolkits.filter(item => item.connected && !item.noAuth).map(item => item.toolkit.toLowerCase()));
    // Owner-pinned custom MCP tools that change data (flag XROGA_CUSTOM_MCP_EXECUTION) join the catalogue tools; each was re-verified live.
    const pinnedWrites = plugins.pinnedWrites ? await plugins.pinnedWrites(actor).catch(() => []) : [];
    const focusWrites = namedToolkits(query, result.toolkits);
    const catalogueWrites = result.tools.filter(item => item.risk !== 'read' && item.risk !== 'destructive' && connected.has(item.toolkit.toLowerCase()) &&
      (!focusWrites.size || focusWrites.has(item.toolkit.toLowerCase())) && !isFinancialAction(query, item.slug));
    const tools = await withFullSchemas([...(focusWrites.size ? [] : rankPinnedByQuery(query, pinnedWrites.filter(p => !catalogueWrites.some(item => item.slug === p.slug) && !isFinancialAction(query, p.slug) &&
      query.toLowerCase().split(/[^a-z0-9]+/).some(word => word.length >= 3 && p.slug.toLowerCase().includes(word))))), ...catalogueWrites]
      .slice(0, 24), plugins.details, actor);
    discovery.sessionId = result.sessionId;
    discovery.tools = tools.map(({ slug, toolkit, inputSchema }) => ({ slug, toolkit, args: summarizeToolArgs(inputSchema) }));
    await save();
    return res.json({ tools: tools.map(item => ({ slug: item.slug, toolkit: item.toolkit, risk: item.risk,
      description: item.description?.slice(0, 400), parameters: compactSchema(item.inputSchema) ?? item.inputSchema })), ...searchGuidance(result) });
  }));

  router.post('/runs/:runId/plugin-act', withLease(async (req, res, { runs }, row, lease) => {
    const actor = await assertPluginRun(req, row);
    const data = z.object({
      slug: z.string().regex(/^[a-z0-9_-]{3,200}$/i),
      arguments: z.record(z.string(), z.unknown()),
      request: z.string().trim().min(2).max(200),
    }).strict().parse(req.body);
    checkData(data);
    if (Buffer.byteLength(JSON.stringify(data)) > 12_000) throw new BrowserRequestError(400, 'BROWSER_PLUGIN_ARGUMENT_LIMIT');
    const state = runPlugins(row);
    const source = [...state.actionDiscoveries].reverse().find(item => item.tools.some(tool => tool.slug === data.slug));
    const tool = source?.tools.find(tool => tool.slug === data.slug);
    if (!source?.sessionId || !tool) throw new BrowserRequestError(403, 'BROWSER_PLUGIN_NOT_DISCOVERED');
    assertToolArguments(data.arguments, tool.args);
    const digest = preparedActionDigest(data);
    if (state.actions.length >= MAX_PLUGIN_ACTIONS || state.actions.some(item => item.digest === digest)) {
      throw new BrowserRequestError(409, 'BROWSER_PLUGIN_ACTION_ALREADY_REQUESTED');
    }
    if (state.actions.some(item => item.approvalId && !item.used)) throw new BrowserRequestError(409, 'BROWSER_PLUGIN_APPROVAL_PENDING');
    // The owner's permission for this app: with "read only" a change is not made at all.
    const mode = await getUserPluginPermissionMode(actor.userId, tool.toolkit).catch((): PluginPermissionMode => 'always_ask');
    if (mode === 'read_only') throw new BrowserRequestError(403, 'BROWSER_POLICY_DENIED', { reason: ['read_only_permission'] });
    const action: typeof state.actions[number] = { digest, slug: data.slug, toolkit: tool.toolkit, used: false };
    state.actions.push(action);
    row.state.productManifest.localBrowserPlugins = state;
    const save = () => runs.stateStore(actor.userId, () => lease).save(row.state);
    await save();
    const outcome = await actionPlugins().prepareAction({
      userId: actor.userId, tenantContext: actor, useCase: source.query, forceConfirmation: true, signal: AbortSignal.timeout(45_000),
      fixedSelection: { toolSlug: data.slug, arguments: data.arguments, summary: `${data.request} (${tool.toolkit})` },
    });
    if (outcome.status !== 'ready' || outcome.plan.toolSlug !== data.slug || outcome.plan.toolkit.toLowerCase() !== tool.toolkit.toLowerCase() ||
        outcome.plan.risk === 'destructive' || isFinancialAction(source.query, data.slug)) {
      throw new BrowserRequestError(409, 'BROWSER_PLUGIN_ACTION_UNAVAILABLE');
    }
    const confirmation = await actionPlugins().createActionConfirmation(actor.userId, outcome.plan);
    if (!id.safeParse(confirmation.id).success || !confirmation.approval) {
      throw new BrowserRequestError(503, 'BROWSER_PLUGIN_APPROVAL_UNAVAILABLE');
    }
    try {
      await assertPluginRun(req, localRecord(await runs.load(actor.userId, row.runId), actor.userId));
      action.approvalId = confirmation.id;
      if (autoApprovesCall('change', data.slug, process.env, mode)) action.used = true;
      await save();
    } catch (error) {
      await plugins.cancel(actor.userId, confirmation.id).catch(() => undefined);
      throw error;
    }
    if (action.used) {
      // A change that stays in the owner's own connected app runs on its own, with the same confirmation, receipt and scope.
      let finished;
      try {
        finished = await plugins.confirm(actor, confirmation.id, { toolkit: action.toolkit.toLowerCase(), toolSlug: action.slug });
      } catch (error) {
        // The app refused or failed the call, so nothing was changed: forget it so the agent can correct the arguments and try again.
        const at = state.actions.indexOf(action);
        if (at >= 0) state.actions.splice(at, 1);
        row.state.productManifest.localBrowserPlugins = state;
        await save().catch(() => undefined);
        throw error;
      }
      const { confirmation: done, execution } = finished;
      const receipt = done.receipt;
      if (execution.toolSlug !== action.slug || !receipt) throw new BrowserRequestError(503, 'BROWSER_PLUGIN_RECEIPT_UNAVAILABLE');
      return res.json({ receiptId: receipt.id, result: execution.resultText.slice(0, 12_000) });
    }
    return res.json({ approval: { id: confirmation.id, summary: confirmation.summary, account: confirmation.approval.accountReference,
      argumentsPreview: confirmation.argumentsPreview, risk: outcome.plan.risk } });
  }));

  router.post('/runs/:runId/plugin-act-review', withLease(async (req, res, { runs }, row, lease) => {
    const actor = await assertPluginRun(req, row);
    const { approvalId, decision } = z.object({ approvalId: id, decision: z.enum(['approve', 'deny']) }).strict().parse(req.body);
    const state = runPlugins(row);
    const action = state.actions.find(item => item.approvalId === approvalId);
    if (!action || action.used) throw new BrowserRequestError(409, 'BROWSER_PLUGIN_APPROVAL_ALREADY_USED');
    action.used = true;
    row.state.productManifest.localBrowserPlugins = state;
    await runs.stateStore(actor.userId, () => lease).save(row.state);
    await assertPluginRun(req, localRecord(await runs.load(actor.userId, row.runId), actor.userId));
    if (decision === 'deny') {
      await plugins.cancel(actor.userId, approvalId);
      return res.json({ denied: true });
    }
    const { confirmation, execution } = await plugins.confirm(actor, approvalId, { toolkit: action.toolkit.toLowerCase(), toolSlug: action.slug });
    const receipt = confirmation.receipt;
    if (execution.toolSlug !== action.slug || !receipt) throw new BrowserRequestError(503, 'BROWSER_PLUGIN_RECEIPT_UNAVAILABLE');
    return res.json({ receiptId: receipt.id, result: execution.resultText.slice(0, 12_000) });
  }));

  router.post('/runs/:runId/plugin-read', withLease(async (req, res, { runs }, row, lease) => {
    const actor = await assertPluginRun(req, row);
    const data = z.object({ slug: z.string().regex(/^[a-z0-9_-]{3,200}$/i),
      arguments: z.record(z.string(), z.unknown()) }).strict().parse(req.body);
    checkData(data);
    if (Buffer.byteLength(JSON.stringify(data)) > 12_000) throw new BrowserRequestError(400, 'BROWSER_PLUGIN_ARGUMENT_LIMIT');
    const state = runPlugins(row);
    const source = [...state.discoveries].reverse().find(item => item.tools.some(tool => tool.slug === data.slug));
    const tool = source?.tools.find(tool => tool.slug === data.slug);
    const digest = preparedActionDigest(data);
    if (!source?.sessionId || !tool) {
      // A pinned tool that changes data is only found by the change search; say so instead of "not discovered".
      const changeTools = plugins.pinnedWrites ? await plugins.pinnedWrites(actor).catch(() => []) : [];
      if (changeTools.some(item => item.slug === data.slug)) throw new BrowserRequestError(409, 'BROWSER_PLUGIN_USE_CHANGE_TOOLS');
      throw new BrowserRequestError(403, 'BROWSER_PLUGIN_NOT_DISCOVERED');
    }
    assertToolArguments(data.arguments, tool.args);
    // The same read may be repeated (polling a run, re-reading after a change); only the size of the saved state is bounded.
    if (state.reads.length >= MAX_PLUGIN_READS) state.reads.splice(0, state.reads.length - MAX_PLUGIN_READS + 1);
    const read: typeof state.reads[number] = { digest, slug: data.slug, toolkit: tool.toolkit, used: false };
    state.reads.push(read);
    row.state.productManifest.localBrowserPlugins = state;
    const save = () => runs.stateStore(actor.userId, () => lease).save(row.state);
    await save();
    const result = await plugins.prepare(actor.userId, {
      sessionId: source.sessionId, useCase: source.query, toolSlug: data.slug, arguments: data.arguments,
      tenantContext: actor, signal: AbortSignal.timeout(45_000),
    });
    const approval = result.confirmation;
    if (!result.needsConfirmation || !approval || !id.safeParse(approval.id).success || !approval.approval) {
      throw new BrowserRequestError(503, 'BROWSER_PLUGIN_APPROVAL_UNAVAILABLE');
    }
    try {
      await assertPluginRun(req, localRecord(await runs.load(actor.userId, row.runId), actor.userId));
      read.approvalId = approval.id;
      if (autoApprovesCall('read', data.slug, process.env, await getUserPluginPermissionMode(actor.userId, tool.toolkit).catch((): PluginPermissionMode => 'always_ask'))) read.used = true;
      await save();
    } catch (error) {
      await plugins.cancel(actor.userId, approval.id).catch(() => undefined);
      throw error;
    }
    if (read.used) {
      // A read runs on its own: the same confirmation and receipt, recorded for the run, without asking the person.
      const { confirmation, execution } = await plugins.confirm(actor, approval.id, { toolkit: read.toolkit.toLowerCase(), toolSlug: read.slug });
      await assertPluginRun(req, localRecord(await runs.load(actor.userId, row.runId), actor.userId));
      const receipt = confirmation.receipt;
      if (execution.toolSlug !== read.slug || !receipt) throw new BrowserRequestError(503, 'BROWSER_PLUGIN_RECEIPT_UNAVAILABLE');
      return res.json({ receiptId: receipt.id, result: execution.resultText.slice(0, 12_000) });
    }
    return res.json({ approval: { id: approval.id, summary: approval.summary,
      account: approval.approval.accountReference, argumentsPreview: approval.argumentsPreview } });
  }));

  router.post('/runs/:runId/plugin-review', withLease(async (req, res, { runs }, row, lease) => {
    const actor = await assertPluginRun(req, row);
    const { approvalId, decision } = z.object({ approvalId: id, decision: z.enum(['approve', 'deny']) }).strict().parse(req.body);
    const state = runPlugins(row);
    const read = state.reads.find(item => item.approvalId === approvalId);
    if (!read || read.used) throw new BrowserRequestError(409, 'BROWSER_PLUGIN_APPROVAL_ALREADY_USED');
    read.used = true;
    row.state.productManifest.localBrowserPlugins = state;
    await runs.stateStore(actor.userId, () => lease).save(row.state);
    await assertPluginRun(req, localRecord(await runs.load(actor.userId, row.runId), actor.userId));
    if (decision === 'deny') {
      await plugins.cancel(actor.userId, approvalId);
      return res.json({ denied: true });
    }
    const { confirmation, execution } = await plugins.confirm(actor, approvalId, { toolkit: read.toolkit.toLowerCase(), toolSlug: read.slug });
    await assertPluginRun(req, localRecord(await runs.load(actor.userId, row.runId), actor.userId));
    const receipt = confirmation.receipt;
    if (execution.toolSlug !== read.slug || !receipt) throw new BrowserRequestError(503, 'BROWSER_PLUGIN_RECEIPT_UNAVAILABLE');
    return res.json({ receiptId: receipt.id, result: execution.resultText.slice(0, 12_000) });
  }));

  router.post('/runs/:runId/turn', withLease(async (req, res, rt, row, lease) => {
    active(row);
    const ctx = requireTenantContext(req.tenantContext);
    const { turn, vision_probe_png: probe, ...body } = turnBody.parse(req.body);
    const vetted = vetTurnImages(body.messages, !!resolveModelSpec(MODEL)?.supportsImages);
    checkData(vetted.textOnly);
    const image = probe ? visionProbe(row.runId, turn, probe) : undefined;
    const prompt = body.messages.at(-1);
    if (image && (!body.tools?.length || prompt?.role !== 'user' || !prompt.content || (body.max_tokens ?? 0) > 512)) {
      throw new BrowserRequestError(400, 'BROWSER_VISION_PROBE_DENIED');
    }
    const messages = image && prompt
      ? [...body.messages.slice(0, -1), { ...prompt, content: [
        ...(typeof prompt.content === 'string' ? [{ type: 'text', text: prompt.content }] : prompt.content ?? []), image,
      ] }]
      : body.messages;
    const maxTokens = image ? body.max_tokens ?? 512 : body.max_tokens ?? 2_048;
    // Images are bounded on their own (count, size and dimensions above); the text cap counts everything else.
    const requestBytes = Buffer.byteLength(JSON.stringify({ ...body, messages }).replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, 'data:image/png;base64,'));
    if (requestBytes > 96_000) throw new BrowserRequestError(400, 'BROWSER_CONTEXT_TOO_LARGE');
    const admitted = allowance(row);
    if (turn !== admitted.turns + 1) {
      throw new BrowserRequestError(409, 'BROWSER_TURN_REPLAY');
    }
    if (turn > admitted.maxTurns) throw new BrowserRequestError(409, 'BROWSER_TURN_LIMIT');
    // Charge the full per-turn ceiling until a settled provider receipt says otherwise.
    // A crash or unknown charge cannot restore the allowance by resuming a task.
    const priorSpend = Number(row.state.productManifest.localBrowserSpendMicros ?? admitted.turns * TURN_CEILING_MICROS);
    const task = row.state.tasks[0]!;
    task.status = 'running';
    task.startedAt ??= new Date().toISOString();
    task.attempts = 1;
    row.state.productManifest.localBrowserTurn = turn;
    row.state.productManifest.localBrowserSpendMicros = priorSpend + TURN_CEILING_MICROS;
    row.state.updatedAt = new Date().toISOString();
    await rt.runs.stateStore(ctx.userId, () => lease).save(row.state);

    const job = parseBrowserJob({ version: 1, userId: ctx.userId, tenantId: ctx.tenantId, projectId: row.projectKey,
      runId: row.runId, taskId: task.id, attempt: 1, startUrl: row.spec.startUrl, allowedOrigins: row.spec.allowedOrigins, limits });
    const revalidate = async () => {
      if (req.revalidateBrowserDevice && !await req.revalidateBrowserDevice()) {
        throw new BrowserRequestError(403, 'BROWSER_DEVICE_REVOKED');
      }
      await rt.leases.assertCurrent(lease);
      active(localRecord(await rt.runs.load(ctx.userId, row.runId), ctx.userId));
    };
    const abort = new AbortController();
    const disconnect = () => { if (!res.writableFinished) abort.abort(); };
    res.once('close', disconnect);
    const timer = setInterval(() => void revalidate().catch(() => abort.abort()), 1_000);
    const digest = createHash('sha256').update(`local-browser:${row.runId}:${turn}`).digest('hex');
    const started = performance.now();
    const timings: Record<string, number> = {};
    try {
      const result = await dispatch({ job, authority: { context: ctx, revalidate },
        modelId: MODEL, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(80_000)]),
        onTiming: (phase, elapsed) => { timings[phase] = Math.round(elapsed); },
        body: { ...body, messages, stream: false, reasoning_effort: 'none', max_tokens: maxTokens },
        estimatedInputTokens: Math.ceil(requestBytes / 3),
        maximumOutputTokens: maxTokens, platformCostCeiling: TURN_CEILING_MICROS,
        idempotencyKey: `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`,
      });
      const choice = result.choices?.[0];
      if (!choice?.message) throw new BrowserRequestError(502, 'BROWSER_MODEL_EMPTY');
      const settled = actualProviderCostMicroUsd({
        modelId: MODEL, inputTokens: result.usage.prompt_tokens, outputTokens: result.usage.completion_tokens,
        cachedInputTokens: result.usage.prompt_tokens_details?.cached_tokens,
        reasoningTokens: result.usage.completion_tokens_details?.reasoning_tokens,
      });
      await revalidate();
      row.state.productManifest.localBrowserSpendMicros = priorSpend + settled;
      await rt.runs.stateStore(ctx.userId, () => lease).save(row.state);
      console.info('[browser-turn]', { runId: row.runId, turn, timings, requestBytes,
        elapsedMs: Math.round(performance.now() - started), inputTokens: result.usage.prompt_tokens,
        cachedTokens: result.usage.prompt_tokens_details?.cached_tokens ?? 0, outputTokens: result.usage.completion_tokens,
        settledMicroUsd: settled });
      return res.json({ id: result.id, model: MODEL, choice: { finish_reason: choice.finish_reason,
        message: { content: choice.message.content, tool_calls: choice.message.tool_calls } }, usage: result.usage });
    } catch (error) {
      // The shared model gate was full and no provider call was made (nothing settled, nothing to retry on the provider's side). This is
      // a queue, not a failure: the turn's reserved spend is given back and the extension asks again after a short wait.
      const failure = error as { status?: unknown; code?: unknown; message?: unknown } | null;
      if (failure?.status === 429 || failure?.code === 'MODEL_PROVIDER_BUSY' || /temporarily busy/i.test(String(failure?.message ?? ''))) {
        row.state.productManifest.localBrowserSpendMicros = priorSpend;
        await rt.runs.stateStore(ctx.userId, () => lease).save(row.state).catch(() => undefined);
        res.setHeader('Retry-After', '3');
        throw new BrowserRequestError(429, 'BROWSER_MODEL_BUSY', { retryAfterMs: ['3000'] });
      }
      throw error;
    } finally {
      clearInterval(timer);
      res.off('close', disconnect);
    }
  }));

  // The next execution segment of the same run, under the same ownership, ledger and approvals. Turns are renewed near the end of the
  // current segment and time when less than ten minutes are left; nothing else changes. There is no total ceiling: the run ends when the
  // task is done, cancelled, or the owner's entitlement ledger refuses a turn. Never starts a second run.
  const grantSegment = async (runs: Runtime['runs'], row: BrowserRunRecord, lease: Lease) => {
    const before = allowance(row);
    const needTurns = before.turns >= before.maxTurns - 3;
    const needTime = before.remainingMs < RENEW_BEFORE_MS;
    if (!needTurns && !needTime) return { ...before, granted: 0 };
    const manifest = row.state.productManifest;
    if (needTurns) manifest.localBrowserMaxTurns = before.maxTurns + SEGMENT_TURNS;
    if (needTime) {
      // A fresh segment counts from now when the old one has already ended.
      const spent = Date.now() - Date.parse(row.state.createdAt);
      manifest.localBrowserDurationMs = Math.max(Number(manifest.localBrowserDurationMs ?? 10 * MINUTE), spent) + SEGMENT_MS;
    }
    row.state.updatedAt = new Date().toISOString();
    await runs.stateStore(row.userId, () => lease).save(row.state);
    const next = allowance(row);
    return { ...next, granted: next.maxTurns - before.maxTurns };
  };

  router.post('/runs/:runId/extend', withLease(async (_req, res, { runs }, row, lease) => {
    if (row.cancelRequested || isTerminalRunStatus(row.status)) throw new BrowserRequestError(409, 'BROWSER_RUN_INACTIVE');
    return res.json(await grantSegment(runs, row, lease));
  }));

  router.post('/runs/:runId/resume', withLease(async (req, res, { runs }, row, lease) => {
    // Resuming is the owner's own continuation of the same run: an ended segment is renewed, a cancelled or finished run is not.
    if (row.cancelRequested || isTerminalRunStatus(row.status)) throw new BrowserRequestError(409, 'BROWSER_RUN_INACTIVE');
    const next = await grantSegment(runs, row, lease);
    return res.json({ ...next, ...(resolveModelSpec(MODEL)?.supportsImages ? { vision: true } : {}), ...(req.revalidateBrowserDevice && plugins.configured() ? { plugins: true } : {}) });
  }));

  router.post('/runs/:runId/finish', withLease(async (req, res, { runs }, row, lease) => {
    const data = endBody.parse(req.body);
    checkData(data);
    if (isTerminalRunStatus(row.status)) return res.json({ status: row.status });
    if (data.status === 'completed') {
      active(row);
      // The flag alone proves nothing: the run's own recorded goal has to be a plain open-and-read request, the answer has to name the
      // site the run started on, the run has to be young and have no evidence yet, and only read actions may be reported.
      const task0 = row.state.tasks[0];
      const direct = data.direct === true && !row.state.productManifest.localBrowserTurn
        && data.actions.length > 0 && data.actions.every(action => DIRECT_READ_ACTIONS.has(action))
        && (data.result?.length ?? 0) <= DIRECT_READ_RESULT_MAX
        && isPlainOpenAndRead(String(row.spec.goal ?? ''))
        && namesSite(data.result ?? '', String(row.spec.startUrl ?? ''))
        && Date.now() - Date.parse(row.state.createdAt) <= DIRECT_READ_MAX_AGE_MS
        && !(task0?.evidence?.length);
      if (!data.actions.length || !data.result?.trim() || (!row.state.productManifest.localBrowserTurn && !direct)) {
        throw new BrowserRequestError(400, 'BROWSER_RESULT_UNVERIFIED');
      }
    }
    const task = row.state.tasks[0]!;
    task.status = row.cancelRequested ? 'cancelled' : data.status;
    task.completedAt = new Date().toISOString();
    row.state.updatedAt = task.completedAt;
    if (task.status === 'completed') task.output = { source: 'local_chrome', text: data.result ?? '' };
    task.evidence = data.actions.map(action => ({
      id: randomUUID(), kind: 'local_browser_receipt', summary: action, timestamp: task.completedAt!,
    }));
    await runs.stateStore(row.userId, () => lease).save(row.state);
    return res.json({ status: task.status });
  }));

  return router;
}

export default createLocalBrowserRouter();
