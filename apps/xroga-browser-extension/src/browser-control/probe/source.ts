// The probe: the only code that runs in the page. It runs in an isolated world, so the page cannot see or alter it, and
// it never computes accessible names.
//
// `probeMain` must stay self-contained: it is turned into a string with Function.prototype.toString and evaluated
// in the page, so it may not reference anything outside its own body (no imports, no module constants).

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ProbeState {
  connected: boolean;
  tag: string;
  type: string;
  role: string;
  visible: boolean;
  /** Not disabled, aria-disabled or inert, including through ancestors and fieldsets. */
  enabled: boolean;
  /** An input, textarea or contenteditable that is not read-only (and not disabled). */
  editable: boolean;
  contentEditable: boolean;
  checked: boolean | 'mixed' | null;
  value: string | null;
  inShadow: boolean;
  /** For masking decisions in core. */
  autocomplete: string;
  name: string;
  id: string;
  /** A native select: whether several options can be selected. */
  multiple: boolean;
  /** The element has focus (through shadow roots). */
  focused: boolean;
}

/** Structural facts for the sensitivity classifier; the probe never decides the category. */
export interface ExtractedTable {
  /** The caption, aria-label or nearest heading. */
  name: string;
  kind: 'table' | 'grid' | 'list';
  columns: string[];
  rows: string[][];
  /** The href of a link in a cell, by row and column index, when there is one. */
  links?: Array<[number, number, string]>;
  /** The total the page states (aria-rowcount or "of N"), when it states one. */
  statedTotal?: number;
  /** The table sits in a scrolling box with more below, or states more rows than it holds: scroll and read again. */
  moreBelow?: boolean;
  /** Cells that span more than one row or column: their text sits in the first cell only. */
  merged?: number;
}

export interface PageAudit {
  url: string;
  https: boolean;
  title: string;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  lang: string | null;
  viewport: boolean;
  h1: string[];
  headings: { h2: number; h3: number };
  words: number;
  images: { total: number; noAlt: number; lazy: number };
  links: { internal: number; external: number; nofollow: number; noText: number };
  social: { ogTitle: boolean; ogImage: boolean; twitterCard: boolean };
  structuredData: string[];
  hreflang: number;
  forms: { total: number; unlabelled: number };
  buttonsNoName: number;
  mixedContent: number;
  /** Contact details the page publishes: mailto and tel links and addresses written in its text. */
  contacts: { emails: string[]; phones: string[] };
  perf: { ttfbMs?: number; fcpMs?: number; lcpMs?: number; cls?: number; domContentLoadedMs?: number; loadMs?: number; transferKb?: number; requests?: number; domNodes: number };
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface FormField {
  role: string;
  name: string;
  type?: string;
  group?: string;
  required?: boolean;
  disabled?: boolean;
  checked?: boolean;
  /** Passwords, card and one-time-code fields read as (hidden). */
  value?: string;
  options?: string[];
  error?: string;
}

export interface FormFacts {
  tag: string;
  type: string;
  /** class and test IDs (data-testid, data-test, data-qa), for the delete vocabulary. */
  classes: string;
  isLink: boolean;
  /** A button with no type or type=submit, or an input of type submit or image, that has a form owner. */
  submitter: boolean;
  /** A field Enter can submit from: an input that takes text, or a select. */
  field: boolean;
  form: null | {
    /** The submitter's method and address (its formmethod and formaction, else the form's). */
    method: string;
    action: string;
    /** role=search, a type=search input, or a single-field form submitted with GET. */
    search: boolean;
    fields: number;
    /** Fields that block implicit submission in Chrome: text, search, url, tel, email, password, number. */
    blockingFields: number;
    hasSubmitButton: boolean;
    /** The button Enter in this element submits through: for a text field the form's default button (its first
     *  submit button in tree order, wherever it sits), for any other control the first one that is not disabled.
     *  `name` is the probe's approximation; the gate adds Chrome's accessible name. */
    defaultButton: null | { name: string; disabled: boolean; accessibleName?: string };
  };
  /** A money amount in the element or its parent (huashu's rule: wider containers gave false positives). */
  money: string;
  /** A place to type text: a textarea, a contenteditable element, or an input that takes text. */
  textEntry: boolean;
  /**
   * A search field: type=search, role searchbox or combobox, inside role=search or a <search> element, or a name,
   * placeholder or label that is search vocabulary.
   */
  searchField: boolean;
}

/** Where activating an element (or pressing Enter in it) would navigate (policy layer 2). */
export interface NavigationTarget {
  kind: 'link' | 'form';
  url: string;
  method: string;
  newTab: boolean;
}

export interface OptionResult {
  ok: boolean;
  error?: 'NO_SUCH_OPTION' | 'AMBIGUOUS_OPTION';
  /** Every option, for error messages; the controller decides what of it may be printed. */
  options: SelectedOption[];
  /** Labels of the options selected when the events had run (a synchronous change handler included). */
  selected: string[];
  /** The options the request matched, by index and value (their identity), with labels for display. */
  requested?: SelectedOption[];
  /** Requested values that matched more than one option, or none. */
  problem?: string;
}

/** A select option: its index and value identify it; its label is for display. */
export interface SelectedOption {
  index: number;
  value: string;
  label: string;
}

export interface HitVerdict {
  accepted: boolean;
  /** inside: the target or a node inside it; label: a label of the target, off its interactive content;
   *  nested: a separate control inside the target (a button inside a clickable card), which would take the click;
   *  ancestor: an ancestor of the target would receive the click; other: anything else. */
  kind: 'inside' | 'label' | 'nested' | 'ancestor' | 'other';
}

export interface GuardReport {
  /** none: no press reached this document; passed: the press hit the target; cancelled: it did not, and the
   *  sequence was cancelled before any page handler ran. */
  verdict: 'none' | 'passed' | 'cancelled';
  /** What was at the press point, when the guard cancelled. */
  hit: string;
  /** Trusted event types seen while armed, in order (the first 100). */
  seen: string[];
  /** Text mode: keydown and beforeinput events accepted at the target, so the controller can tell that each key or
   *  insertion of a sequence arrived there. Pointer mode: press events (pointerdown, mousedown) accepted. */
  accepted?: number;
  /** Text mode: keyups that arrived elsewhere after their key was accepted (the key's own default action, such as
   *  Tab or a submission, moved focus); they are withheld from the page, and are not a failure. */
  strayKeyups?: number;
}

/** The text guard between two keys of a sequence. */
export interface GuardStep extends GuardReport {
  /** The guard is still installed (it lapses 4 s after the last step). */
  armed: boolean;
  /** Focus is on the target now. */
  focusOk: boolean;
  /** What has focus now. */
  focus: string;
}

export interface ScrollInfo {
  top: number;
  left: number;
  height: number;
  width: number;
  clientHeight: number;
  clientWidth: number;
}

/** Page-level facts for effect evidence version 2. */
export interface PageFacts {
  /** Text of alert and live regions. */
  alerts: string[];
  /** Validation messages of invalid fields. */
  invalid: string[];
  /** Open dialogs and modal layers, described. */
  layers: string[];
}

export interface ProbeApi {
  version: number;
  state(el: Element): ProbeState;
  textDigest(el: Element, max?: number): string;
  nameSources(el: Element): string;
  mutations(): number;
  hitAccepts(target: Element, hit: Node): HitVerdict;
  describe(el: Node): string;
  armGuard(target: Element, mode: 'pointer' | 'text', lifetimeMs?: number, unfocused?: boolean): void;
  armAncestorGuard(lifetimeMs?: number): void;
  armAwayGuard(lifetimeMs?: number): void;
  armDocumentGuard(lifetimeMs?: number): void;
  armBlockGuard(kind: 'pointer' | 'text', lifetimeMs?: number): void;
  stepGuard(lifetimeMs?: number): GuardStep;
  renewGuard(lifetimeMs?: number): boolean;
  readGuard(): GuardReport;
  disarm(): void;
  scrollInfo(el: Element | null): ScrollInfo;
  viewport(): { width: number; height: number };
  selectOption(el: Element, values: string[]): OptionResult;
  selectedOptions(el: Element): SelectedOption[];
  selectContents(el: Element): boolean;
  watchBlock(el: Element): string;
  blockMutations(): number;
  hasText(text: string, fields?: boolean): boolean;
  /** Every visible field of the page or of the named form, dialog or group: what a form tool needs to fill it in one call. */
  formModel(scope?: string): FormField[];
  /** The organic results of a search engine's results page (title, address, snippet), or the reason the engine asked for a human check. */
  searchResults(engine: string, limit?: number): { hits: SearchHit[]; blocked?: string };
  /** Scrolls the page top to bottom so lazy content loads, waits for its height to settle, scrolls back: a full-page picture is then complete. */
  settleForCapture(): Promise<{ height: number; steps: number; grew: boolean }>;
  /** The page's on-page SEO, accessibility basics and loading numbers, read in the page (no network). */
  auditPage(): Promise<PageAudit>;
  /** The tables, grids and repeated lists of the page (or of the named region), as rows of text: structured extraction without the model reading cells. */
  extractRows(scope?: string, maxRows?: number): ExtractedTable[];
  /** Repeated cards picked by CSS selector, each field read by its own selector (text, or an attribute with `selector@attr`): the model names where, the page does the reading. */
  extractCards(cards: string, fields: Record<string, string>, maxRows?: number): ExtractedTable;
  startDemo(): boolean;
  stopDemo(): Array<{ t: number; kind: 'mouse' | 'key'; x?: number; y?: number; step: 'click' | 'set' | 'press'; role: string; name: string; value?: string; row?: string }>;
  /** What the element reads: a form control's value, otherwise its visible text (at most 400 characters). */
  reading(el: Element): string;
  /** The value of an attribute (aria-expanded, aria-selected, data-state), or null when it is not set (at most 200 characters). */
  attribute(el: Element, name: string): string | null;
  recentInput(ms: number): Array<{ t: number; kind: 'mouse' | 'key' | 'wheel' | 'touch'; x?: number; y?: number }>;
  navigationTarget(el: Element, mode: 'activate' | 'enter'): NavigationTarget | null;
  focused(): Element | null;
  activeIn(root: Node): Element | null;
  documentFocused(): boolean;
  formFacts(el: Element): FormFacts;
  defaultButtonOf(el: Element): Element | null;
  approximateName(el: Element): string;
  labelFor(input: Element): Element | null;
  labelPoint(input: Element): { fx: number; fy: number } | null;
  pageFacts(): PageFacts;
  contextOf(container: Element, target: Element): { inside: boolean; text: string; shown: string };
  setNativeValue(el: Element, value: string): string;
  fileInputFacts(el: Element): FileInputFacts;
  fileChunk(el: Element, key: string, chunk: string): number;
  setFiles(el: Element, specs: Array<{ key: string; name: string; mimeType: string }>): FileInfo[];
  fileList(el: Element): FileInfo[];
}

/** A file input, for `upload`. */
export interface FileInputFacts {
  isFileInput: boolean;
  multiple: boolean;
  accept: string;
  disabled: boolean;
}

export interface FileInfo {
  name: string;
  size: number;
  type: string;
}

export function probeMain(): void {
  const g = globalThis as any;
  if (g.__nbProbe) return;

  let mutationCount = 0;
  /** File bytes for `upload`, as base64 chunks by key, until the files are built. */
  const fileChunks = new Map<string, string[]>();
  try {
    new MutationObserver(records => {
      mutationCount += records.length;
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  } catch {
    // A document without a root yet; counting starts with the next document.
  }

  const disabledByAncestor = (el: Element): boolean => {
    for (let node: Element | null = el; node;) {
      if ((node as HTMLElement).inert) return true;
      if (node.getAttribute('aria-disabled') === 'true') return true;
      // A disabled fieldset disables its controls, except those in its first legend.
      if (node.tagName === 'FIELDSET' && node !== el) {
        if ((node as HTMLFieldSetElement).disabled) {
          const legend = node.querySelector(':scope > legend');
          if (!legend || !legend.contains(el)) return true;
        }
      } else if ((node as any).disabled === true && 'disabled' in node) return true;
      const parent: Node | null = node.parentNode;
      node = parent instanceof ShadowRoot ? parent.host : (parent as Element | null);
      if (node && node.nodeType !== 1) node = null;
    }
    return false;
  };

  /** Parent in the composed tree: a shadow root's host, otherwise the parent node. */
  const composedParent = (n: Node): Node | null => {
    const p = n.parentNode;
    return p instanceof ShadowRoot ? p.host : p;
  };
  const INTERACTIVE =
    'a[href], button, input, select, textarea, summary, [contenteditable=""], [contenteditable="true"], [tabindex]';
  /**
   * A control of its own inside a target: native controls, links and the widget roles that activate. Content of an
   * editing host is text, not a control (Chrome does not follow a link there), and controls inside a shadow tree are
   * parts of their host.
   */
  const NESTED_CONTROL =
    'a[href], button, input:not([type=hidden]), select, textarea, summary, iframe, frame, object, embed, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option]';
  /**
   * A form's own property or attribute. A control named `action`, `method`, `target` or `elements` shadows the
   * property of that name on its form (`form.action` is then the control), so they are read through the prototype.
   */
  const formProp = <K extends 'action' | 'method' | 'target' | 'elements'>(form: HTMLFormElement, name: K) =>
    Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, name)!.get!.call(form) as HTMLFormElement[K];
  const formAttr = (form: HTMLFormElement, name: string) => Element.prototype.getAttribute.call(form, name);
  /** Fields that block implicit submission in Chrome when a form has no submit button (dates and times do not). */
  const BLOCKING = ['text', 'search', 'url', 'tel', 'email', 'password', 'number'];
  const isTextField = (e: Element) =>
    e.tagName === 'INPUT' && BLOCKING.includes((e as HTMLInputElement).type || 'text');
  const isSubmitterEl = (e: Element) =>
    (e.tagName === 'BUTTON' && ((e as HTMLButtonElement).type || 'submit') === 'submit') ||
    (e.tagName === 'INPUT' && ['submit', 'image'].includes((e as HTMLInputElement).type));
  /**
   * A form's submit buttons in tree order. `form.elements` leaves out image buttons, which are submit buttons too
   * (and can be the default button), so they are added from the form's tree.
   */
  const submittersOf = (owner: HTMLFormElement): Element[] => {
    const root = owner.getRootNode() as Document | ShadowRoot;
    const images = [...root.querySelectorAll('input[type=image]')].filter(i => (i as HTMLInputElement).form === owner);
    const all = [...new Set([...(formProp(owner, 'elements') as unknown as Element[]), ...images])].filter(
      isSubmitterEl,
    );
    return all.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  };

  /**
   * The button Enter in `el` submits its form through. In a text field it is the form's default button, its first
   * submit button, and a disabled one means no submission. In any other control (a checkbox, a radio, a select, a
   * date or range field) Chrome clicks the first submit button that is not disabled.
   */
  const enterButtonOf = (el: Element, owner: HTMLFormElement): Element | undefined => {
    const all = submittersOf(owner);
    return isTextField(el) ? all[0] : all.find(b => !b.matches(':disabled'));
  };

  /**
   * Elements whose content is never quoted in a message: a select's or a listbox's options and a textarea's text can be
   * secrets.
   */
  const UNQUOTED = new Set(['SELECT', 'TEXTAREA', 'DATALIST', 'OPTION', 'OPTGROUP', 'SCRIPT', 'STYLE', 'TEMPLATE']);

  /**
   * An element's rendered text for messages and evidence, whitespace collapsed, without the content of selects,
   * textareas and options, as the layout's display text. Stops once it has more than `max` characters.
   */
  const unquoted = (el: Element) => UNQUOTED.has(el.tagName) || el.getAttribute('role') === 'option';
  const shownText = (el: Element, max: number): string => {
    if (unquoted(el)) return '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n =>
        n.nodeType !== Node.ELEMENT_NODE
          ? NodeFilter.FILTER_ACCEPT
          : unquoted(n as Element) || (n as Element).checkVisibility?.() === false
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP,
    });
    let out = '';
    for (let n = walker.nextNode(); n && out.length <= max * 2; n = walker.nextNode()) out += ` ${n.nodeValue ?? ''}`;
    out = out.replace(/\s+/g, ' ').trim();
    return out.length > max ? `${out.slice(0, max - 1)}…` : out;
  };

  /** A control that holds a value: a text-like input, a textarea or a select (a button's value is its caption). */
  const holdsValue = (e: Element) =>
    e.tagName === 'TEXTAREA' ||
    e.tagName === 'SELECT' ||
    (e.tagName === 'INPUT' &&
      !['checkbox', 'radio', 'button', 'submit', 'reset', 'image'].includes((e as HTMLInputElement).type));

  /**
   * An approximation of an element's name, for the classifier only: never compared with Chrome's. A control that holds
   * a value is named by its labels, never by what it holds.
   */
  const nameOf = (e: Element) =>
    (
      e.getAttribute('aria-label') ||
      (holdsValue(e)
        ? [...((e as HTMLInputElement).labels ?? [])].map(l => shownText(l, 100)).join(' ')
        : (e as HTMLElement).innerText || (e as HTMLInputElement).value) ||
      e.getAttribute('alt') ||
      e.getAttribute('title') ||
      ''
    ).trim();

  const POINTER_EVENTS = [
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
    'auxclick',
    'dblclick',
    'contextmenu',
  ];
  const PRESSES = ['pointerdown', 'mousedown'];
  const TEXT_EVENTS = ['keydown', 'keypress', 'beforeinput', 'input', 'keyup'];
  let guard: {
    report: GuardReport;
    remove: () => void;
    renew: (lifetimeMs: number) => void;
    /** For the text guard: the element keys must go to, and its chain of shadow roots. */
    text?: { target: Element; roots: ShadowRoot[]; accepts: (hit: Element | null) => boolean };
  } | null = null;
  /** The report of the last guard armed in this world, kept after it is removed so it can still be read. */
  let lastReport: GuardReport = { verdict: 'none', hit: '', seen: [] };

  /** Shadow roots from the document down to the target's own root, so closed roots can be entered. */
  const rootsOf = (el: Element): ShadowRoot[] => {
    const roots: ShadowRoot[] = [];
    for (let root = el.getRootNode(); root instanceof ShadowRoot; root = root.host.getRootNode()) roots.unshift(root);
    return roots;
  };
  /** The element at a point, descending through the target's chain of shadow hosts (closed ones included). */
  const deepElementFromPoint = (x: number, y: number, roots: ShadowRoot[]): Element | null => {
    let el = document.elementFromPoint(x, y);
    for (const root of roots) {
      if (!el || el !== root.host) break;
      el = root.elementFromPoint(x, y) ?? el;
    }
    return el;
  };
  /** The focused element, through the target's chain of shadow roots. */
  const deepActiveElement = (roots: ShadowRoot[]): Element | null => {
    let el = document.activeElement;
    for (const root of roots) {
      if (!el || el !== root.host) break;
      el = root.activeElement ?? el;
    }
    return el;
  };

  const install = (
    types: string[],
    handler: (e: Event) => void,
    lifetimeMs: number,
    report: GuardReport,
    text?: { target: Element; roots: ShadowRoot[]; accepts: (hit: Element | null) => boolean },
  ) => {
    for (const type of types) window.addEventListener(type, handler, true);
    const remove = () => {
      for (const type of types) window.removeEventListener(type, handler, true);
      clearTimeout(timer);
      if (guard?.remove === remove) guard = null;
    };
    // A guard never outlives its action, even if the controller cannot disarm it (a dialog blocks the page). A key
    // sequence renews it before every key, so it lasts as long as the sequence does.
    let timer = setTimeout(remove, lifetimeMs);
    const renew = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(remove, ms);
    };
    guard = { report, remove, renew, text };
    lastReport = report;
  };
  const note = (report: GuardReport, type: string) => {
    if (report.seen.length < 100) report.seen.push(type);
  };

  let blockCount = 0;
  let blockObserver: MutationObserver | null = null;
  const BLOCKS =
    'form, dialog, [role=dialog], [role=alertdialog], [role=menu], [role=listbox], article, section, li, tr, table, main, nav';

  // Human control: a trusted input event outside the agent's own dispatch window is the person using this tab. The layer opens the window around each
  // of its tools (agentWindow) and asks humanQuiet before a mutating one. Frames other than this document are not watched.
  const recent: Array<{ t: number; kind: 'mouse' | 'key' | 'wheel' | 'touch'; x?: number; y?: number }> = [];
  const KIND: Record<string, 'mouse' | 'key' | 'wheel' | 'touch'> = { mousedown: 'mouse', contextmenu: 'mouse', keydown: 'key', beforeinput: 'key', wheel: 'wheel', touchstart: 'touch' };
  for (const type of typeof g.addEventListener === 'function' ? Object.keys(KIND) : []) {
    g.addEventListener(type, (e: Event) => {
      if (!e.isTrusted) return;
      const m = e as MouseEvent;
      // CDP positions are in the visual viewport; DOM client coordinates are in the layout viewport, which has another origin after pinch zoom or pan (as BrowserSkill's cooperation-capture does).
      const vv = (g as { visualViewport?: { offsetLeft: number; offsetTop: number } }).visualViewport;
      recent.push({ t: Date.now(), kind: KIND[type]!, ...(typeof m.clientX === 'number' ? { x: m.clientX - (vv?.offsetLeft ?? 0), y: m.clientY - (vv?.offsetTop ?? 0) } : {}) });
      if (recent.length > 60) recent.shift();
    }, { capture: true, passive: true });
  }

  // Demonstration recording (the `demo` tool): the person's trusted clicks, field changes and Enter presses, as role, name, value and row. Off until started;
  // secrets are never kept (a password, card, CVC, IBAN or one-time-code field records "(hidden)"). The layer removes the inputs it dispatched itself.
  type DemoRec = { t: number; kind: 'mouse' | 'key'; x?: number; y?: number; step: 'click' | 'set' | 'press'; role: string; name: string; value?: string; row?: string };
  let demo: DemoRec[] | null = null;
  const DEMO_ROLE: Record<string, string> = { A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox', SUMMARY: 'button' };
  const INPUT_ROLE: Record<string, string> = { checkbox: 'checkbox', radio: 'radio', submit: 'button', button: 'button', reset: 'button', image: 'button' };
  const demoRole = (el: Element) => el.getAttribute('role') || (el.tagName === 'INPUT' ? (INPUT_ROLE[(el as HTMLInputElement).type] ?? 'textbox') : (DEMO_ROLE[el.tagName] ?? el.tagName.toLowerCase()));
  const demoTarget = (t: EventTarget | null): Element | null =>
    t instanceof Element ? t.closest('a,button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=switch],[role=radio],[role=combobox],[role=textbox],[role=treeitem],[contenteditable=true]') : null;
  const demoRow = (el: Element) => { const r = el.closest('li,tr,[role=row],[role=listitem],article'); return r ? shownText(r, 60) || undefined : undefined; };
  const demoSecret = (el: Element) => {
    const i = el as HTMLInputElement;
    return i.type === 'password' || /cc-|one-time-code/.test((i.autocomplete || '').toLowerCase()) || /card|cvv|cvc|iban|ssn|passw|otp|pin\b/i.test(`${i.name} ${i.id} ${el.getAttribute('aria-label') ?? ''}`);
  };
  const demoPush = (r: DemoRec) => { if (!demo) return; demo.push(r); if (demo.length > 300) demo.shift(); };
  if (typeof g.addEventListener === 'function') {
    g.addEventListener('click', (e: Event) => {
      if (!demo || !e.isTrusted) return;
      const el = demoTarget(e.target);
      if (!el || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && demoRole(el) === 'textbox')) return;
      const m = e as MouseEvent;
      demoPush({ t: Date.now(), kind: 'mouse', x: m.clientX, y: m.clientY, step: 'click', role: demoRole(el), name: nameOf(el).replace(/\s+/g, ' ').slice(0, 80), row: demoRow(el) });
    }, { capture: true, passive: true });
    // A field's value is taken as it is typed (one step per field, updated by each keystroke), so the step carries the time of the last input: the layer's
    // own typing is then matched to its dispatch and removed. A select is taken on change (a person's pick is one event).
    let demoField: Element | null = null;
    const demoSet = (el: Element, kind: 'mouse' | 'key') => {
      const role = demoRole(el);
      if (role === 'checkbox' || role === 'radio' || role === 'switch' || !holdsValue(el)) return;
      const value = demoSecret(el) ? '(hidden)' : el.tagName === 'SELECT' ? ((el as HTMLSelectElement).selectedOptions[0]?.text ?? '') : (el as HTMLInputElement).value;
      const last = demo && demo[demo.length - 1];
      if (last && demoField === el && last.step === 'set') { last.value = String(value).slice(0, 200); last.t = Date.now(); return; }
      demoField = el;
      demoPush({ t: Date.now(), kind, step: 'set', role, name: nameOf(el).replace(/\s+/g, ' ').slice(0, 80), value: String(value).slice(0, 200), row: demoRow(el) });
    };
    g.addEventListener('input', (e: Event) => {
      if (!demo || !e.isTrusted || !(e.target instanceof Element) || e.target.tagName === 'SELECT') return;
      demoSet(e.target, 'key');
    }, { capture: true, passive: true });
    g.addEventListener('change', (e: Event) => {
      if (!demo || !e.isTrusted || !(e.target instanceof Element) || e.target.tagName !== 'SELECT') return;
      demoSet(e.target, 'mouse');
    }, { capture: true, passive: true });
    g.addEventListener('keydown', (e: Event) => {
      const k = e as KeyboardEvent;
      if (!demo || !e.isTrusted || k.key !== 'Enter' || !(e.target instanceof Element)) return;
      demoPush({ t: Date.now(), kind: 'key', step: 'press', role: demoRole(e.target), name: nameOf(e.target).replace(/\s+/g, ' ').slice(0, 80), value: 'Enter' });
    }, { capture: true, passive: true });
  }

  const api = {
    version: 1,

    async settleForCapture() {
      const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
      const se = (document.scrollingElement ?? document.documentElement) as HTMLElement;
      const start = { x: window.scrollX, y: window.scrollY };
      const first = se.scrollHeight;
      const t0 = Date.now();
      let y = 0;
      let steps = 0;
      // Down in steps of 90% of the window: lazy images and appended rows load as they come into view. Bounded, so an endless feed cannot hold the capture.
      while (y < se.scrollHeight && steps < 150 && Date.now() - t0 < 2500) {
        window.scrollTo(0, y);
        await wait(60);
        y += Math.max(200, Math.floor(window.innerHeight * 0.9));
        steps++;
      }
      // Rows appended when the end comes into view: go to the new end until the height stops growing.
      for (let grown = 0; grown < 2 && Date.now() - t0 < 3500; ) {
        const before = se.scrollHeight;
        window.scrollTo(0, before);
        await wait(120);
        grown = se.scrollHeight > before ? 0 : grown + 1;
      }
      let last = se.scrollHeight;
      let stable = 0;
      while (stable < 200 && Date.now() - t0 < 4000) {
        await wait(100);
        if (se.scrollHeight === last) stable += 100;
        else { last = se.scrollHeight; stable = 0; }
      }
      window.scrollTo(start.x, start.y);
      return { height: se.scrollHeight, steps, grew: se.scrollHeight > first };
    },

    async auditPage() {
      const q = (sel: string) => [...document.querySelectorAll(sel)];
      const meta = (n: string) => (document.querySelector(`meta[name="${n}" i]`) as HTMLMetaElement | null)?.content?.trim() || null;
      const prop = (n: string) => (document.querySelector(`meta[property="${n}"]`) as HTMLMetaElement | null)?.content?.trim() || null;
      const here = location.hostname;
      let internal = 0, external = 0, nofollow = 0, noText = 0;
      for (const a of q('a[href]') as HTMLAnchorElement[]) {
        let host = '';
        try { host = new URL(a.href, location.href).hostname; } catch { continue; }
        if (!/^https?:/.test(a.href)) continue;
        if (host === here) internal++; else external++;
        if (/nofollow/i.test(a.rel)) nofollow++;
        if (!(a.textContent ?? '').trim() && !a.getAttribute('aria-label') && !a.querySelector('img[alt]:not([alt=""])')) noText++;
      }
      const types: string[] = [];
      for (const s of q('script[type="application/ld+json"]')) {
        try {
          const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { const t = (v as Record<string, unknown>)['@type']; if (typeof t === 'string') types.push(t); else if (Array.isArray(t)) types.push(...t.map(String)); Object.values(v).forEach(walk); } };
          walk(JSON.parse(s.textContent ?? ''));
        } catch { types.push('(unreadable)'); }
      }
      const inputs = q('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea') as HTMLInputElement[];
      const unlabelled = inputs.filter(i => !i.labels?.length && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !i.title).length;
      const buttonsNoName = (q('button,[role=button]') as HTMLElement[]).filter(b => !(b.innerText ?? '').trim() && !b.getAttribute('aria-label') && !b.title && !b.querySelector('img[alt]:not([alt=""])')).length;
      const imgs = q('img') as HTMLImageElement[];
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
      const observed = await new Promise<{ lcp?: number; cls?: number }>(resolve => {
        const got: { lcp?: number; cls?: number } = {};
        try {
          const po = new PerformanceObserver(list => {
            for (const e of list.getEntries() as any[]) {
              if (e.entryType === 'largest-contentful-paint') got.lcp = e.startTime;
              if (e.entryType === 'layout-shift' && !e.hadRecentInput) got.cls = (got.cls ?? 0) + e.value;
            }
          });
          po.observe({ type: 'largest-contentful-paint', buffered: true });
          po.observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => { po.disconnect(); resolve(got); }, 120);
        } catch { resolve(got); }
      });
      const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const bytes = (nav?.transferSize ?? 0) + res.reduce((n, r) => n + (r.transferSize || 0), 0);
      const round = (n: number | undefined) => (typeof n === 'number' && isFinite(n) ? Math.round(n) : undefined);
      return {
        url: location.href,
        https: location.protocol === 'https:',
        title: document.title.trim(),
        description: meta('description'),
        canonical: (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href ?? null,
        robots: meta('robots'),
        lang: document.documentElement.lang || null,
        viewport: !!meta('viewport'),
        h1: (q('h1') as HTMLElement[]).map(h => (h.innerText ?? '').trim().slice(0, 100)).filter(Boolean).slice(0, 5),
        headings: { h2: q('h2').length, h3: q('h3').length },
        words: ((document.body?.innerText ?? '').match(/\S+/g) ?? []).length,
        images: { total: imgs.length, noAlt: imgs.filter(i => !i.hasAttribute('alt')).length, lazy: imgs.filter(i => i.loading === 'lazy').length },
        links: { internal, external, nofollow, noText },
        social: { ogTitle: !!prop('og:title'), ogImage: !!prop('og:image'), twitterCard: !!meta('twitter:card') },
        structuredData: [...new Set(types)].slice(0, 12),
        hreflang: q('link[rel="alternate"][hreflang]').length,
        forms: { total: q('form').length, unlabelled },
        buttonsNoName,
        mixedContent: location.protocol === 'https:' ? q('img[src^="http:"],script[src^="http:"],link[href^="http:"],iframe[src^="http:"]').length : 0,
        contacts: (() => {
          const emails = new Set<string>();
          const phones = new Set<string>();
          for (const a of q('a[href^="mailto:"]') as HTMLAnchorElement[]) { const m = decodeURIComponent(a.getAttribute('href')!.slice(7).split('?')[0]!).trim(); if (m) emails.add(m.toLowerCase()); }
          for (const a of q('a[href^="tel:"]') as HTMLAnchorElement[]) { const t = decodeURIComponent(a.getAttribute('href')!.slice(4)).trim(); if (t) phones.add(t); }
          const text = document.body?.innerText ?? '';
          for (const m of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) emails.add(m.toLowerCase());
          for (const m of text.match(/(?:\+\d{1,3}[\s().-]*)?(?:\(?0\d{2,4}\)?[\s.-]*)\d{3,4}[\s.-]*\d{3,4}/g) ?? []) if (m.replace(/\D/g, '').length >= 9) phones.add(m.trim());
          return { emails: [...emails].slice(0, 5), phones: [...phones].slice(0, 5) };
        })(),
        perf: { ttfbMs: round(nav?.responseStart), fcpMs: round(fcp), lcpMs: round(observed.lcp), cls: observed.cls === undefined ? undefined : Math.round(observed.cls * 1000) / 1000, domContentLoadedMs: round(nav?.domContentLoadedEventEnd), loadMs: round(nav?.loadEventEnd), transferKb: Math.round(bytes / 1024), requests: res.length + 1, domNodes: document.getElementsByTagName('*').length },
      };
    },

    searchResults(engine: string, limit?: number) {
      const cap = Math.max(1, Math.min(limit ?? 10, 30));
      const clip = (t: string, n: number) => t.replace(/\s+/g, ' ').trim().slice(0, n);
      const text = document.body?.innerText ?? '';
      if (/\/sorry\/|\/captcha|challenge/i.test(location.href) || /unusual traffic|not a robot|verify (?:that )?you(?:'re| are) (?:a )?human|captcha|before you continue to/i.test(text.slice(0, 1500)) && document.querySelectorAll('a h3, .result, .b_algo').length === 0) {
        return { hits: [], blocked: clip(text, 120) || 'a check page' };
      }
      const decode = (href: string): string => {
        try {
          const u = new URL(href, location.href);
          const wrapped = u.searchParams.get('uddg');
          if (wrapped) return decodeURIComponent(wrapped);
          const b = u.hostname.endsWith('bing.com') && u.pathname.startsWith('/ck/') ? u.searchParams.get('u') : null;
          if (b && /^a1/.test(b)) { const raw = atob(b.slice(2).replace(/-/g, '+').replace(/_/g, '/')); if (/^https?:/.test(raw)) return raw; }
          return u.href;
        } catch { return ''; }
      };
      const own = new Set([location.hostname, 'duckduckgo.com', 'www.google.com', 'www.bing.com', 'google.com', 'bing.com']);
      const hits: SearchHit[] = [];
      const add = (title: string, href: string, snippet: string) => {
        const url = decode(href);
        if (!title || !/^https?:/.test(url)) return;
        let host = '';
        try { host = new URL(url).hostname; } catch { return; }
        if (own.has(host) || hits.some(h => h.url === url)) return;
        hits.push({ title: clip(title, 160), url: url.slice(0, 400), snippet: clip(snippet, 400) });
      };
      if (engine === 'duckduckgo') {
        for (const r of document.querySelectorAll('.result, .web-result')) {
          if (r.classList.contains('result--ad')) continue;
          const a = r.querySelector('a.result__a') as HTMLAnchorElement | null;
          if (a) add(a.textContent ?? '', a.href, r.querySelector('.result__snippet')?.textContent ?? '');
        }
      } else if (engine === 'bing') {
        for (const r of document.querySelectorAll('li.b_algo')) {
          const a = r.querySelector('h2 a') as HTMLAnchorElement | null;
          if (a) add(a.textContent ?? '', a.href, r.querySelector('.b_caption p, .b_lineclamp2, p')?.textContent ?? '');
        }
      } else {
        for (const h of document.querySelectorAll('a h3')) {
          const a = h.closest('a') as HTMLAnchorElement | null;
          if (!a) continue;
          const card = a.closest('[data-hveid], .g, .MjjYud') ?? a.parentElement?.parentElement;
          const snip = card?.querySelector('.VwiC3b, [data-sncf], .lEBKkf, span.aCOpRe')?.textContent ?? '';
          add(h.textContent ?? '', a.href, snip);
        }
      }
      if (!hits.length) {
        // Any engine or layout: a link with a heading inside it and an address that leaves the engine.
        for (const a of document.querySelectorAll('a[href]')) {
          const h = a.querySelector('h1,h2,h3,h4');
          if (h) add(h.textContent ?? '', (a as HTMLAnchorElement).href, '');
        }
      }
      return { hits: hits.slice(0, cap) };
    },

    extractCards(cards: string, fields: Record<string, string>, maxRows?: number) {
      const cap = Math.max(1, Math.min(maxRows ?? 5000, 50000));
      const clip = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 300);
      const names = Object.keys(fields).slice(0, 40);
      const rows: string[][] = [];
      const links: Array<[number, number, string]> = [];
      let list: Element[] = [];
      try { list = [...document.querySelectorAll(cards)]; } catch { return { name: `cards "${cards}"`, kind: 'list' as const, columns: names, rows: [], statedTotal: undefined }; }
      for (const card of list.slice(0, cap)) {
        const r = names.map((n, c) => {
          const [sel, attr] = String(fields[n]).split('@');
          let el: Element | null = null;
          try { el = sel ? card.querySelector(sel) : card; } catch { el = null; }
          if (!el) return '';
          if (attr) return clip(el.getAttribute(attr) ?? '');
          const a = el.closest('a[href]') ?? el.querySelector('a[href]');
          if (a) { const href = (a as HTMLAnchorElement).href; if (/^https?:/.test(href)) links.push([rows.length, c, href]); }
          return clip((el as HTMLElement).innerText ?? el.textContent ?? '');
        });
        if (r.some(x => x)) rows.push(r);
      }
      return { name: `cards "${cards}"`, kind: 'list' as const, columns: names, rows, ...(links.length ? { links } : {}), ...(list.length > rows.length && list.length > cap ? { moreBelow: true } : {}) };
    },

    extractRows(scope?: string, maxRows?: number) {
      const cap = Math.max(1, Math.min(maxRows ?? 5000, 50000));
      const clip = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 300);
      const shown = (el: Element) => typeof (el as any).checkVisibility === 'function' ? (el as any).checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true }) : (el as HTMLElement).getClientRects().length > 0;
      let root: ParentNode = document;
      let only: Element | null = null;
      if (scope) {
        const want = scope.toLowerCase();
        const boxes = [...document.querySelectorAll('form,dialog,[role=dialog],[role=region],[role=group],section,article,main,table,[role=table],[role=grid]')];
        const hit = boxes.find(b => shown(b) && (b.getAttribute('aria-label') || b.querySelector(':scope > caption,:scope > h1,:scope > h2,:scope > h3,:scope > header')?.textContent || '').toLowerCase().includes(want));
        if (!hit) return [];
        root = hit;
        if (hit.matches('table,[role=table],[role=grid],[role=treegrid]')) only = hit;
      }
      const nameOf = (el: Element) => {
        const own = el.getAttribute('aria-label') || (el.querySelector(':scope > caption')?.textContent ?? '');
        if (own.trim()) return clip(own);
        const lab = el.getAttribute('aria-labelledby');
        if (lab) { const t = document.getElementById(lab)?.textContent; if (t) return clip(t); }
        let n: Element | null = el;
        for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
          let p = n.previousElementSibling;
          for (let k = 0; k < 4 && p; k++, p = p.previousElementSibling) if (/^H[1-6]$/.test(p.tagName)) return clip(p.textContent ?? '');
        }
        return '';
      };
      const scrolling = (el: Element) => { let n: Element | null = el.parentElement; for (let i = 0; i < 6 && n; i++, n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 4 && n.scrollTop + n.clientHeight < n.scrollHeight - 4) return true; } return false; };
      const out: ExtractedTable[] = [];
      const cellText = (c: Element) => clip((c as HTMLElement).innerText ?? c.textContent ?? '');
      const grids = only ? [only] : [...root.querySelectorAll('table,[role=table],[role=grid],[role=treegrid]')].filter(e => shown(e) && !e.parentElement?.closest('table,[role=table],[role=grid],[role=treegrid]'));
      for (const t of grids) {
        const isTable = t.tagName === 'TABLE';
        const rowEls = isTable ? [...t.querySelectorAll(':scope > thead > tr,:scope > tbody > tr,:scope > tfoot > tr,:scope > tr')] : [...t.querySelectorAll('[role=row]')];
        if (rowEls.length < 2) continue;
        const cellsOf = (r: Element) => [...r.children].filter(c => /^(TD|TH)$/.test(c.tagName) || /^(cell|gridcell|columnheader|rowheader)$/.test(c.getAttribute('role') ?? ''));
        let header: Element | null = rowEls.find(r => cellsOf(r).length && cellsOf(r).every(c => c.tagName === 'TH' || c.getAttribute('role') === 'columnheader')) ?? null;
        const body = rowEls.filter(r => r !== header);
        if (!header && body.length) header = null;
        const cols = header ? cellsOf(header).map(cellText) : [];
        const rows: string[][] = [];
        const links: Array<[number, number, string]> = [];
        let merged = 0;
        for (const r of body) {
          if (rows.length >= cap) break;
          const cs = cellsOf(r);
          if (!cs.length) continue;
          const row = cs.map(cellText);
          cs.forEach((c, k) => {
            if ((c as HTMLTableCellElement).colSpan > 1 || (c as HTMLTableCellElement).rowSpan > 1) merged++;
            const a = c.querySelector('a[href]') as HTMLAnchorElement | null;
            if (a && /^https?:/.test(a.href)) links.push([rows.length, k, a.href.slice(0, 300)]);
          });
          rows.push(row);
        }
        if (!rows.length) continue;
        const stated = Number(t.getAttribute('aria-rowcount'));
        const width = Math.max(...rows.map(r => r.length));
        const columns = cols.length ? cols.map((c, k) => c || `col${k + 1}`) : Array.from({ length: width }, (_, k) => `col${k + 1}`);
        out.push({ name: nameOf(t), kind: isTable ? 'table' : 'grid', columns, rows, ...(links.length ? { links: links.slice(0, 2000) } : {}), ...(stated > rows.length + (header ? 1 : 0) ? { statedTotal: stated - (header ? 1 : 0) } : {}), ...(scrolling(t) || (stated > rows.length + 1) ? { moreBelow: true } : {}), ...(merged ? { merged } : {}) });
      }
      // Repeated lists: a list (or ARIA list) of at least three items, each with text (a result list, a feed of cards).
      for (const l of only ? [] : root.querySelectorAll('ul,ol,[role=list]')) {
        if (!shown(l) || l.closest('nav,table,[role=navigation],[role=menu],[role=listbox]')) continue;
        const items = [...l.children].filter(c => c.tagName === 'LI' || c.getAttribute('role') === 'listitem');
        if (items.length < 3) continue;
        const texts = items.map(cellText);
        if (texts.filter(t => t.length > 3).length < 3 || texts.every(t => t.length < 12)) continue;
        const rows = texts.slice(0, cap).map(t => [t]);
        const links: Array<[number, number, string]> = [];
        items.slice(0, cap).forEach((it, i) => { const a = it.querySelector('a[href]') as HTMLAnchorElement | null; if (a && /^https?:/.test(a.href)) links.push([i, 0, a.href.slice(0, 300)]); });
        out.push({ name: nameOf(l), kind: 'list', columns: ['text'], rows, ...(links.length ? { links: links.slice(0, 2000) } : {}), ...(scrolling(l) ? { moreBelow: true } : {}) });
      }
      // Repeated cards (search results, a directory, product tiles): siblings that share a tag and class, at least four, each with a link and some text.
      const seen = new Set<Element>();
      let found = 0;
      for (const parent of only ? [] : root.querySelectorAll('div,section,main,article,ul,ol')) {
        if (found >= 3 || !shown(parent) || parent.closest('nav,header,footer,table,[role=navigation],[role=menu],[role=listbox]')) continue;
        const kids = [...parent.children].filter(c => !seen.has(c));
        if (kids.length < 4) continue;
        const sig = (c: Element) => `${c.tagName}.${[...c.classList].sort().join('.')}`;
        const groups = new Map<string, Element[]>();
        for (const c of kids) { const g = groups.get(sig(c)); if (g) g.push(c); else groups.set(sig(c), [c]); }
        const best = [...groups.values()].sort((x, y) => y.length - x.length)[0]!;
        if (best.length < 4 || best[0]!.tagName === 'LI' || best[0]!.tagName === 'TR') continue;
        const cards = best.filter(c => shown(c) && c.querySelector('a[href]') && cellText(c).length >= 20);
        if (cards.length < Math.max(4, best.length * 0.6)) continue;
        cards.forEach(c => seen.add(c));
        const rows: string[][] = [];
        const links: Array<[number, number, string]> = [];
        for (const c of cards.slice(0, cap)) {
          const head = c.querySelector('h1,h2,h3,h4,h5,h6,[role=heading],strong') ?? c.querySelector('a[href]');
          const a = (head?.closest('a[href]') ?? head?.querySelector?.('a[href]') ?? c.querySelector('a[href]')) as HTMLAnchorElement | null;
          if (a && /^https?:/.test(a.href)) links.push([rows.length, 0, a.href.slice(0, 300)]);
          rows.push([clip(head?.textContent ?? ''), cellText(c)]);
        }
        out.push({ name: nameOf(parent), kind: 'list', columns: ['title', 'text'], rows, ...(links.length ? { links: links.slice(0, 2000) } : {}), ...(scrolling(parent) ? { moreBelow: true } : {}) });
        found++;
      }
      return out;
    },

    formModel(scope?: string) {
      const SEL = 'input,select,textarea,[role=combobox],[role=textbox],[role=checkbox],[role=radio],[role=switch],[role=slider],[role=spinbutton],[role=listbox],[contenteditable=""],[contenteditable=true]';
      const clip = (t: string, n: number) => t.replace(/\s+/g, ' ').trim().slice(0, n);
      const shown = (el: Element) => typeof (el as any).checkVisibility === 'function' ? (el as any).checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true }) : (el as HTMLElement).getClientRects().length > 0;
      let root: ParentNode = document;
      if (scope) {
        const want = scope.toLowerCase();
        const boxes = [...document.querySelectorAll('form,dialog,[role=dialog],[role=form],[role=region],[role=group],[role=radiogroup],fieldset,section')];
        const hit = boxes.find(b => {
          const label = b.getAttribute('aria-label') || (b.querySelector(':scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > header')?.textContent ?? '') || (b.getAttribute('aria-labelledby') ? (document.getElementById(b.getAttribute('aria-labelledby')!)?.textContent ?? '') : '');
          return label.toLowerCase().includes(want) && shown(b);
        });
        if (!hit) return [];
        root = hit;
      }
      const out: FormField[] = [];
      for (const el of root.querySelectorAll(SEL)) {
        const input = el as HTMLInputElement;
        const type = el.tagName === 'INPUT' ? (input.type || 'text').toLowerCase() : '';
        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type) || !shown(el)) continue;
        const tag = el.tagName;
        const role = el.getAttribute('role') || (tag === 'SELECT' ? ((el as unknown as HTMLSelectElement).multiple ? 'listbox' : 'combobox') : tag === 'TEXTAREA' ? 'textbox' : type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : type === 'range' ? 'slider' : type === 'number' ? 'spinbutton' : 'textbox');
        const secret = type === 'password' || type === 'file' || /cc-|one-time-code/.test((input.autocomplete || '').toLowerCase()) || /card|cvv|cvc|iban|ssn|passw|otp/i.test(`${input.name} ${input.id}`);
        const f: FormField = { role, name: clip(nameOf(el), 80) };
        if (type && type !== 'text' && type !== 'checkbox' && type !== 'radio') f.type = type;
        const grp = el.closest('fieldset,[role=radiogroup],[role=group]');
        if (grp) { const g = clip(grp.getAttribute('aria-label') || grp.querySelector('legend')?.textContent || '', 60); if (g) f.group = g; }
        if (input.required || el.getAttribute('aria-required') === 'true') f.required = true;
        if (disabledByAncestor(el)) f.disabled = true;
        if (type === 'checkbox' || type === 'radio' || role === 'checkbox' || role === 'radio' || role === 'switch') f.checked = type ? input.checked : el.getAttribute('aria-checked') === 'true';
        else if (secret) f.value = '(hidden)';
        else if (tag === 'SELECT') {
          const s = el as unknown as HTMLSelectElement;
          f.options = [...s.options].slice(0, 40).map(o => clip(o.text, 50));
          f.value = [...s.selectedOptions].map(o => clip(o.text, 50)).join(', ');
        } else if (role === 'slider' || role === 'spinbutton' || tag === 'INPUT' || tag === 'TEXTAREA') f.value = clip(input.value ?? '', 80);
        else f.value = clip((el as HTMLElement).innerText || '', 80);
        const listId = el.getAttribute('list');
        const list = listId ? document.getElementById(listId) : null;
        if (list) f.options = [...list.querySelectorAll('option')].slice(0, 40).map(o => clip((o as HTMLOptionElement).value || o.textContent || '', 50));
        const bad = (input as any).validationMessage || (el.getAttribute('aria-invalid') === 'true' ? 'invalid' : '');
        if (bad && (input.value || el.getAttribute('aria-invalid') === 'true')) f.error = clip(bad, 80);
        out.push(f);
        if (out.length >= 150) break;
      }
      return out;
    },

    startDemo() {
      demo = [];
      return true;
    },

    stopDemo() {
      const out = demo ?? [];
      demo = null;
      return out;
    },

    state(el: Element) {
      const tag = el.tagName.toLowerCase();
      const input = el as HTMLInputElement;
      const type = tag === 'input' ? (input.type || 'text').toLowerCase() : '';
      const textInput =
        tag === 'textarea' ||
        (tag === 'input' &&
          !['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'hidden', 'range', 'color'].includes(
            type,
          ));
      const contentEditable = (el as HTMLElement).isContentEditable === true;
      const enabled = !disabledByAncestor(el);
      const readOnly = textInput && (input.readOnly || el.getAttribute('aria-readonly') === 'true');
      const editable = enabled && ((textInput && !readOnly) || contentEditable);
      let checked: boolean | 'mixed' | null = null;
      if (tag === 'input' && (type === 'checkbox' || type === 'radio'))
        checked = input.indeterminate ? 'mixed' : input.checked;
      else if (el.hasAttribute('aria-checked')) {
        const a = el.getAttribute('aria-checked');
        checked = a === 'mixed' ? 'mixed' : a === 'true';
      }
      let value: string | null = null;
      if (tag === 'input' || tag === 'textarea' || tag === 'select') value = (el as HTMLInputElement).value;
      else if (contentEditable) value = (el as HTMLElement).innerText;
      // visibility: hidden counts as not visible; opacity 0 does not (Playwright's rule).
      const visible =
        typeof (el as any).checkVisibility === 'function'
          ? (el as any).checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
          : true;
      return {
        connected: el.isConnected,
        tag,
        type,
        role: el.getAttribute('role') ?? '',
        visible,
        enabled,
        editable,
        contentEditable,
        checked,
        value,
        inShadow: el.getRootNode() instanceof ShadowRoot,
        autocomplete: (el.getAttribute('autocomplete') ?? '').toLowerCase(),
        name: el.getAttribute('name') ?? '',
        id: el.id,
        multiple: tag === 'select' && (el as HTMLSelectElement).multiple,
        focused: (() => {
          let a: Element | null = document.activeElement;
          while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
          // Closed roots hide their active element from shadowRoot; compare through the target's own root too.
          const own = el.getRootNode() as Document | ShadowRoot;
          return a === el || own.activeElement === el;
        })(),
      };
    },

    /**
     * A native select: each requested value matches an option by value, then by label, then by normalized text. None is
     * NO_SUCH_OPTION, several is AMBIGUOUS_OPTION; both list the options and change nothing. Otherwise the options are
     * selected and input and change are dispatched.
     */
    selectOption(el: Element, values: string[]) {
      const select = el as HTMLSelectElement;
      const options = [...select.options];
      const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      const listing = options.map(o => ({ index: o.index, value: o.value, label: o.label }));
      const picked: HTMLOptionElement[] = [];
      for (const value of values) {
        let matches = options.filter(o => o.value === value);
        if (!matches.length) matches = options.filter(o => o.label === value);
        if (!matches.length) matches = options.filter(o => norm(o.text) === norm(value));
        if (!matches.length)
          return { ok: false, error: 'NO_SUCH_OPTION' as const, options: listing, selected: [], problem: value };
        if (matches.length > 1)
          return { ok: false, error: 'AMBIGUOUS_OPTION' as const, options: listing, selected: [], problem: value };
        picked.push(matches[0]);
      }
      if (!select.multiple && picked.length > 1) {
        return {
          ok: false,
          error: 'AMBIGUOUS_OPTION' as const,
          options: listing,
          selected: [],
          problem: values.join(', '),
        };
      }
      // What was asked for is read before the events: a change handler may rewrite the option itself.
      const requested = picked.map(o => ({ index: o.index, value: o.value, label: o.label }));
      for (const o of options) o.selected = picked.includes(o);
      select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        ok: true,
        options: listing,
        selected: [...select.selectedOptions].map(o => o.label),
        requested,
      };
    },

    /** Whether the element is a file input, and what it takes. */
    fileInputFacts(el: Element) {
      const input = el as HTMLInputElement;
      const isFileInput = el instanceof HTMLInputElement && input.type === 'file';
      return {
        isFileInput,
        multiple: isFileInput && input.multiple,
        accept: isFileInput ? input.accept : '',
        disabled: isFileInput && input.disabled,
      };
    },

    /** Holds one base64 chunk of a file: a large file arrives in several calls. */
    fileChunk(_el: Element, key: string, chunk: string) {
      const chunks = fileChunks.get(key) ?? [];
      chunks.push(chunk);
      fileChunks.set(key, chunks);
      return chunks.reduce((n, c) => n + c.length, 0);
    },

    /**
     * Builds the files from their chunks, puts them in the input through a DataTransfer and dispatches input and
     * change, as a user's choice would. Returns what the input then holds.
     */
    setFiles(el: Element, specs: Array<{ key: string; name: string; mimeType: string }>) {
      const input = el as HTMLInputElement;
      const transfer = new DataTransfer();
      for (const spec of specs) {
        const binary = atob((fileChunks.get(spec.key) ?? []).join(''));
        fileChunks.delete(spec.key);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        transfer.items.add(new File([bytes], spec.name, { type: spec.mimeType }));
      }
      input.files = transfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return [...(input.files ?? [])].map(f => ({ name: f.name, size: f.size, type: f.type }));
    },

    /** The files a file input holds, for the read-back. */
    fileList(el: Element) {
      return [...((el as HTMLInputElement).files ?? [])].map(f => ({ name: f.name, size: f.size, type: f.type }));
    },

    /** A select's selected options, by index and value, for the read-back after settle. */
    selectedOptions(el: Element) {
      return [...((el as HTMLSelectElement).selectedOptions ?? [])].map(o => ({
        index: o.index,
        value: o.value,
        label: o.label,
      }));
    },

    /** Counts mutations inside the target's enclosing block (evidence version 1). */
    watchBlock(el: Element) {
      blockObserver?.disconnect();
      blockCount = 0;
      let block: Element | null = el.closest(BLOCKS);
      if (!block) {
        const root = el.getRootNode();
        block = root instanceof ShadowRoot ? root.host : document.body;
      }
      blockObserver = new MutationObserver(records => {
        blockCount += records.length;
      });
      blockObserver.observe(block ?? document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      return api.describe(block ?? document.documentElement);
    },

    blockMutations() {
      return blockCount;
    },

    /**
     * Where the element would navigate: the href of the link it is or sits inside (javascript: links do not
     * navigate), the formaction of a submit button with a form owner, or, for Enter in a field, its form's action.
     */
    navigationTarget(el: Element, mode: 'activate' | 'enter') {
      for (let n: Node | null = el; n; n = composedParent(n)) {
        if (n.nodeType !== 1) continue;
        const e = n as HTMLAnchorElement;
        if ((e.tagName === 'A' || e.tagName === 'AREA') && e.hasAttribute('href')) {
          const url = e.href;
          if (url.toLowerCase().startsWith('javascript:')) return null;
          return { kind: 'link' as const, url, method: 'GET', newTab: !!e.target && e.target !== '_self' };
        }
      }
      const control = el as HTMLButtonElement;
      const form = (control as any).form as HTMLFormElement | null | undefined;
      if (!form) return null;
      const submitter = isSubmitterEl(el);
      if (mode === 'activate' && !submitter) return null;
      // Enter in a field submits through the default button, whose formaction, formmethod and formtarget apply.
      const via = (submitter ? el : mode === 'enter' ? enterButtonOf(el, form) : undefined) as
        HTMLButtonElement | undefined;
      // formAction reflects the document URL when the attribute is absent, so read it only when it is set.
      const url = via?.hasAttribute('formaction') ? via.formAction : formProp(form, 'action');
      const method = (via?.getAttribute('formmethod') || formProp(form, 'method') || 'get').toUpperCase();
      const target = via?.getAttribute('formtarget') || formProp(form, 'target');
      return { kind: 'form' as const, url, method, newTab: !!target && target !== '_self' };
    },

    /** The default button of the element's form owner (its first submit button in tree order), for its AX name. */
    defaultButtonOf(el: Element) {
      const owner = (el as any).form as HTMLFormElement | null | undefined;
      return owner ? (enterButtonOf(el, owner) ?? null) : null;
    },

    /**
     * The name the classifier falls back on when Chrome gives the element none because it is left out of the
     * accessibility tree (aria-hidden): hiding a control from accessibility does not hide its name from the gate.
     */
    approximateName(el: Element) {
      return nameOf(el);
    },

    /** Facts the confirmation gate's classifier needs about the element and its form owner. */
    formFacts(el: Element) {
      const tag = el.tagName.toLowerCase();
      const type = ((el as HTMLInputElement).type ?? '').toLowerCase();
      const testIds = ['data-testid', 'data-test', 'data-qa', 'data-test-id']
        .map(a => el.getAttribute(a) ?? '')
        .join(' ');
      const classes = `${typeof el.className === 'string' ? el.className : ''} ${testIds} ${el.id}`.trim();
      const DATES = ['date', 'month', 'week', 'time', 'datetime-local'];
      const owner = (el as any).form as HTMLFormElement | null | undefined;
      const field = (tag === 'input' && [...BLOCKING, ...DATES].includes(type || 'text')) || tag === 'select';
      let form: FormFacts['form'] = null;
      if (owner) {
        const elements = [...formProp(owner, 'elements')] as Element[];
        const fieldEls = elements.filter(
          e =>
            ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) &&
            !['hidden', 'submit', 'image', 'button', 'reset'].includes((e as HTMLInputElement).type),
        );
        const blocking = elements.filter(isTextField);
        const submitters = submittersOf(owner);
        const first = enterButtonOf(el, owner) as HTMLButtonElement | HTMLInputElement | undefined;
        // The submission's method and address are the submitter's: the element itself when it is a submit button,
        // otherwise the default button, through which Enter submits. Its formmethod and formaction override the
        // form's (a "Continue" button with formmethod="post" in a GET form posts).
        const via = (isSubmitterEl(el) ? el : first) as HTMLButtonElement | HTMLInputElement | undefined;
        const method = (via?.getAttribute('formmethod') || formAttr(owner, 'method') || 'get').toLowerCase();
        const action = via?.hasAttribute('formaction') ? via.formAction : formProp(owner, 'action');
        const search =
          method === 'get' &&
          (formAttr(owner, 'role') === 'search' ||
            !!owner.closest('[role=search], search') ||
            elements.some(e => e.tagName === 'INPUT' && (e as HTMLInputElement).type === 'search'));
        form = {
          method,
          action,
          search,
          fields: fieldEls.length,
          blockingFields: blocking.length,
          hasSubmitButton: submitters.length > 0,
          defaultButton: first ? { name: nameOf(first), disabled: first.matches(':disabled') } : null,
        };
      }
      // A money amount: a number with a currency sign before it or a currency code or word after it.
      const findMoney = (text: string): string => {
        const signs = '$€£¥￥₹₩';
        const codes = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'RMB', '元', '円'];
        const number = '\\d[\\d.,]*';
        const before = new RegExp(`[${signs}]\\s?${number}`);
        const after = new RegExp(`${number}\\s?(?:${codes.join('|')})`, 'i');
        return (before.exec(text) ?? after.exec(text))?.[0] ?? '';
      };
      let money = '';
      // Only the element and its parent: a wider container picks up amounts that belong to something else.
      for (const box of [el, el.parentElement]) {
        if (!money && box) money = findMoney(((box as HTMLElement).innerText ?? '').trim());
      }
      const html = el as HTMLElement;
      const textEntry =
        tag === 'textarea' ||
        html.isContentEditable === true ||
        (tag === 'input' && [...BLOCKING, ''].includes(type) && type !== 'password');
      const role = (el.getAttribute('role') ?? '').toLowerCase();
      const words = [el.getAttribute('name'), el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.id]
        .filter(Boolean)
        .join(' ');
      const searchField =
        type === 'search' ||
        role === 'searchbox' ||
        role === 'combobox' ||
        !!el.closest('[role=search], search') ||
        /\b(search|query|find|lookup)\b|^q$|搜索|查找|検索/i.test(words);
      return {
        tag,
        type,
        classes,
        textEntry,
        searchField,
        isLink: !!el.closest('a[href], area[href]'),
        submitter: isSubmitterEl(el) && !!owner,
        field,
        form,
        money,
      };
    },

    /** The first rendered label of a checkbox or radio (a wrapping label, or one whose for names it). */
    labelFor(input: Element) {
      const labels = [...((input as HTMLInputElement).labels ?? [])];
      return labels.find(l => l.getClientRects().length > 0 && l.getBoundingClientRect().width > 0) ?? null;
    },

    /**
     * A point in the label, as fractions of its box, where a click activates the input: the hit rule must accept
     * it, so it is never on a link, button or other control inside the label.
     */
    labelPoint(input: Element) {
      const label = api.labelFor(input);
      if (!label) return null;
      const r = label.getBoundingClientRect();
      const roots = rootsOf(label);
      for (const fy of [0.5, 0.3, 0.7]) {
        for (const fx of [0.5, 0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9, 0.05, 0.95]) {
          const hit = deepElementFromPoint(r.left + fx * r.width, r.top + fy * r.height, roots);
          if (hit && api.hitAccepts(input, hit).accepted) return { fx, fy };
        }
      }
      return null;
    },

    /** Alert and live-region text, validation messages and open dialogs or modal layers (evidence version 2). */
    pageFacts() {
      const text = (el: Element) => shownText(el, 120);
      const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
      const alerts = [
        ...document.querySelectorAll('[role=alert], [role=status], [aria-live=assertive], [aria-live=polite], output'),
      ]
        .filter(visible)
        .map(text)
        .filter(Boolean);
      const invalid = [...document.querySelectorAll(':invalid')]
        .filter(el => 'validationMessage' in el && (el as HTMLInputElement).validationMessage && el.tagName !== 'FORM')
        .map(el => (el as HTMLInputElement).validationMessage);
      const layers = [
        ...document.querySelectorAll('dialog[open], [role=dialog], [role=alertdialog], [aria-modal=true]'),
      ]
        .filter(visible)
        .map(
          el =>
            `${el.getAttribute('role') ?? el.tagName.toLowerCase()} "${el.getAttribute('aria-label') ?? shownText(el, 60)}"`,
        );
      return { alerts, invalid, layers };
    },

    /**
     * The record context check: is the target still inside the container, and what is the container's text: its digest,
     * compared and never printed, and the text a message may quote (`shownText`).
     */
    contextOf(container: Element, target: Element) {
      let inside = false;
      for (let n: Node | null = target; n; n = composedParent(n)) if (n === container) inside = true;
      return { inside, text: api.textDigest(container, 2000), shown: shownText(container, 80) };
    },

    /** The focused element of this document, through open and closed shadow roots it can reach. */
    focused() {
      let a: Element | null = document.activeElement;
      while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
      return a;
    },

    /** This document has focus and no element in it does (keys go to the body). */
    documentFocused() {
      const active = document.activeElement;
      return document.hasFocus() && (!active || active === document.body || active === document.documentElement);
    },

    /** The focused element inside a shadow root, closed ones included (the controller resolves the root). */
    activeIn(root: Node) {
      return (root as ShadowRoot).activeElement ?? null;
    },

    /** Whether the page's visible text contains `text` (whitespace collapsed, case ignored: a model paraphrasing the capitalisation of a status must not read as a failed action). */
    reading(el: Element) {
      const v = (el as HTMLInputElement).value;
      if (typeof v === 'string' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return v.slice(0, 400);
      const h = el as HTMLElement;
      return String(h.innerText ?? el.textContent ?? '').slice(0, 400);
    },

    attribute(el: Element, name: string) {
      const v = el.getAttribute(name);
      return v === null ? null : v.slice(0, 200);
    },

    hasText(text: string, fields?: boolean) {
      const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
      let hay = norm(document.body?.innerText ?? '');
      // What is typed into a form field is on the page too (an email, a bio, a saved reply), yet innerText never contains it. Only for a check that something IS there; never passwords or hidden fields.
      if (fields) {
        for (const el of Array.from(document.querySelectorAll('input, textarea'))) {
          const f = el as HTMLInputElement;
          if (['password', 'hidden', 'file'].includes(f.type) || typeof f.value !== 'string' || !f.value) continue;
          hay += ' ' + norm(f.value.slice(0, 2000));
        }
      }
      const want = norm(text);
      const has = (w: string) => hay.includes(w) || hay.replace(/\s+/g, '').includes(w.replace(/\s+/g, ''));
      // A value split across separate elements (a name and its phone number in two cells) reads run together to a model: also compare with all whitespace removed (Browser Agent verify.ts textPresentIn).
      // A model quoting a value out of a sentence often keeps the sentence's full stop or comma ("write to hello@x.test."): the value is there without it.
      return has(want) || (/[.,;:!?]$/.test(want) && has(want.replace(/[.,;:!?]+$/, '')));
    },

    /** Selects the whole content of a focused field or editor, so the next insertion replaces it. */
    selectContents(el: Element) {
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        try {
          (el as HTMLInputElement).select();
          return true;
        } catch {
          return false;
        }
      }
      const selection = (el.getRootNode() as Document).getSelection?.() ?? document.getSelection();
      if (!selection) return false;
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    },

    /** Date, time, colour and range inputs: the native prototype value setter, then input and change. */
    setNativeValue(el: Element, value: string) {
      const proto = Object.getPrototypeOf(el);
      const setter =
        Object.getOwnPropertyDescriptor(proto, 'value')?.set ??
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return (el as HTMLInputElement).value;
    },

    /**
     * The text digest: descendant text nodes in tree order, excluding shadow trees and frame content, whitespace
     * collapsed, first `max` characters (80 by default).
     */
    textDigest(el: Element, max = 80) {
      let out = '';
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      // Whitespace is collapsed as text is added, and reading stops once more than `max` characters are held: the
      // same steps as the capture's digest (`digestOf` in layout.ts), so indentation cannot make the two differ.
      for (let n = walker.nextNode(); n && out.length <= max; n = walker.nextNode())
        out = (out + (n.nodeValue ?? '')).replace(/\s+/g, ' ').trimStart();
      return out.trim().slice(0, max);
    },

    /**
     * What a layout ref's name can come from besides its text: its `aria-label`, `aria-labelledby` and `title`
     * attributes as written, and the text digests of a field's labels, sorted. One definition, shared with capture
     * (`nameSources` in layout.ts); fields separated by U+001F.
     */
    nameSources(el: Element) {
      const attrs = ['aria-label', 'aria-labelledby', 'title'].map(a => el.getAttribute(a) ?? '');
      const labelled = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
        ? [...((el as HTMLInputElement).labels ?? [])].map(l => api.textDigest(l)).sort()
        : [];
      return [...attrs, ...labelled].join('\u001f');
    },

    mutations() {
      return mutationCount;
    },

    /** The hit rule: whether a hit-test result counts as a hit on the target. */
    hitAccepts(target: Element, hit: Node) {
      // A hit inside the target is accepted unless it is on a separate control inside it: that control would take
      // the click, and nobody classified it.
      let nested: Element | null = null;
      for (let n: Node | null = hit; n; n = composedParent(n)) {
        if (n === target) {
          return nested ? { accepted: false, kind: 'nested' as const } : { accepted: true, kind: 'inside' as const };
        }
        if (n.nodeType === 1) {
          const el = n as Element;
          if (!nested && el.matches(NESTED_CONTROL) && !(el as HTMLElement).isContentEditable) nested = el;
        }
        if (n.parentNode instanceof ShadowRoot) nested = null;
      }
      // A label whose control is the target activates it, unless the hit is on interactive content in the label.
      for (let n: Node | null = hit; n; n = composedParent(n)) {
        if (n.nodeType !== 1) continue;
        const el = n as Element;
        if (el.tagName === 'LABEL') {
          if ((el as HTMLLabelElement).control === target) return { accepted: true, kind: 'label' as const };
          break;
        }
        if (el.matches(INTERACTIVE)) break;
      }
      for (let n: Node | null = target; n; n = composedParent(n)) {
        if (n === hit) return { accepted: false, kind: 'ancestor' as const };
      }
      return { accepted: false, kind: 'other' as const };
    },

    /**
     * The dispatch-time guard. Listens on the window in the capture phase; when the trusted press arrives it re-applies
     * the hit rule at the event's coordinates. A failed check cancels the press and every later event of the sequence,
     * so no page handler runs and no default action happens.
     * In text mode it checks that every key and insertion of the sequence goes to the target, since a page handler
     * can move focus between two keys. Keys go to the element that has focus, so only the target itself is accepted:
     * a control inside it (a button in an editor) is another element, which nothing classified.
     */
    armGuard(target: Element, mode: 'pointer' | 'text', lifetimeMs = 4000, unfocused = false) {
      guard?.remove();
      const roots = rootsOf(target);
      // The document guard's target is the body: no focused element at all also counts as the body.
      const accepts = (hit: Element | null) =>
        hit === target || (unfocused && (!hit || hit === document.documentElement));
      const report: GuardReport =
        mode === 'text'
          ? { verdict: 'none', hit: '', seen: [], accepted: 0, strayKeyups: 0 }
          : { verdict: 'none', hit: '', seen: [], accepted: 0 };
      const cancel = (e: Event) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      const handler = (e: Event) => {
        if (!e.isTrusted) return;
        note(report, e.type);
        if (report.verdict === 'cancelled') return cancel(e);
        let hit: Element | null = null;
        if (mode === 'pointer') {
          if (!PRESSES.includes(e.type)) return;
          const m = e as MouseEvent;
          hit = deepElementFromPoint(m.clientX, m.clientY, roots);
        } else {
          hit = deepActiveElement(roots);
        }
        const accepted = mode === 'pointer' ? !!hit && api.hitAccepts(target, hit).accepted : accepts(hit);
        if (accepted) {
          report.verdict = 'passed';
          // Keys and insertions the target took, or, for the pointer, presses (each press is checked).
          if (mode === 'pointer' || e.type === 'keydown' || e.type === 'beforeinput') report.accepted!++;
          return;
        }
        // A keyup elsewhere follows a key the target accepted, whose default action moved focus (Tab, a
        // submission): withheld from the page, but not a failure. Any other event elsewhere cancels the sequence.
        if (mode === 'text' && e.type === 'keyup') {
          report.strayKeyups!++;
          return cancel(e);
        }
        report.verdict = 'cancelled';
        report.hit = hit ? api.describe(hit) : 'nothing';
        cancel(e);
      };
      install(
        mode === 'pointer' ? POINTER_EVENTS : TEXT_EVENTS,
        handler,
        lifetimeMs,
        report,
        mode === 'text' ? { target, roots, accepts } : undefined,
      );
    },

    /**
     * The text guard for keys sent with nothing focused: they go to the body, and must keep going there; a page that
     * moves focus to a control gets none of them.
     */
    armDocumentGuard(lifetimeMs = 4000) {
      api.armGuard(document.body ?? document.documentElement, 'text', lifetimeMs, true);
    },

    /**
     * In every frame other than the target's, during a key sequence: a correctly routed key never arrives here, so
     * any key or insertion is cancelled (a stray keyup is withheld, as in the text guard). Focus moved by the page into
     * another frame, out-of-process ones included, then gets none of the text.
     */
    armAwayGuard(lifetimeMs = 4000) {
      guard?.remove();
      const report: GuardReport = { verdict: 'none', hit: '', seen: [], strayKeyups: 0 };
      const handler = (e: Event) => {
        if (!e.isTrusted) return;
        note(report, e.type);
        if (report.verdict === 'none' && e.type !== 'keyup') {
          report.verdict = 'cancelled';
          report.hit = document.activeElement ? api.describe(document.activeElement) : 'nothing';
        }
        if (report.verdict !== 'cancelled') report.strayKeyups!++;
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      install(TEXT_EVENTS, handler, lifetimeMs, report);
    },

    /**
     * Withholds every trusted event of a kind from the page: for the release of a key or a mouse button that has to be
     * sent, so the browser does not keep it down, but must not take effect. A release is what activates (a click, Space
     * on a button), and no handler and no default action runs for a cancelled one.
     */
    armBlockGuard(kind: 'pointer' | 'text', lifetimeMs = 4000) {
      guard?.remove();
      const report: GuardReport = { verdict: 'cancelled', hit: 'withheld', seen: [] };
      const handler = (e: Event) => {
        if (!e.isTrusted) return;
        note(report, e.type);
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      install(kind === 'pointer' ? POINTER_EVENTS : TEXT_EVENTS, handler, lifetimeMs, report);
    },

    /** Between two keys of a sequence: renews the text guard and says where focus is now. */
    stepGuard(lifetimeMs = 4000) {
      const g = guard;
      const copy = (r: GuardReport) => ({ ...r, seen: [...r.seen] });
      if (!g?.text) return { ...copy(lastReport), armed: false, focusOk: false, focus: '' };
      g.renew(lifetimeMs);
      const hit = deepActiveElement(g.text.roots);
      const focusOk = g.text.accepts(hit);
      return { ...copy(g.report), armed: true, focusOk, focus: hit ? api.describe(hit) : 'nothing' };
    },

    /** Renews whatever guard is armed in this world; false when none is. */
    renewGuard(lifetimeMs = 4000) {
      if (!guard) return false;
      guard.renew(lifetimeMs);
      return true;
    },

    /** In an ancestor frame of the target: a correctly routed press never arrives here, so any press is cancelled. */
    armAncestorGuard(lifetimeMs = 4000) {
      guard?.remove();
      const report: GuardReport = { verdict: 'none', hit: '', seen: [] };
      const handler = (e: Event) => {
        if (!e.isTrusted) return;
        note(report, e.type);
        if (report.verdict === 'none' && PRESSES.includes(e.type)) {
          report.verdict = 'cancelled';
          const m = e as MouseEvent;
          const hit = document.elementFromPoint(m.clientX, m.clientY);
          report.hit = hit ? api.describe(hit) : 'nothing';
        }
        if (report.verdict === 'cancelled') {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      };
      install(POINTER_EVENTS, handler, lifetimeMs, report);
    },

    readGuard() {
      return { ...lastReport, seen: [...lastReport.seen] };
    },

    disarm() {
      guard?.remove();
    },

    /** The frame's viewport in CSS pixels, scrollbars included (the layout viewport leaves them out). */
    viewport() {
      return { width: window.innerWidth, height: window.innerHeight };
    },

    /** Scroll offsets and sizes of an element, or of the document when el is null. */
    scrollInfo(el: Element | null) {
      const e = (el ?? document.scrollingElement ?? document.documentElement) as Element;
      return {
        top: e.scrollTop,
        left: e.scrollLeft,
        height: e.scrollHeight,
        width: e.scrollWidth,
        clientHeight: e.clientHeight,
        clientWidth: e.clientWidth,
      };
    },

    /** Trusted input this document received in the last `ms`, with where pointer input landed (CSS pixels of this frame). */
    recentInput(ms: number) {
      const from = Date.now() - ms;
      return recent.filter(r => r.t >= from);
    },

    /** A short description of an element for messages: tag, id, classes, role and text (`shownText`). */
    describe(node: Node) {
      const el = (node.nodeType === 1 ? node : node.parentElement) as Element | null;
      if (!el) return node.nodeName.toLowerCase();
      let out = el.tagName.toLowerCase();
      if (el.id) out += `#${el.id}`;
      const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
      if (classes.length) out += `.${classes.slice(0, 3).join('.')}`;
      const role = el.getAttribute('role');
      if (role) out += `[role=${role}]`;
      const text = shownText(el, 60);
      if (text) out += ` "${text}"`;
      return out;
    },
  };

  Object.defineProperty(g, '__nbProbe', { value: api, enumerable: false, configurable: false, writable: false });
}
