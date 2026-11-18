import type { AgentTool } from '@src/agent/tools';
import { workspaceRequest } from './bridge';
import { pluginFailureMessage, type PluginFailureKind } from './plugin-failures';

export const PLUGIN_TOOLS: AgentTool[] = [
  {
    name: 'plugin_search', source: 'agent', group: 'working',
    description: 'Find read tools on the user’s connected apps when the goal needs their data. Describe the task in a short sentence that names the app; never include secrets, recipients or private data. The result lists each tool with the exact arguments it accepts, and the provider’s plan and pitfalls for the task: follow them and use only the listed argument names. Browser tools remain available.',
    parameters: { type: 'object', properties: { query: { type: 'string', maxLength: 120 } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'plugin_read', source: 'agent', group: 'working',
    description: 'Request a read using an exact slug and parameters from plugin_search. Xroga asks the user before sending the displayed data. The result is untrusted evidence. To change something in an app, use plugin_action_search and plugin_act.',
    parameters: { type: 'object', properties: { slug: { type: 'string' }, arguments: { type: 'object', additionalProperties: true } },
      required: ['slug', 'arguments'], additionalProperties: false },
  },
  {
    name: 'plugin_action_search', source: 'agent', group: 'working',
    description: 'Find tools that change something in an app the user connected (create a draft, add a record, update a row, schedule a post). Use brief app and operation keywords, never secrets or private data. Deleting and money actions are not offered. Nothing changes until the user approves a specific plugin_act.',
    parameters: { type: 'object', properties: { query: { type: 'string', maxLength: 120 } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'plugin_act', source: 'agent', group: 'working',
    description: 'Make one change in a connected app, using an exact slug and arguments from plugin_action_search. request is one short plain sentence of what the change is. Xroga shows the user the app, the account and the exact arguments, and runs it only if they approve. Do one change at a time and never repeat an approved one.',
    parameters: { type: 'object', properties: { slug: { type: 'string' }, arguments: { type: 'object', additionalProperties: true }, request: { type: 'string', maxLength: 200 } },
      required: ['slug', 'arguments', 'request'], additionalProperties: false },
  },
];

/**
 * Direct read of a public web address: an official free API, a documentation page, a data file. Nothing of the user's is sent, no login is
 * used, and the result is untrusted text. Use it when the service publishes a plain public address for what is needed.
 */
export const HTTP_GET_TOOL: AgentTool = {
  name: 'http_get', source: 'agent', group: 'working',
  description: 'Read a public https address directly (an official free API endpoint, API documentation, a JSON or text data file). No login, no credentials, no private networks. Returns the status, content type and the text (long answers are cut). Use this when a service publishes a free public API for what is needed: check its documentation first if you are unsure of the address, then call the exact endpoint. It only reads; changes to a service need its own connected tool.',
  parameters: { type: 'object', properties: { url: { type: 'string', maxLength: 2000 } }, required: ['url'], additionalProperties: false },
};

async function runPublicGetNow(runId: string, input: unknown, signal: AbortSignal, wrap: (text: string, source: string) => string): Promise<{ text: string; isError: boolean }> {
  try {
    const value = await workspaceRequest('public-get', { runId, body: input }, signal) as
      { status?: number; contentType?: string; finalUrl?: string; body?: string; truncated?: boolean; totalChars?: number; note?: string };
    const head = `HTTP ${value.status ?? '?'} ${value.contentType ?? ''} ${value.finalUrl ?? ''}${value.truncated ? ` (cut: ${value.totalChars} characters in total)` : ''}${value.note ? '\n' + value.note : ''}`;
    const failed = typeof value.status === 'number' && value.status >= 400;
    return { text: head + '\n' + wrap(String(value.body ?? ''), 'public web address'), isError: failed };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 'BROWSER_POLICY_DENIED') return { text: 'That address is not allowed: only public https addresses without ports or logins can be read directly. Use the browser for anything else.', isError: true };
    if (code === 'BROWSER_PUBLIC_GET_FAILED') return { text: 'The address did not answer in time or could not be reached. Check the address in the service documentation, or open it in the browser.', isError: true };
    return { text: 'The direct read could not be completed. Try the browser for this address.', isError: true };
  }
}

/**
 * An authorization link for an app the user has not connected: open it in a tab, ask the person to approve access there (they sign in
 * themselves; Xroga never types a password), then search for the app's tools again.
 */
export const PLUGIN_CONNECT_TOOL: AgentTool = {
  name: 'plugin_connect', source: 'agent', group: 'working',
  description: 'Get a Xroga authorization link for an app the user has not connected yet (the app name as the provider spells it, for example gmail or googlesheets). Search for the app first with plugin_search. Open the link in a tab, then ask the user (ask_user, kind "takeover") to sign in and approve access; passwords and codes are theirs to type. Afterwards search for the app again and continue the task. If the app cannot be connected this way, use the browser with the user\u2019s own signed-in session.',
  parameters: { type: 'object', properties: { toolkit: { type: 'string', maxLength: 80 } }, required: ['toolkit'], additionalProperties: false },
};

async function runPluginConnectNow(runId: string, input: unknown, signal: AbortSignal): Promise<{ text: string; isError: boolean }> {
  try {
    const value = await workspaceRequest('plugin-connect', { runId, body: input }, signal) as { toolkit?: string; url?: string };
    if (typeof value?.url !== 'string' || !/^https:\/\//.test(value.url)) throw new Error('no link');
    return { text: `Authorization link for ${value.toolkit ?? 'the app'}: ${value.url}\nOpen it in a tab, then ask the user to sign in and approve access (ask_user, kind "takeover"). When they are done, search for the app again.`, isError: false };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 'BROWSER_PLUGIN_SEARCH_FIRST') return { text: 'Run plugin_search for this app first, then ask for the link again.', isError: true };
    return { text: 'No authorization link could be made for this app. Use the browser with the user\u2019s own signed-in session, or ask the user to connect it under Plugins.', isError: true };
  }
}

/**
 * Runs code from a public GitHub repository, at an exact version, in an isolated Xroga sandbox: no network, no secrets, nothing kept.
 * It cannot install packages or fetch data. Use it for repositories whose code works offline (their own modules and the standard library),
 * usually with a short script you write that imports them. The result is the real output and any files written to xroga-out/.
 */
export const REPO_RUN_TOOL: AgentTool = {
  name: 'run_repository', source: 'agent', group: 'working',
  description: 'Run code from a public GitHub repository in an isolated sandbox: it is fetched at an exact commit, your command runs inside it (python3, node or sh), and you get the real stdout, stderr and any files written to xroga-out/. The sandbox has no internet, no secrets and installs nothing, so it works for a repository\u2019s own code and the standard library. You may add small files of your own (for example a script that imports the repository). Read the repository first (README, entry points) so the command is right. Do not use it for anything that needs the network or extra packages.',
  parameters: { type: 'object', properties: {
    url: { type: 'string', maxLength: 300 }, ref: { type: 'string', maxLength: 200 },
    command: { type: 'string', enum: ['python3', 'node', 'sh'] }, args: { type: 'array', items: { type: 'string', maxLength: 4000 }, maxItems: 40 },
    files: { type: 'array', maxItems: 20, items: { type: 'object', properties: { path: { type: 'string', maxLength: 200 }, content: { type: 'string', maxLength: 400000 } }, required: ['path', 'content'], additionalProperties: false } },
    timeoutSeconds: { type: 'integer', minimum: 5, maximum: 300 },
  }, required: ['url', 'command'], additionalProperties: false },
};

export async function runRepositoryTool(runId: string, input: unknown, signal: AbortSignal, wrap: (text: string, source: string) => string): Promise<{ text: string; isError: boolean }> {
  try {
    const v = await workspaceRequest('repo-run', { runId, body: input }, signal) as {
      repository?: string; commit?: string; filesSent?: number; omittedFiles?: number; exitCode?: number | null; stdout?: string; stderr?: string;
      timedOut?: boolean; durationMs?: number; artifacts?: Array<{ path: string; contentBase64: string }>; runtime?: string };
    const files = (v.artifacts ?? []).map(file => {
      let body = '';
      try { body = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(file.contentBase64), c => c.charCodeAt(0))); } catch { body = '(binary file)'; }
      return `--- ${file.path} ---\n${body.slice(0, 20_000)}`;
    });
    const head = `repository ${v.repository}@${(v.commit ?? '').slice(0, 12)} · ${v.filesSent} files sent (${v.omittedFiles ?? 0} skipped) · exit ${v.exitCode ?? 'none'}${v.timedOut ? ' · TIMED OUT' : ''} · ${v.durationMs} ms · isolated sandbox, no network`;
    const text = [head, 'stdout:', v.stdout ?? '', 'stderr:', v.stderr ?? '', ...(files.length ? ['files written:', ...files] : [])].join('\n');
    return { text: head + '\n' + wrap(text, 'repository execution output'), isError: v.exitCode !== 0 || !!v.timedOut };
  } catch (error) {
    const failure = error as { code?: unknown; detail?: Record<string, string[]> };
    const reason = failure?.detail?.providerMessage?.[0] ?? failure?.detail?.reason?.[0];
    if (failure?.code === 'BROWSER_REPO_RUN_FAILED') return { text: `The repository could not be run: ${reason ?? 'unknown reason'}. Do not repeat the same call; change the command or use another method.`, isError: true };
    return { text: 'The isolated sandbox is not available right now. Use another method for this part of the task.', isError: true };
  }
}

type Approval = { id: string; summary: string; account: string; argumentsPreview?: string; risk?: string };
type PluginToolName = 'plugin_search' | 'plugin_read' | 'plugin_action_search' | 'plugin_act';

/** A tool a search found, ready to be offered to the model under its own name. */
export type AppToolInfo = { slug: string; toolkit: string; description: string; parameters: Record<string, unknown>; kind: 'read' | 'write' };

const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const clipText = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The tools of a search result: only well-formed entries with a name the model can call. */
export function appToolsFrom(tools: unknown, kind: 'read' | 'write'): AppToolInfo[] {
  if (!Array.isArray(tools)) return [];
  const out: AppToolInfo[] = [];
  for (const raw of tools.slice(0, 12)) {
    const tool = raw as { slug?: unknown; toolkit?: unknown; description?: unknown; parameters?: unknown } | null;
    if (!tool || typeof tool.slug !== 'string' || !TOOL_NAME.test(tool.slug) || typeof tool.toolkit !== 'string') continue;
    const schema = tool.parameters as { properties?: unknown; required?: unknown } | null;
    const properties = schema && typeof schema === 'object' && schema.properties && typeof schema.properties === 'object' ? schema.properties as Record<string, unknown> : {};
    const required = Array.isArray(schema?.required) ? (schema!.required as unknown[]).filter((n): n is string => typeof n === 'string' && n in properties) : [];
    out.push({ slug: tool.slug, toolkit: clipText(tool.toolkit, 60), description: clipText(tool.description, 300), kind,
      parameters: { type: 'object', properties, ...(required.length ? { required } : {}) } });
  }
  return out;
}

/**
 * The name the model calls a found tool by. The Xroga server accepts only lowercase letters and underscores, 50 at most, for a tool in a
 * model request; Composio slugs are upper case and can hold digits and be longer (GMAIL_FETCH_EMAILS), and offering one under its own
 * name made every following model request fail as BROWSER_REQUEST_INVALID. The call is still routed by the real slug.
 */
export function appToolAlias(slug: string, taken: ReadonlySet<string>): string | undefined {
  const base = slug.toLowerCase().replace(/[^a-z_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 46) || 'app_tool';
  if (!taken.has(base)) return base;
  for (const suffix of 'abcdefghijklmnopqrstuvwxyz') {
    const next = `${base}_${suffix}`;
    if (!taken.has(next)) return next;
  }
  return undefined;
}

/** The model-facing tool: a valid alias of its Composio name and its real parameter schema, so native tool calling does the work. */
export function nativeAppTool(info: AppToolInfo, taken: ReadonlySet<string>): AgentTool | undefined {
  const name = appToolAlias(info.slug, taken);
  if (!name) return undefined;
  const note = info.kind === 'read' ? 'Reads data; the user approves what is sent.' : 'Changes data; the user approves each change.';
  return { name, source: 'agent', group: 'working', parameters: info.parameters,
    description: (info.description ? info.description + ' ' : '') + '[' + info.toolkit + ', connected app. ' + note + ']' };
}

/** A call to a native app tool goes through the same guarded read or change route as plugin_read / plugin_act. */
export function nativeAppCall(info: AppToolInfo, input: unknown): { name: PluginToolName; body: unknown } {
  const args = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  if (info.kind === 'read') return { name: 'plugin_read', body: { slug: info.slug, arguments: args } };
  const what = clipText(info.description.split(/[.!?]/)[0], 150) || info.slug;
  return { name: 'plugin_act', body: { slug: info.slug, arguments: args, request: clipText(info.toolkit + ': ' + what, 200) } };
}

/**
 * When a search finds no tool and an app the task needs is not connected, what the model should do: ask the user to connect it, then search
 * again. The handover is the existing ask_user takeover, so the run pauses where it is and continues when the user presses Done; nothing
 * is restarted. App names are plain labels from discovery and are shown only if they look like one.
 */
export function missingConnectionNote(apps: unknown, name: PluginToolName): string | null {
  if (!Array.isArray(apps)) return null;
  const missing = apps
    .filter((app): app is { app: string; connected: boolean } => !!app && typeof app === 'object' && (app as { connected?: unknown }).connected === false && typeof (app as { app?: unknown }).app === 'string')
    .map(app => app.app.trim())
    .filter(label => /^[\w .+-]{1,60}$/.test(label))
    .slice(0, 3);
  if (!missing.length) return null;
  const list = missing.join(', ');
  return `No usable tool was found because ${list} ${missing.length > 1 ? 'are' : 'is'} not connected to this Xroga account. If the task needs ${missing.length > 1 ? 'them' : 'it'}, call ask_user with kind "takeover" and a short message such as "Connect ${missing[0]} in Xroga (Plugins), then press Done." When the user is done, call ${name} again with the same description and continue from where you were; do not start over. Do not try to sign in to the app in the browser unless the task can only be done there.`;
}

async function runPluginToolNow(
  name: PluginToolName,
  runId: string,
  input: unknown,
  signal: AbortSignal,
  approve: (approval: Approval) => Promise<unknown>,
  wrap: (text: string, source: string) => string,
): Promise<{ text: string; isError: boolean; result?: { pluginReceiptId: string }; appTools?: AppToolInfo[]; failureKind?: PluginFailureKind }> {
  let sentReview = false;
  const change = name === 'plugin_act';
  try {
    if (name === 'plugin_search' || name === 'plugin_action_search') {
      const value = await workspaceRequest(name === 'plugin_search' ? 'plugin-search' : 'plugin-action-search', { runId, body: input }, signal) as
        { tools: unknown[]; apps?: unknown; plan?: unknown; pitfalls?: unknown; guidance?: unknown };
      // The provider's own advice for the task comes first, so a long tool list is what gets cut, not the advice.
      const brief = { apps: value.apps, plan: value.plan, pitfalls: value.pitfalls, guidance: value.guidance, tools: value.tools,
        note: 'Each tool above is now available to call directly by its own name with the listed arguments.' };
      return { text: value.tools.length ? wrap(JSON.stringify(brief).slice(0, 14_000), 'connected app tool metadata')
        : missingConnectionNote(value.apps, name) ?? (name === 'plugin_search' ? 'No matching connected app read tools. Continue with the browser where appropriate.'
          : 'No matching connected app tools that make changes. Continue with the browser where appropriate.'), isError: false,
        appTools: appToolsFrom(value.tools, name === 'plugin_search' ? 'read' : 'write') };
    }
    const pending = await workspaceRequest(change ? 'plugin-act' : 'plugin-read', { runId, body: input }, signal) as { approval?: Approval; receiptId?: string; result?: string };
    // The server ran a read, or a change inside the owner's own app, without a card: the result and receipt come back directly.
    if (!pending.approval && typeof pending.receiptId === 'string' && typeof pending.result === 'string') {
      if (!/^[a-z0-9_-]{1,128}$/i.test(pending.receiptId)) throw new Error('Plugin receipt could not be verified.');
      return { text: 'Provider receipt ' + pending.receiptId + '\n' + wrap(pending.result, 'connected app result'), isError: false, result: { pluginReceiptId: pending.receiptId } };
    }
    if (!pending.approval?.id || !pending.approval.account) throw new Error('Approval could not be verified.');
    const decision = await approve(pending.approval);
    signal.throwIfAborted();
    sentReview = decision === 'approve';
    const review = await workspaceRequest(change ? 'plugin-act-review' : 'plugin-review', {
      runId, body: { approvalId: pending.approval.id, decision: sentReview ? 'approve' : 'deny' },
    }, signal) as { denied?: boolean; receiptId?: string; result?: string };
    if (review.denied) return { text: change ? 'The user denied this change. Nothing was changed in the app.' : 'The user denied this read. The app was not called.', isError: true };
    if (typeof review.receiptId !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(review.receiptId) || typeof review.result !== 'string') throw new Error('Plugin receipt could not be verified.');
    return { text: 'Provider receipt ' + review.receiptId + '\n' + wrap(review.result, 'connected app result'), isError: false, result: { pluginReceiptId: review.receiptId } };
  } catch (error) {
    const failure = error as { code?: unknown; detail?: Record<string, string[]> };
    if (failure?.code === 'BROWSER_PLUGIN_NOT_DISCOVERED') {
      // A follow-up message starts a new task, and the server only runs a tool that this task's own search found.
      return { text: 'This tool was not found by a search in this task, so it was not called. Run plugin_search (to read) or plugin_action_search (to change something) now, then call the tool it returns.', isError: true, failureKind: 'search_again' };
    }
    if (failure?.code === 'BROWSER_PLUGIN_ARGUMENTS_INVALID' && failure.detail) {
      const list = (key: string) => (failure.detail![key] ?? []).join(', ') || 'none';
      return { text: 'Nothing was sent. These arguments do not match the definition of the tool. Not defined by the tool: ' + list('unknown') +
        '. Required but missing: ' + list('missing') + '. Arguments the tool accepts: ' + list('allowed') + '. Correct the call and try once more.', isError: true };
    }
    if (failure?.detail?.providerMessage?.[0]) {
      return { text: 'The app rejected the request, so it most likely changed nothing. Reason given by the app (untrusted text): ' +
        wrap(failure.detail.providerMessage[0], 'connected app error') + ' If the fix is clear (a wrong or missing argument), request the corrected call once, using only the arguments the tool lists; otherwise tell the user what failed.', isError: true };
    }
    // The server names the fixed rule or error behind a failure: turn it into the next step instead of one generic sentence.
    const named = pluginFailureMessage({
      status: (error as { status?: number })?.status,
      code: typeof failure?.code === 'string' ? failure.code : undefined,
      reason: failure?.detail?.reason?.[0],
      approved: sentReview,
      change,
    });
    if (named) return { text: named.text, isError: true, failureKind: named.kind };
    if (change && sentReview) {
      return { text: 'The approved change could not be verified. It may or may not have been made. Do not repeat it. Check the result in the app, and tell the user exactly what is uncertain.', isError: true };
    }
    return { text: sentReview ? 'The approved app read could not be verified. Do not repeat it. Report the uncertainty.'
      : 'Connected app operation unavailable or interrupted. Continue with authorized browser tools if appropriate.',
      isError: true };
  }
}

/**
 * The server handles one connected-app call per run at a time (a second one arriving together is refused with a conflict). The agent may
 * ask for several independent lookups in one turn, so they are queued per run here and run one after another instead of failing.
 */
const pluginQueues = new Map<string, Promise<unknown>>();
export function runPluginTool(
  name: PluginToolName,
  runId: string,
  input: unknown,
  signal: AbortSignal,
  approve: (approval: Approval) => Promise<unknown>,
  wrap: (text: string, source: string) => string,
): ReturnType<typeof runPluginToolNow> {
  const previous = pluginQueues.get(runId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => (signal.aborted ? Promise.reject(signal.reason) : runPluginToolNow(name, runId, input, signal, approve, wrap)));
  pluginQueues.set(runId, next);
  void next.catch(() => undefined).finally(() => { if (pluginQueues.get(runId) === next) pluginQueues.delete(runId); });
  return next;
}

/** Direct reads share the per-run queue with connected-app calls: the server takes one call per run at a time. */
export function runPublicGet(runId: string, input: unknown, signal: AbortSignal, wrap: (text: string, source: string) => string): Promise<{ text: string; isError: boolean }> {
  const previous = pluginQueues.get(runId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => (signal.aborted ? Promise.reject(signal.reason) : runPublicGetNow(runId, input, signal, wrap)));
  pluginQueues.set(runId, next);
  void next.catch(() => undefined).finally(() => { if (pluginQueues.get(runId) === next) pluginQueues.delete(runId); });
  return next;
}

export function runPluginConnect(runId: string, input: unknown, signal: AbortSignal): Promise<{ text: string; isError: boolean }> {
  const previous = pluginQueues.get(runId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => (signal.aborted ? Promise.reject(signal.reason) : runPluginConnectNow(runId, input, signal)));
  pluginQueues.set(runId, next);
  void next.catch(() => undefined).finally(() => { if (pluginQueues.get(runId) === next) pluginQueues.delete(runId); });
  return next;
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'then', 'app', 'apps', 'tool', 'tools', 'using', 'create', 'new', 'get', 'all']);

/**
 * The tools of a search that fit the task, best first, at most `limit`. The provider returns up to 24 tools from every connected app, and
 * the model should see only the ones that fit what it is doing (the words of its search plus the request), not every pinned or connected
 * app and not only an app the user named literally. A tool scores by the words its toolkit, name and description share with the intent;
 * with no match at all only the first three of the provider's order are kept. Slugs are never changed.
 */
export function rankAppTools(found: AppToolInfo[], intent: string, limit = 12): AppToolInfo[] {
  const words = [...new Set(intent.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w)))];
  if (!words.length) return found.slice(0, limit);
  const score = (t: AppToolInfo) => {
    const slug = t.slug.toLowerCase().split(/[^a-z0-9]+/), desc = t.description.toLowerCase(), kit = t.toolkit.toLowerCase();
    return words.reduce((n, w) => n + (kit.includes(w) || w.includes(kit) ? 4 : 0) + (slug.some(p => p === w || p === w + 's' || p + 's' === w) ? 3 : 0) + (desc.includes(w) ? 1 : 0), 0);
  };
  const ranked = found.map((t, i) => ({ t, i, n: score(t) })).sort((a, b) => b.n - a.n || a.i - b.i);
  const hits = ranked.filter(r => r.n > 0);
  // Nothing fits the words (the asked app is not connected, so the provider returned other apps' tools): offer only a few, not a dozen.
  return (hits.length ? hits.slice(0, limit) : ranked.slice(0, 3)).map(r => r.t);
}
