import { getWorkspaceExtensionStatus, isWorkspaceSender, WORKSPACE_URL } from './workspace';

const CONNECT = 'xroga.browser.connect.v1';
const STATUS = 'xroga.browser.paired.v1';
const CONNECTION = 'xroga.browser.connection.v1';
const PORT = 'xroga-browser-v1';
const PAIR_KEY = 'xroga-browser-account';
const PAIR_TAB_KEY = 'xroga-browser-workspace-tab';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

interface WorkspaceMessage {
  type?: string;
  nonce?: string;
  account?: string;
  id?: string;
  ok?: boolean;
  value?: unknown;
}

type Operation = 'start' | 'resume' | 'turn' | 'finish' | 'document' | 'voice';
type Pending = { succeed: (value: unknown) => void; fail: (error: Error) => void };
type PairFailure = 'sign-in' | 'unavailable' | 'extension-id' | 'account' | 'failed';
let pairing: { nonce: string; tabId: number; expires: number; started: number } | undefined;
let pairFailure: PairFailure | undefined;
let opening: Promise<void> | undefined;
let autoAttempted = false;
let pairTabId: number | undefined;
let workspace: chrome.runtime.Port | undefined;
const pending = new Map<string, Pending>();
const disconnectHandlers = new Set<() => void>();
export type WorkspaceTextFile = { name: string; text: string };
let taskHandler: ((goal: string, startUrl: string, files: WorkspaceTextFile[]) => Promise<void>) | undefined;
let cancelHandler: ((runId: string) => void) | undefined;
let controlHandler: ((type: 'pause-task' | 'resume-task', runId: string) => Promise<void>) | undefined;
let connectedHandler: (() => Promise<void>) | undefined;

export function workspacePaired() {
  return !!workspace;
}
export function onWorkspaceDisconnect(handler: () => void) {
  disconnectHandlers.add(handler);
  return () => disconnectHandlers.delete(handler);
}

function panelSender(sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  const url = new URL(sender.url);
  return (
    url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id && url.pathname === '/sidepanel.html'
  );
}

async function openPairing(manual: boolean) {
  if (workspace) return;
  if (!manual && autoAttempted) return;
  autoAttempted = true;
  if (opening) return opening;
  if (pairing && Date.now() < pairing.expires && pairFailure !== 'failed' && pairFailure !== 'unavailable') {
    if (manual && pairFailure === 'sign-in') await chrome.tabs.update(pairing.tabId, { active: true });
    else if (!pairFailure && Date.now() - pairing.started < 25_000) return;
  }
  opening = startPairing().finally(() => {
    opening = undefined;
  });
  return opening;
}

async function startPairing() {
  const nonce = crypto.randomUUID();
  const storedTab = pairTabId ?? (await chrome.storage.session.get(PAIR_TAB_KEY))[PAIR_TAB_KEY];
  const previous = typeof storedTab === 'number' ? await chrome.tabs.get(storedTab).catch(() => undefined) : undefined;
  // Only reuse a tab this extension opened, and only while it is still on Workspace.
  const tab =
    previous && isWorkspaceSender({ origin: new URL(WORKSPACE_URL).origin, url: previous.url, frameId: 0 })
      ? previous
      : await chrome.tabs.create({ url: 'about:blank', active: false });
  if (tab.id === undefined) throw new Error('Could not open Workspace.');
  pairTabId = tab.id;
  await chrome.storage.session.set({ [PAIR_TAB_KEY]: tab.id });
  const started = Date.now();
  pairing = { nonce, tabId: tab.id, started, expires: started + 5 * 60_000 };
  pairFailure = undefined;
  const url = new URL(WORKSPACE_URL);
  url.searchParams.set('browserExtension', chrome.runtime.id);
  url.searchParams.set('browserPair', nonce);
  try {
    await chrome.tabs.update(tab.id, { url: url.href });
  } catch (error) {
    if (pairing?.nonce === nonce) pairing = undefined;
    throw error;
  }
}

export function listenForWorkspace(
  start: (goal: string, startUrl: string, files: WorkspaceTextFile[]) => Promise<void>,
  cancel: (runId: string) => void,
  control: (type: 'pause-task' | 'resume-task', runId: string) => Promise<void>,
  connected: () => Promise<void>,
) {
  taskHandler = start;
  cancelHandler = cancel;
  controlHandler = control;
  connectedHandler = connected;
  chrome.tabs.onRemoved.addListener(tabId => {
    if (tabId === pairTabId) {
      pairTabId = undefined;
      void chrome.storage.session.remove(PAIR_TAB_KEY).catch(() => undefined);
    }
    if (tabId === pairing?.tabId) pairing = undefined;
  });
  chrome.runtime.onMessage.addListener(
    (message: { type?: string; name?: unknown; base64?: unknown; automatic?: boolean }, sender, reply) => {
      if (!panelSender(sender)) return;
      if (message?.type === STATUS) reply(workspacePaired());
      if (message?.type === CONNECTION) {
        const waiting = pairing && Date.now() - pairing.started < 25_000;
        reply({
          paired: workspacePaired(),
          connecting: !pairFailure && !!waiting,
          failure: pairFailure ?? (pairing && !waiting ? 'timeout' : undefined),
        });
      }
      if (
        message?.type === 'xroga.browser.voice.v1' &&
        typeof message.base64 === 'string' &&
        message.base64.length >= 684 &&
        message.base64.length <= 5_140_000 &&
        message.base64.startsWith('UklGR')
      ) {
        void workspaceRequest('voice', { body: message.base64 }).then(
          value => reply(value),
          () => reply(null),
        );
        return true;
      }
      if (
        message?.type === 'xroga.browser.document.v1' &&
        typeof message.name === 'string' &&
        /\.(?:pdf|docx|xlsx)$/i.test(message.name) &&
        typeof message.base64 === 'string' &&
        message.base64.length <= 2_796_204
      ) {
        void workspaceRequest('document', { body: { name: message.name, base64: message.base64 } }).then(
          value => reply(value),
          () => reply(null),
        );
        return true;
      }
      if (message?.type === CONNECT) {
        void openPairing(message.automatic !== true).then(
          () => reply(true),
          () => reply(false),
        );
        return true;
      }
      return;
    },
  );
  chrome.runtime.onMessageExternal.addListener((message: unknown, sender, reply) => {
    const status = getWorkspaceExtensionStatus(message, sender);
    if (status) reply({ ...status, paired: workspace?.sender?.tab?.id === sender.tab?.id && !!workspace });
    const failure = message as { type?: unknown; nonce?: unknown; reason?: unknown } | null;
    if (
      failure?.type === 'xroga.browser.pair-failed.v1' &&
      isWorkspaceSender(sender) &&
      pairing &&
      sender.tab?.id === pairing.tabId &&
      failure.nonce === pairing.nonce &&
      Date.now() < pairing.expires &&
      (failure.reason === 'sign-in' ||
        failure.reason === 'unavailable' ||
        failure.reason === 'extension-id' ||
        failure.reason === 'failed')
    ) {
      pairFailure = failure.reason;
      reply(true);
    }
  });
  chrome.runtime.onConnectExternal.addListener(port => {
    if (port.name !== PORT || !isWorkspaceSender(port.sender) || port.sender?.tab?.id !== pairing?.tabId) {
      port.disconnect();
      return;
    }
    let authorizing = false;
    const expires = setTimeout(() => {
      if (workspace !== port) port.disconnect();
    }, 15_000);
    port.onMessage.addListener(
      (message: WorkspaceMessage & { goal?: string; startUrl?: string; runId?: string; files?: unknown }) => {
        if (!message || typeof message !== 'object') return;
        if (workspace === port) {
          if (message.type === 'result' && typeof message.id === 'string') {
            const current = pending.get(message.id);
            if (!current) return;
            if (message.ok === true) current.succeed(message.value);
            else current.fail(new Error('Workspace rejected the browser request.'));
          }
          if (
            message.type === 'start-task' &&
            typeof message.goal === 'string' &&
            message.goal.trim() &&
            message.goal.length <= 16_000 &&
            (message.startUrl === undefined ||
              (typeof message.startUrl === 'string' && message.startUrl.length <= 2_048))
          ) {
            const files = message.files ?? [];
            if (
              !Array.isArray(files) ||
              files.length > 5 ||
              !files.every(
                file =>
                  file &&
                  typeof file === 'object' &&
                  typeof file.name === 'string' &&
                  file.name.length <= 200 &&
                  typeof file.text === 'string' &&
                  file.text.length > 0 &&
                  new TextEncoder().encode(file.text).byteLength <= 2 * 1024 * 1024,
              )
            ) {
              postWorkspace({ type: 'task-error' });
              return;
            }
            void taskHandler?.(message.goal.trim(), message.startUrl ?? '', files).catch(() =>
              postWorkspace({ type: 'task-error' }),
            );
          }
          if (message.type === 'cancel-task' && typeof message.runId === 'string' && UUID.test(message.runId)) {
            cancelHandler?.(message.runId);
          }
          if (
            (message.type === 'pause-task' || message.type === 'resume-task') &&
            typeof message.runId === 'string' &&
            UUID.test(message.runId)
          ) {
            const runId = message.runId;
            void controlHandler?.(message.type, runId).catch(() =>
              postWorkspace({ type: 'resume-unavailable', runId }),
            );
          }
          return;
        }
        const challenge = pairing;
        if (
          authorizing ||
          workspace ||
          message.type !== 'pair' ||
          !challenge ||
          Date.now() >= challenge.expires ||
          message.nonce !== challenge.nonce ||
          !message.account ||
          !UUID.test(message.account)
        ) {
          port.disconnect();
          return;
        }
        authorizing = true;
        pairing = undefined;
        const account = message.account;
        void (async () => {
          const stored = (await chrome.storage.local.get(PAIR_KEY))[PAIR_KEY];
          if (stored && stored !== account) {
            pairFailure = 'account';
            port.postMessage({ type: 'pair-rejected', status: 'account' });
            port.disconnect();
            return;
          }
          await chrome.storage.local.set({ [PAIR_KEY]: account });
          // Send first. A tab closed during storage I/O must never become the current port.
          port.postMessage({ type: 'paired' });
          workspace = port;
          autoAttempted = false;
          pairFailure = undefined;
          clearTimeout(expires);
          void connectedHandler?.().catch(() => undefined);
        })().catch(() => {
          pairFailure = 'failed';
          try {
            port.disconnect();
          } catch {
            /* already closed */
          }
        });
      },
    );
    port.onDisconnect.addListener(() => {
      clearTimeout(expires);
      if (workspace !== port) return;
      workspace = undefined;
      for (const request of pending.values()) request.fail(new Error('Workspace disconnected.'));
      for (const handler of disconnectHandlers) handler();
    });
  });
}

export function postWorkspace(value: Record<string, unknown>) {
  try {
    workspace?.postMessage(value);
  } catch {
    /* the disconnect listener stops pending work */
  }
}

export function workspaceRequest(op: Operation, value: unknown, signal?: AbortSignal): Promise<unknown> {
  const port = workspace;
  if (!port) return Promise.reject(new Error('Connect the Xroga Workspace first.'));
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => stop(), 85_000);
    const cleanup = () => {
      clearTimeout(timer);
      pending.delete(id);
      signal?.removeEventListener('abort', stop);
    };
    const stop = () => {
      cleanup();
      try {
        port.postMessage({ type: 'abort', id });
      } catch {
        /* already closed */
      }
      reject(new Error('Browser request stopped or timed out.'));
    };
    pending.set(id, {
      succeed: result => {
        cleanup();
        resolve(result);
      },
      fail: error => {
        cleanup();
        reject(error);
      },
    });
    if (signal?.aborted) return stop();
    signal?.addEventListener('abort', stop, { once: true });
    try {
      port.postMessage({ type: 'request', id, op, value });
    } catch {
      stop();
    }
  });
}
