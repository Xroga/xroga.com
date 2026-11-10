// The page border and the agent pointer: while a run works, a soft glow around each page of its conversation tells the
// user where the agent acts, and a small Xroga pointer stays on the page the whole time: at the last verified action
// point, with a short factual status ("Waiting for response", "Typing"). The worker puts one small function into the top
// frame of those pages; it draws one element the layer does not see (on <html>, no pointer events, inert, hidden from
// accessibility, its content in a closed shadow root). Both go away when the run stops working, fade out for the model's
// screenshots and come straight back, and can be turned off in Settings. The pointer is an indicator of the agent's
// work in this page, not control of the operating system's mouse.
import { DEFAULT_SETTINGS, settingsStorage } from '@src/store/settings';
import type { RunStatus } from '@src/store/types';

export type BorderState = 'on' | 'hidden' | 'off';

/** What the pointer shows: where the agent last acted (only verified coordinates) and a short factual status. */
export type PointerKind = 'click' | 'type' | 'scroll' | 'navigation' | 'tab';
export interface PointerCommand {
  x?: number;
  y?: number;
  kind?: PointerKind;
  label?: string;
}

export interface BorderPorts {
  /** The conversation a tab belongs to, if any. */
  conversationOf(tabId: number): Promise<string | null>;
  /** A conversation's tabs. */
  tabsOf(conversationId: string): Promise<number[]>;
  /** Every tab that belongs to a conversation. */
  scopedTabs(): Promise<number[]>;
  /** The Settings switch. */
  enabled(): Promise<boolean>;
  /** Runs `setBorder(state, pointer)` in the tab's top frame, or in one document of it; resolves when it has. */
  inject(tabId: number, state: BorderState, documentId?: string, pointer?: PointerCommand): Promise<void>;
  /**
   * A page that cannot show the overlay (a blank tab, an error page, a browser page) is marked on the toolbar button instead, so
   * the user still sees which tab Xroga works in. `true` while the task works there, `false` to clear it.
   */
  unreachable?(tabId: number, working: boolean): Promise<void>;
}

/** How long a screenshot waits for the border to fade out; past it, the capture goes ahead. */
export const HIDE_WAIT_MS = 300;

export const NEUTRAL_LABEL = 'Working in this tab';
const KIND_LABEL: Record<PointerKind, string> = {
  click: 'Clicking',
  type: 'Typing',
  scroll: 'Scrolling',
  navigation: 'Page opened',
  tab: 'Task tab',
};

/** The status shown for a tool the run is executing: derived from the real tool, never invented. */
export function toolLabel(tool: string): string {
  if (/click|press|hover|select|drag/.test(tool)) return 'Clicking';
  if (/fill|type|keyboard/.test(tool)) return 'Typing';
  if (/scroll/.test(tool)) return 'Scrolling';
  if (/navigate|goto|open/.test(tool)) return 'Opening page';
  if (/tabs/.test(tool)) return 'Switching tabs';
  if (/screenshot/.test(tool)) return 'Capturing the page';
  if (/observe|read|extract|find|search|snapshot/.test(tool)) return 'Reading the page';
  if (/wait/.test(tool)) return 'Waiting for the page';
  if (/upload/.test(tool)) return 'Uploading a file';
  if (/dialog/.test(tool)) return 'Handling a dialog';
  if (/ask_user/.test(tool)) return 'Waiting for you';
  return 'Working';
}

export class PageBorder {
  /** Conversations whose run is working now. */
  #running = new Set<string>();
  /** Screenshots in progress, per tab. */
  #capturing = new Map<number, number>();
  /** The fade out of a tab with screenshots in progress: they all wait for the same one. */
  #hiding = new Map<number, Promise<void>>();
  /** The last verified action point of each tab. Dropped when the document changes: old coordinates would be stale. */
  #anchors = new Map<number, { x: number; y: number; kind: PointerKind }>();
  /** The status each working conversation shows now. */
  #labels = new Map<string, string>();

  constructor(private readonly ports: BorderPorts) {}

  /** At worker start: no run is working yet, so no page keeps a border or pointer from before. */
  async start(): Promise<void> {
    for (const tabId of await this.ports.scopedTabs()) this.#send(tabId, 'off');
  }

  /** A run's status changed. Never waits on a page. */
  async status(conversationId: string, status: RunStatus): Promise<void> {
    if (status === 'running') this.#running.add(conversationId);
    else {
      this.#running.delete(conversationId);
      this.#labels.delete(conversationId);
    }
    for (const tabId of await this.ports.tabsOf(conversationId)) {
      if (status !== 'running') this.#anchors.delete(tabId);
      await this.#apply(tabId);
    }
  }

  /** Tabs joined or left a conversation. */
  async tabsChanged(added: number[], removed: number[]): Promise<void> {
    for (const tabId of added) await this.#apply(tabId);
    for (const tabId of removed) {
      this.#anchors.delete(tabId);
      this.#send(tabId, 'off');
    }
  }

  /** A new document committed in a tab's top frame (a back-forward cache restore included). */
  async committed(tabId: number, documentId?: string): Promise<void> {
    this.#anchors.delete(tabId);
    const conversationId = await this.#wanted(tabId);
    if (conversationId) {
      this.#send(tabId, this.#capturing.get(tabId) ? 'hidden' : 'on', documentId, this.#pointerFor(tabId, conversationId));
    }
  }

  /** The Settings switch changed. */
  async settingChanged(): Promise<void> {
    for (const tabId of await this.ports.scopedTabs()) await this.#apply(tabId);
  }

  /** What the working run is doing now, in a few words (null clears it). Shown on every tab of the run; never waits on a page. */
  async activity(conversationId: string, label: string | null): Promise<void> {
    if (!this.#running.has(conversationId)) return;
    const before = this.#labels.get(conversationId);
    if (label === null) this.#labels.delete(conversationId);
    else this.#labels.set(conversationId, label);
    if ((label ?? undefined) === before) return;
    for (const tabId of await this.ports.tabsOf(conversationId)) {
      if (this.#capturing.get(tabId)) continue;
      if (await this.#wanted(tabId)) this.#send(tabId, 'on', undefined, this.#pointerFor(tabId, conversationId));
    }
  }

  /**
   * The agent acted at a verified point of a tab's visible page: the pointer moves there and stays. A location change
   * (a page or tab opened) has no point on the page, so the pointer stays anchored with a neutral status.
   */
  async point(tabId: number, point: { x: number; y: number }, kind: PointerKind): Promise<void> {
    const conversationId = await this.#wanted(tabId);
    if (!conversationId) return;
    const located = kind !== 'navigation' && kind !== 'tab' && Number.isFinite(point.x) && Number.isFinite(point.y);
    if (located) this.#anchors.set(tabId, { x: point.x, y: point.y, kind });
    else this.#anchors.delete(tabId);
    if (this.#capturing.get(tabId)) return;
    const command = this.#pointerFor(tabId, conversationId);
    if (!this.#labels.has(conversationId)) command.label = KIND_LABEL[kind];
    this.#send(tabId, 'on', undefined, command);
  }

  /**
   * A screenshot of a tab: the border and pointer fade out first, waiting at most HIDE_WAIT_MS, and come back after. A tab
   * with no border is captured at once. Screenshots of one tab that overlap share one fade: a second 'hidden' would return
   * at once while the first is still fading.
   */
  async around<T>(tabId: number, capture: () => Promise<T>): Promise<T> {
    if (!(await this.#wanted(tabId))) return capture();
    const count = this.#capturing.get(tabId) ?? 0;
    this.#capturing.set(tabId, count + 1);
    if (!count) this.#hiding.set(tabId, this.#hide(tabId));
    try {
      await this.#hiding.get(tabId);
      return await capture();
    } finally {
      const left = (this.#capturing.get(tabId) ?? 1) - 1;
      if (left > 0) this.#capturing.set(tabId, left);
      else {
        this.#capturing.delete(tabId);
        this.#hiding.delete(tabId);
        void this.#apply(tabId);
      }
    }
  }

  async #hide(tabId: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.ports.inject(tabId, 'hidden').catch(() => undefined),
      new Promise<void>(resolve => (timer = setTimeout(resolve, HIDE_WAIT_MS))),
    ]);
    clearTimeout(timer);
  }

  /** The conversation a tab belongs to when its run is working and the border is on; otherwise null. */
  async #wanted(tabId: number): Promise<string | null> {
    const conversationId = await this.ports.conversationOf(tabId);
    return conversationId !== null && this.#running.has(conversationId) && (await this.ports.enabled()) ? conversationId : null;
  }

  #pointerFor(tabId: number, conversationId: string): PointerCommand {
    const anchor = this.#anchors.get(tabId);
    return { ...(anchor ?? {}), label: this.#labels.get(conversationId) ?? (anchor ? KIND_LABEL[anchor.kind] : NEUTRAL_LABEL) };
  }

  async #apply(tabId: number): Promise<void> {
    const conversationId = await this.#wanted(tabId);
    if (!conversationId) return this.#send(tabId, 'off');
    if (!this.#capturing.get(tabId)) this.#send(tabId, 'on', undefined, this.#pointerFor(tabId, conversationId));
  }

  /** Started and not waited for: a page with a dialog open holds an injection until the dialog closes. */
  #send(tabId: number, state: BorderState, documentId?: string, pointer?: PointerCommand): void {
    const mark = (working: boolean) => this.ports.unreachable?.(tabId, working).catch(() => undefined);
    void this.ports
      .inject(tabId, state, documentId, pointer)
      .then(() => (state === 'on' ? mark(false) : undefined))
      .catch(() => (state === 'on' ? mark(true) : mark(false)));
  }
}

/**
 * Runs in the page, in the extension's isolated world, passed whole to chrome.scripting.executeScript: it must not use
 * anything from outside its own body. It keeps its element on the isolated world's globalThis, which page script
 * cannot see, so later calls find it (a closed shadow root cannot be reached from its host). The pointer lives in the
 * same element: 'hidden' fades it with the glow and 'on' brings it back where it was; 'off' removes both.
 */
export function setBorder(state: BorderState, pointer?: PointerCommand | null): Promise<void> | void {
  const KEY = '__nanobrowserBorder';
  type Border = {
    host: HTMLElement;
    glow: HTMLElement;
    ptr: HTMLElement;
    chip: HTMLElement;
    ring: HTMLElement;
    timer: ReturnType<typeof setInterval>;
    onHide: () => void;
  };
  const g = globalThis as unknown as Record<string, Border | undefined>;
  // An older worker drew a short-lived pointer of its own; never leave one behind after an update.
  (globalThis as typeof globalThis & { __xrogaActionPoint?: HTMLElement }).__xrogaActionPoint?.remove();
  const remove = () => {
    const b = g[KEY];
    if (!b) return;
    clearInterval(b.timer);
    removeEventListener('pagehide', b.onHide);
    b.host.remove();
    g[KEY] = undefined;
  };
  if (state === 'off') return remove();
  let b = g[KEY];
  if (!b || !b.host.isConnected) {
    remove();
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('data-nanobrowser-border', '');
    host.inert = true;
    host.style.cssText =
      'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block;contain:strict';
    const root = host.attachShadow({ mode: 'closed' });
    const blue = 'rgb(0 115 220 / 0.6)';
    const violet = 'rgb(124 92 255 / 0.6)';
    const along = (side: string) => `linear-gradient(${side}, ${violet}, ${blue} 25%, ${blue} 75%, ${violet})`;
    root.innerHTML = `<style>
      .glow { position: absolute; inset: 0; transition: opacity 150ms ease; }
      .pulse { position: absolute; inset: 0; }
      .edge { position: absolute; }
      .t, .b { left: 0; right: 0; height: 16px; background: ${along('to right')}; }
      .l, .r { top: 0; bottom: 0; width: 16px; background: ${along('to bottom')}; }
      .t { top: 0; mask-image: linear-gradient(to bottom, #000, transparent); }
      .b { bottom: 0; mask-image: linear-gradient(to top, #000, transparent); }
      .l { left: 0; mask-image: linear-gradient(to right, #000, transparent); }
      .r { right: 0; mask-image: linear-gradient(to left, #000, transparent); }
      .ptr { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; transition: transform 240ms cubic-bezier(.2,.8,.2,1), opacity 150ms ease; will-change: transform; }
      .ptr svg { position: absolute; left: -2px; top: -2px; width: 25px; height: 29px; filter: drop-shadow(0 1px 3px #0b173c); }
      .ptr .ring { position: absolute; left: -12px; top: -12px; width: 24px; height: 24px; border: 2px solid #529bff; border-radius: 50%; opacity: 0; }
      .ptr .chip { position: absolute; left: 18px; top: 21px; white-space: nowrap; background: #1759db; color: white; padding: 4px 8px; border-radius: 10px;
        border: 1px solid #c8dbff; box-shadow: 0 2px 8px #0005; font: 600 12px system-ui; }
      .ptr[data-right=true] .chip { left: auto; right: 5px; }
      .ptr[data-bottom=true] .chip { top: auto; bottom: 12px; }
      .ptr[data-mode=neutral] { left: auto; right: 12px; top: 12px; transform: none; }
      .ptr[data-mode=neutral] svg, .ptr[data-mode=neutral] .ring { display: none; }
      .ptr[data-mode=neutral] .chip { position: static; display: inline-block; transform: translate(-100%, 0); }
      @media (prefers-reduced-motion: no-preference) {
        .ptr .ring.go { animation: ripple 500ms ease-out both; }
        @keyframes ripple { from { transform: scale(.55); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
      }
      @media (prefers-reduced-motion: reduce) { .ptr { transition: opacity 150ms ease; } }
    </style><div class="glow"><div class="pulse"><div class="edge t"></div><div class="edge b"></div><div class="edge l"></div><div class="edge r"></div></div></div>
    <div class="ptr" data-mode="neutral"><i class="ring"></i><svg viewBox="0 0 25 29" fill="none"><path d="M2 2v22l6-6 5 9 4-2-5-9h9L2 2Z" fill="#1769ff" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg><span class="chip">Xroga</span></div>`;
    document.documentElement.appendChild(host);
    // A page kept in the back-forward cache keeps its DOM, and its timers wait: it must not keep a border.
    const onHide = () => remove();
    addEventListener('pagehide', onHide);
    // When the extension is updated, reloaded, turned off or removed, its id is gone, and the border goes with it.
    const timer = setInterval(() => {
      if (!globalThis.chrome?.runtime?.id) remove();
    }, 2000);
    b = {
      host,
      glow: root.querySelector('.glow') as HTMLElement,
      ptr: root.querySelector('.ptr') as HTMLElement,
      chip: root.querySelector('.chip') as HTMLElement,
      ring: root.querySelector('.ring') as HTMLElement,
      timer,
      onHide,
    };
    g[KEY] = b;
  }
  const { glow, ptr, chip, ring } = b;
  if (pointer) {
    if (typeof pointer.label === 'string') {
      chip.textContent = 'Xroga · ' + pointer.label;
      b.host.setAttribute('data-xroga-status', pointer.label);
    }
    const { x, y } = pointer;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      // The pointer always stays inside the visible page: a point outside it (the page scrolled or resized) is clamped to the edge.
      const px = Math.min(Math.max(x, 6), Math.max(6, innerWidth - 6));
      const py = Math.min(Math.max(y, 6), Math.max(6, innerHeight - 6));
      ptr.setAttribute('data-mode', 'point');
      ptr.setAttribute('data-right', String(px > innerWidth - 150));
      ptr.setAttribute('data-bottom', String(py > innerHeight - 56));
      ptr.style.transform = `translate(${px}px, ${py}px)`;
      if (pointer.kind === 'click' || pointer.kind === 'type') {
        ring.classList.remove('go');
        void ring.getBoundingClientRect();
        ring.classList.add('go');
      }
    } else {
      ptr.setAttribute('data-mode', 'neutral');
      ptr.style.transform = '';
    }
  }
  // The overlay's content is in a closed root, so its state is also written on the host for tests and for support.
  b.host.setAttribute('data-xroga-pointer', state === 'on' ? (ptr.getAttribute('data-mode') ?? 'neutral') : 'hidden');
  if (state === 'on') {
    glow.style.transition = '';
    glow.style.opacity = '1';
    ptr.style.opacity = '1';
    return;
  }
  ptr.style.opacity = '0';
  if (glow.style.opacity === '0') return;
  // A hidden tab paints nothing until the capture, so the border can go at once.
  if (document.visibilityState === 'hidden') {
    glow.style.transition = 'none';
    glow.style.opacity = '0';
    return;
  }
  // No fade: the capture only needs the overlay not painted, and a fade costs 150 to 200 ms on every screenshot. The change
  // is made at once and the promise resolves after two frames, so the next paint the capture sees is already without it.
  glow.style.transition = 'none';
  glow.style.opacity = '0';
  return new Promise<void>(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 100);
  });
}

/** Puts `setBorder(state, pointer)` into the top frame of a tab, or into one document of it. */
export async function injectBorder(
  tabId: number,
  state: BorderState,
  documentId?: string,
  pointer?: PointerCommand,
): Promise<void> {
  await chrome.scripting.executeScript({
    target: documentId ? { tabId, documentIds: [documentId] } : { tabId },
    func: setBorder,
    args: [state, pointer ?? null],
    injectImmediately: true,
  });
}

/** The border that is listening now, so the control layer's action callback can reach it. */
let activeBorder: PageBorder | undefined;

/**
 * An input Chrome accepted at a verified point: the pointer moves there and stays while the run works. A page or tab
 * opening has no point on the page; the pointer stays anchored with a neutral status instead of pointing at a control.
 */
export async function showActionPoint(tabId: number, point: { x: number; y: number }, kind: PointerKind): Promise<void> {
  await activeBorder?.point(tabId, point, kind);
}

/** New documents in a tab's top frame, and the Settings switch. Registered at worker start. */
export function listenForBorder(border: PageBorder): void {
  activeBorder = border;
  chrome.webNavigation.onCommitted.addListener(details => {
    if (details.frameId === 0) void border.committed(details.tabId, details.documentId).catch(() => undefined);
  });
  let enabled: boolean | undefined;
  settingsStorage.subscribe(() => {
    const next = settingsStorage.getSnapshot()?.pageBorder;
    if (next === undefined || next === enabled) return;
    const changed = enabled !== undefined;
    enabled = next;
    if (changed) void border.settingChanged().catch(() => undefined);
  });
  void settingsStorage.get().then(settings => (enabled ??= settings?.pageBorder));
}

/** Whether the pointer is enabled in Settings (it follows the page border switch). */
export async function pointerEnabled(): Promise<boolean> {
  return ((await settingsStorage.get()) ?? DEFAULT_SETTINGS).pageBorder;
}
