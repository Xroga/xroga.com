// What a failed connected-app / MCP call means, in words the agent can act on.
//
// Every refusal or failure of plugin_search / plugin_read / plugin_act used to reach the model as the same sentence ("unavailable or
// interrupted"), so it could neither recover nor tell the user why. The server now names the fixed rule or error code (never any data);
// this table turns each one into the next step: search again, use the other tool, ask the user to reconnect, stop and say it is blocked
// by policy, retry once, or report that the outcome is uncertain. A definite refusal means the call never ran.

export type PluginFailureKind =
  | 'search_again'
  | 'use_action_tool'
  | 'already_done'
  | 'reconnect'
  | 'policy'
  | 'retry'
  | 'auth'
  | 'limit'
  | 'uncertain'
  | 'unknown';

export interface PluginFailureInput {
  status?: number;
  code?: string;
  reason?: string;
  /** The owner pressed Allow before this failure. */
  approved: boolean;
  /** The tool changes data (plugin_act), as opposed to reading. */
  change: boolean;
}

type Entry = { kind: PluginFailureKind; text: string; neverRan: boolean };

const SEARCH_AGAIN = 'It was refused before anything was sent. Run plugin_search (to read) or plugin_action_search (to change something) again for this task, then call the tool it returns.';
const TABLE: Record<string, Entry> = {
  BROWSER_PLUGIN_NOT_DISCOVERED: { kind: 'search_again', neverRan: true, text: 'This tool was not found by a search in this task. ' + SEARCH_AGAIN },
  COMPOSIO_TOOL_NOT_ALLOWED: { kind: 'search_again', neverRan: true, text: 'The provider did not list this tool in the current search session. ' + SEARCH_AGAIN },
  BUSINESS_ACTION_RISK_CHANGED: { kind: 'search_again', neverRan: true, text: 'The tool was re-classified since it was found. ' + SEARCH_AGAIN },
  BUSINESS_ACTION_TOOLKIT_CHANGED: { kind: 'search_again', neverRan: true, text: 'The tool no longer belongs to the app it was found in. ' + SEARCH_AGAIN },
  BUSINESS_ACTION_PLAN_CHANGED: { kind: 'search_again', neverRan: true, text: 'The prepared call changed after it was shown. ' + SEARCH_AGAIN },
  BUSINESS_ACTION_AUTHORITY_SCOPE_REQUIRED: { kind: 'search_again', neverRan: true, text: 'The approval expired or no longer matches. ' + SEARCH_AGAIN },
  BUSINESS_ACTION_APPROVAL_EXPIRED: { kind: 'search_again', neverRan: true, text: 'The approval expired before it was used. ' + SEARCH_AGAIN },
  BUSINESS_ACTION_CONFIRMATION_EXPIRED: { kind: 'search_again', neverRan: true, text: 'The approval expired before it was used. ' + SEARCH_AGAIN },
  BROWSER_PLUGIN_APPROVAL_ALREADY_USED: { kind: 'search_again', neverRan: true, text: 'That approval was already used. Ask for a new call; do not reuse it.' },
  COMPOSIO_ACTION_ACCOUNT_CHANGED: { kind: 'search_again', neverRan: true, text: 'The connected account changed after the call was prepared. ' + SEARCH_AGAIN },
  COMPOSIO_MUTATION_BLOCKED: { kind: 'use_action_tool', neverRan: true, text: 'This tool is not a read-only tool, so plugin_read cannot run it. If the task really needs it, find it with plugin_action_search and call it with plugin_act (the owner approves each change); otherwise choose a read tool.' },
  BROWSER_PLUGIN_USE_CHANGE_TOOLS: { kind: 'use_action_tool', neverRan: true, text: 'This tool changes data or runs something, so plugin_read cannot call it. Find it with plugin_action_search (describe what to run or create), then call it; the owner approves each call. Nothing was sent.' },
  BROWSER_PLUGIN_DISCOVERY_LIMIT: { kind: 'already_done', neverRan: true, text: 'This search was already made, or the search limit for this task is reached. Use the tools found earlier in this task instead of searching again.' },
  BROWSER_PLUGIN_READ_ALREADY_REQUESTED: { kind: 'already_done', neverRan: true, text: 'This exact read was already requested in this task. Use its earlier result; change the arguments only if a different read is needed.' },
  BROWSER_PLUGIN_ARGUMENT_LIMIT: { kind: 'already_done', neverRan: true, text: 'The arguments are larger than the allowed size. Send a smaller request.' },
  COMPOSIO_READ_ACCOUNT_UNAVAILABLE: { kind: 'reconnect', neverRan: true, text: 'This app is not connected, or its connection has lapsed. Call ask_user with kind "takeover" asking the user to connect or reconnect the app in Plugins, then search again.' },
  COMPOSIO_CUSTOM_MCP_ACCOUNT_DENIED: { kind: 'reconnect', neverRan: true, text: 'This custom MCP server has no usable connection. Call ask_user with kind "takeover" asking the user to connect it in Plugins, Custom, then search again.' },
  COMPOSIO_CUSTOM_MCP_NOT_PINNED: { kind: 'policy', neverRan: true, text: 'This custom MCP tool is not allowed to run: the owner has not pinned it. Tell the user it can be pinned in Plugins, Custom, Tools (read tools only). Do not retry.' },
  COMPOSIO_CUSTOM_MCP_PIN_REVOKED: { kind: 'policy', neverRan: true, text: 'This custom MCP tool is not allowed to run: its pin was revoked. Tell the user to review and pin it again in Plugins, Custom, Tools. Do not retry.' },
  COMPOSIO_CUSTOM_MCP_DEFINITION_CHANGED: { kind: 'policy', neverRan: true, text: 'The custom MCP server changed this tool since the owner pinned it, so it was blocked and the pin revoked. Tell the user to review the new definition and pin it again. Do not retry.' },
  COMPOSIO_CUSTOM_MCP_DEFINITION_UNAVAILABLE: { kind: 'retry', neverRan: true, text: 'The custom MCP server could not be reached to check the tool against its pin, so nothing ran. Retry once; if it fails again tell the user the server is unreachable.' },
  COMPOSIO_CUSTOM_MCP_EXECUTION_OFF: { kind: 'policy', neverRan: true, text: 'Running custom MCP tools is not switched on for this account. Tell the user; do not retry.' },
  COMPOSIO_CUSTOM_MCP_RISK_NOT_ALLOWED: { kind: 'policy', neverRan: true, text: 'Only tools that purely read can run from a custom MCP server in this release, and this tool looks like it changes data. Tell the user; do not retry.' },
  COMPOSIO_UPSTREAM_ERROR: { kind: 'retry', neverRan: false, text: 'The app\'s provider returned an error.' },
  UNTRUSTED_TOOL_REQUIRES_SANDBOX: { kind: 'policy', neverRan: true, text: 'This tool comes from an untrusted source and is not allowed to run. Tell the user; do not retry.' },
  SECRET_EGRESS_DENIED: { kind: 'policy', neverRan: true, text: 'The request contained what looks like a secret (a key, token or password), so it was blocked and nothing was sent. Remove it and ask the user to handle credentials themselves.' },
  UNSAFE_DESTINATION: { kind: 'policy', neverRan: true, text: 'The request pointed at an address that is not allowed (private or not HTTPS), so nothing was sent. Do not retry with that address.' },
  EXACT_AUTHORITY_REQUIRED: { kind: 'policy', neverRan: true, text: 'This needs the owner\'s exact approval, which was not given, so nothing ran.' },
  BROWSER_DATA_DENIED: { kind: 'policy', neverRan: true, text: 'The request contained what looks like a secret, so it was blocked and nothing was sent.' },
  BROWSER_PLUGIN_NOT_AVAILABLE: { kind: 'auth', neverRan: true, text: 'Connected apps are not available for this Xroga sign-in. Ask the user to check that they are signed in to Xroga in the extension.' },
  BROWSER_PLUGIN_DEVICE_REQUIRED: { kind: 'auth', neverRan: true, text: 'This Chrome is not signed in to Xroga. Ask the user to sign in from the extension panel.' },
  BROWSER_DEVICE_REVOKED: { kind: 'auth', neverRan: true, text: 'This Chrome was signed out of Xroga. Ask the user to sign in again from the extension panel.' },
  BROWSER_DEVICE_AUTH_REQUIRED: { kind: 'auth', neverRan: true, text: 'The Xroga sign-in expired. Ask the user to sign in again from the extension panel.' },
  BROWSER_PLUGIN_NOT_CONFIGURED: { kind: 'auth', neverRan: true, text: 'Connected apps are not set up on this Xroga deployment. Tell the user; continue in the browser if possible.' },
  BROWSER_RUN_LIMIT: { kind: 'limit', neverRan: true, text: 'Too many Xroga tasks are active for this account. Ask the user to stop or finish a paused task, then try again.' },
  BROWSER_ALLOWANCE_EXHAUSTED: { kind: 'limit', neverRan: true, text: 'The Xroga usage allowance is used up for now. Tell the user; progress is saved.' },
};

const RETRY_TEXT = 'Nothing is known to have run, so one retry is fine: call the same tool once more. If it fails again, tell the user which app failed and carry on in the browser if that can still finish the task.';

/**
 * The agent-facing message for a failed call, or undefined when nothing specific is known (the caller keeps its own wording).
 * `reason` (the fixed rule or error code the server names) wins over `code` (the HTTP-level code).
 */
export function pluginFailureMessage(input: PluginFailureInput): { kind: PluginFailureKind; text: string } | undefined {
  const entry = (input.reason && TABLE[input.reason]) || (input.code && TABLE[input.code]);
  if (entry) {
    // A provider error after the owner approved a change may or may not have changed anything: never offer a retry for it.
    if (entry.kind === 'retry' && input.approved && input.change) {
      return { kind: 'uncertain', text: `${entry.text} The approved change may or may not have been made. Do not repeat it. Check the result in the app and tell the user exactly what is uncertain.` };
    }
    if (entry.kind === 'retry' && !entry.neverRan) {
      return { kind: 'retry', text: input.approved
        ? `${entry.text} The read was approved but returned no result, so no data was changed; you may request the same read once more (the owner approves it again). If it fails again, tell the user.`
        : `${entry.text} ${RETRY_TEXT}` };
    }
    if (entry.kind === 'retry') return { kind: 'retry', text: entry.text };
    return { kind: entry.kind, text: entry.text };
  }
  if (input.status === 429) return { kind: 'limit', text: 'Xroga is rate limiting this task right now. Wait a moment, then try once more.' };
  if (input.status === 401 || input.status === 403) {
    return { kind: 'auth', text: 'Xroga refused this call for this sign-in. Ask the user to check they are signed in and that the app is connected.' };
  }
  return undefined;
}
