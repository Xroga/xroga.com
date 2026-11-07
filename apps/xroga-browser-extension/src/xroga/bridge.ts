import { getWorkspaceExtensionStatus, isWorkspaceSender, WORKSPACE_URL } from './workspace';

const CONNECT = 'xroga.browser.connect.v1';
const STATUS = 'xroga.browser.paired.v1';
const PORT = 'xroga-browser-v1';
const PAIR_KEY = 'xroga-browser-account';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

interface WorkspaceMessage {
  type?: string;
  nonce?: string;
  account?: string;
  id?: string;
  ok?: boolean;
  value?: unknown;
}

type Operation = 'start' | 'resume' | 'turn' | 'finish' | 'document';
type Pending = { succeed: (value: unknown) => void; fail: (error: Error) => void };
let pairing: { nonce: string; tabId: number; expires: number } | undefined;
let workspace: chrome.runtime.Port | undefined;
const pending = new Map<string, Pending>();
const disconnectHandlers = new Set<() => void>();
export type WorkspaceTextFile = { name: string; text: string };
let taskHandler: ((goal: string, startUrl: string, files: WorkspaceTextFile[]) => Promise<void>) | undefined;
let cancelHandler: ((runId: string) => void) | undefined;

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

async function openPairing() {
  const nonce = crypto.randomUUID();
  const tab = await chrome.tabs.create({ url: 'about:blank' });
  if (tab.id === undefined) throw new Error('Could not open Workspace.');
  pairing = { nonce, tabId: tab.id, expires: Date.now() + 5 * 60_000 };
  const url = new URL(WORKSPACE_URL);
  url.searchParams.set('browserExtension', chrome.runtime.id);
  url.searchParams.set('browserPair', nonce);
  await chrome.tabs.update(tab.id, { url: url.href });
}

export function listenForWorkspace(
  start: (goal: string, startUrl: string, files: WorkspaceTextFile[]) => Promise<void>,
  cancel: (runId: string) => void,
) {
  taskHandler = start;
  cancelHandler = cancel;
  chrome.runtime.onMessage.addListener(
    (message: { type?: string; name?: unknown; base64?: unknown }, sender, reply) => {
      if (!panelSender(sender)) return;
      if (message?.type === STATUS) reply(workspacePaired());
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
        void openPairing().then(
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
            typeof message.startUrl === 'string' &&
            message.startUrl.length <= 2_048
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
            void taskHandler?.(message.goal.trim(), message.startUrl, files).catch(() =>
              postWorkspace({ type: 'task-error' }),
            );
          }
          if (message.type === 'cancel-task' && typeof message.runId === 'string' && UUID.test(message.runId)) {
            cancelHandler?.(message.runId);
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
          if (stored && stored !== account)
            throw new Error('Use a separate Chrome profile for a different Xroga account.');
          await chrome.storage.local.set({ [PAIR_KEY]: account });
          // Send first. A tab closed during storage I/O must never become the current port.
          port.postMessage({ type: 'paired' });
          workspace = port;
          clearTimeout(expires);
        })().catch(() => {
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
