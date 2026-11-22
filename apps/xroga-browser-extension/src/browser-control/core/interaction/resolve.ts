// Resolve and revalidate a target at action time: a few CDP calls, never a snapshot.
import { LayerError } from '../../protocol/errors';
import type { Target } from '../../protocol/schemas';
import { isRefTarget, isSemanticTarget } from '../../protocol/schemas';
import type { ToolContext } from '../controller';
import type { FrameRecord } from '../ports';
import type { RefRecord } from '../refs';
import { lookupRef, shownName } from '../refs';
import { cleanText } from '../perception/ax';
import type { AXNode } from '../perception/ax';
import type { ONode } from '../perception/outline';
import type { Observation } from '../perception/observe';
import { observeTab, recentObservation, shownOf } from '../tools/observe';
import { NodeArg } from '../probe-client';
import { fingerprint } from '../hash';
import { quote } from '../text';

export interface ResolvedTarget {
  record: RefRecord;
  frame: FrameRecord;
  frames: FrameRecord[];
  /** The node in the probe's world. Release it when done. */
  objectId: string;
  /** For receipts and prompts: 'button "Delete" in row "INV-1042 Acme Corp Delete"'. */
  description: string;
  /** How the target was named, for the receipt. */
  via: 'ref' | 'semantic';
}

/** Roles of an element that stands for one record in a list or table. */
const ROW_ROLES = new Set(['listitem', 'row', 'article', 'group', 'treeitem', 'gridcell']);
/** A control whose name says it removes something: picked by position it can remove the wrong record. */
const DESTRUCTIVE_NAME = /\b(delete|remove|discard|trash|destroy|erase|archive|cancel subscription|unsubscribe)\b/i;

function walk(nodes: ONode[], visit: (n: ONode, ancestors: ONode[]) => void, ancestors: ONode[] = []): void {
  for (const n of nodes) {
    visit(n, ancestors);
    walk(n.children, visit, [...ancestors, n]);
  }
}

/**
 * A record as the observation that matched it showed it: revalidation compares with that print, not with the
 * registry's, which a later capture may have replaced.
 */
function asShown(ctx: ToolContext, observation: Observation, ref: string): RefRecord {
  const record = ctx.controller.registry.get(ref)!;
  const shown = observation.shown.get(ref);
  return shown ? { ...record, ...shown } : record;
}

/**
 * The ref of the one actionable node a semantic target names; it refuses to guess. `fresh` takes a new capture instead
 * of reusing a recent one, for `wait`, which looks for a change the page made on its own.
 */
async function resolveSemantic(
  ctx: ToolContext,
  target: { role: string; name?: string; nth?: number; within?: string },
  fresh = false,
): Promise<RefRecord> {
  const observation = fresh ? await observeTab(ctx) : await recentObservation(ctx);
  const tabId = ctx.tab().tabId;
  let roots = observation.tree;
  if (target.within) {
    const within = lookupRef(ctx.controller.registry, ctx.session.known, target.within, tabId);
    let found: ONode | undefined;
    walk(roots, n => {
      if (!found && n.frameId === within.frameId && n.backendNodeId === within.backendNodeId) found = n;
    });
    if (!found) throw new LayerError('NODE_DETACHED', `Ref ${target.within} is no longer in the page`);
    roots = found.children;
  }
  const role = target.role.toLowerCase();
  const name = target.name === undefined ? undefined : cleanText(target.name);
  const matches: ONode[] = [];
  const rowOf = new Map<ONode, string>();
  walk(roots, (n, ancestors) => {
    if (!n.ref) return;
    if (n.role.toLowerCase() !== role && n.rawRole.toLowerCase() !== role) return;
    if (name !== undefined && n.name !== name) return;
    matches.push(n);
    // The record the control belongs to: the nearest row-like ancestor's name, else the words around the control in the nearest ancestor that has any besides its own name.
    const row = [...ancestors].reverse().find(a => ROW_ROLES.has(a.role.toLowerCase()) && a.name);
    if (row) rowOf.set(n, row.name);
    else {
      for (const a of [...ancestors].reverse()) {
        const words: string[] = [];
        walk(a.children, c => { if (c.kind === 'text' && c.name && c.name !== n.name) words.push(c.name); });
        const text = cleanText(words.join(' '));
        if (text) { rowOf.set(n, text); break; }
      }
    }
  });
  const label = `${target.role}${name !== undefined ? ` ${quote(name)}` : ''}`;
  if (!matches.length) {
    // The page was just read: say at once what IS there under that name or role (a link where a heading was asked for, "Drafts 4" where "Drafts" was), so the next call
    // is aimed at a real control instead of another guess or a snapshot just to find out.
    const near = nearMisses(roots, role, name);
    throw new LayerError(
      'NO_MATCH',
      `No element matches ${label}.${near.length ? ` Nearest in the page now: ${near.map(m => `[${m.ref}] ${m.role} ${quote(m.name, 60)}`).join('; ')}. Use one of these refs, or the role and name shown.` : ''}`,
    );
  }
  // The Nth of several identically named controls is a position, not an identity: for a destructive one (delete, remove, discard...) the page may have reordered since the model last
  // looked, and the wrong record goes. Refused with each match's row, so the next call can name the row (`within`) or use a ref from the fresh list.
  if (target.nth !== undefined && matches.length > 1 && DESTRUCTIVE_NAME.test(name ?? '')) {
    const list = matches.slice(0, 10).map(m => `[${m.ref}] ${m.role} ${quote(m.name, 40)}${rowOf.get(m) ? ` in ${quote(rowOf.get(m)!, 60)}` : ''}`);
    throw new LayerError(
      'AMBIGUOUS_TARGET',
      `${matches.length} elements match ${label}, and nth is only a position: ${list.join('; ')}. For ${name ? quote(name) : 'a destructive control'} use the ref of the one in the right row.`,
    );
  }
  if (target.nth !== undefined) {
    const pick = matches[target.nth];
    if (!pick)
      throw new LayerError(
        'NO_MATCH',
        `Only ${matches.length} elements match ${label}; nth ${target.nth} does not exist`,
      );
    return asShown(ctx, observation, pick.ref!);
  }
  if (matches.length > 1) {
    const list = matches.slice(0, 10).map(m => `[${m.ref}] ${m.role} ${quote(m.name, 60)}`);
    throw new LayerError(
      'AMBIGUOUS_TARGET',
      `${matches.length} elements match ${label}: ${list.join(', ')}${matches.length > 10 ? ', …' : ''}`,
    );
  }
  return asShown(ctx, observation, matches[0].ref!);
}

/**
 * Controls that nearly match a role and name that matched nothing: the same name under another role, or a name that contains it or is contained in it
 * (case and spacing ignored), best first, at most six. Only actionable nodes are offered, since only those can be targeted by ref.
 */
export function nearMisses(roots: ONode[], role: string, name: string | undefined): ONode[] {
  const norm = (x: string) => cleanText(x).toLowerCase();
  const want = name === undefined ? undefined : norm(name);
  const scored: Array<{ n: ONode; score: number }> = [];
  walk(roots, n => {
    if (!n.ref) return;
    const sameRole = n.role.toLowerCase() === role || n.rawRole.toLowerCase() === role;
    const have = norm(n.name);
    if (want === undefined || !want) {
      if (sameRole) scored.push({ n, score: 3 });
      return;
    }
    if (!have) return;
    const exact = have === want;
    const related = exact || have.includes(want) || (have.length >= 3 && want.includes(have));
    if (!related) return;
    scored.push({ n, score: exact ? (sameRole ? 0 : 1) : sameRole ? 2 : 3 });
  });
  return scored.sort((x, y) => x.score - y.score).slice(0, 6).map(x => x.n);
}

/** 'button "Delete" in row "…"', using the last observation for the enclosing row or list item. */
export function describeTarget(ctx: ToolContext, record: RefRecord): string {
  const role = record.print.role === 'Iframe' ? 'iframe' : record.print.role;
  const name = shownName(record.print);
  let text = `${role}${name ? ` ${quote(name)}` : ''}`;
  const tree = ctx.tab().last?.observation.tree;
  if (tree) {
    walk(tree, (n, ancestors) => {
      if (n.ref !== record.ref) return;
      const row = [...ancestors]
        .reverse()
        .find(a => ['row', 'listitem', 'article', 'treeitem'].includes(a.role) && a.name);
      if (row) text += ` in ${row.role} ${quote(row.name, 60)}`;
    });
  }
  return text;
}

/**
 * Revalidation: the ref is known and was shown; its frame still has the same document; the node still resolves; and
 * Chrome's accessibility tree still gives it the role and name the agent was shown.
 */
export async function resolveTarget(
  ctx: ToolContext,
  target: Target,
  options: { fresh?: boolean } = {},
): Promise<ResolvedTarget> {
  const tab = ctx.tab();
  let record: RefRecord;
  let via: ResolvedTarget['via'];
  if (isRefTarget(target)) {
    record = lookupRef(ctx.controller.registry, ctx.session.known, target.ref, tab.tabId);
    via = 'ref';
  } else if (isSemanticTarget(target)) {
    record = await resolveSemantic(ctx, target, options.fresh);
    via = 'semantic';
  } else {
    const capability = 'selector' in target ? 'selector' : 'vision';
    throw new LayerError(
      'CAPABILITY_DISABLED',
      `This target form needs the "${capability}" capability, which this version does not have. To act at a point on a painted canvas, use the canvas tool, or click with a ref of the canvas plus \`at\` (a point inside it).`,
    );
  }
  try {
    return await resolveRecord(ctx, record, via);
  } catch (error) {
    // A ref the page has replaced (a re-render, a new document, a row that now holds another record) is still refused, as before: acting on whatever now sits there could
    // change another record. What changes is the message: it names the controls that match the old one now, with refs that can be used at once.
    if (via === 'ref') throw await withReplacements(ctx, record, error);
    throw error;
  }
}

/**
 * The error, with the controls that match the lost ref's role and name now in the page named after it (usable refs). Any other error, and an error with nothing to
 * offer, comes back unchanged.
 */
export async function withReplacements(ctx: ToolContext, record: RefRecord, error: unknown): Promise<unknown> {
  if (!(error instanceof LayerError) || !REPLACED.has(error.code) || error.delivered !== false) return error;
  const now = await replacements(ctx, record).catch(() => []);
  if (!now.length) return error;
  return new LayerError(error.code, `${error.message} Now in the page: ${now.map(m => `[${m.ref}] ${m.role} ${quote(m.name, 60)}`).join('; ')}. Check which one you meant, then use its ref.`, {
    delivered: error.delivered,
    hint: error.hint,
    details: error.details,
  });
}

const REPLACED = new Set(['STALE_DOCUMENT', 'NODE_DETACHED', 'TARGET_CHANGED']);

/** On a fresh look at the page: the controls that match the role and name a lost ref was shown with, offered as usable refs (up to four). */
async function replacements(ctx: ToolContext, record: RefRecord): Promise<ONode[]> {
  const name = shownName(record.print);
  if (!name) return [];
  const observation = await observeTab(ctx);
  const found = nearMisses(observation.tree, record.print.role.toLowerCase(), name).slice(0, 4);
  if (!found.length) return [];
  ctx.session.known.add(ctx.tab().tabId, shownOf(observation, found.map(n => n.ref!)));
  return found;
}

/** Resolves and revalidates a known record (also used again after the user approved an action). */
export async function resolveRecord(
  ctx: ToolContext,
  record: RefRecord,
  via: ResolvedTarget['via'],
): Promise<ResolvedTarget> {
  const tab = ctx.tab();
  const attachment = await ctx.attach();
  const frames = await attachment.topology.frames();
  ctx.controller.registry.reconcile(tab.tabId, frames);
  // The record may be the session's view (lookupRef); staleness lives on the registry's record.
  if (ctx.controller.registry.get(record.ref)?.stale) {
    // Reported with its reason (STALE_DOCUMENT, FRAME_DETACHED, DEBUGGER_DETACHED).
    lookupRef(ctx.controller.registry, ctx.session.known, record.ref, tab.tabId);
  }
  const frame = frames.find(f => f.frameId === record.frameId);
  if (!frame) throw new LayerError('FRAME_DETACHED', `The frame of ${record.ref} is gone`);
  if (frame.loaderId !== record.loaderId) {
    throw new LayerError('STALE_DOCUMENT', `The frame of ${record.ref} has loaded a new document`);
  }
  const probe = tab.probe!;
  const objectId = await probe.resolve(frame, record.backendNodeId);
  try {
    await revalidate(ctx, frame, record, objectId);
    await checkRecordContext(ctx, frame, record, objectId);
  } catch (error) {
    await probe.release(frame, objectId);
    throw error;
  }
  return { record, frame, frames, objectId, description: describeTarget(ctx, record), via };
}

/**
 * The record context: the target must still sit inside the row it was shown in, and the row must hold the same content.
 * A virtualized list that reuses a row for another record keeps the button's role and name; only the row's content
 * tells the records apart.
 */
async function checkRecordContext(
  ctx: ToolContext,
  frame: FrameRecord,
  record: RefRecord,
  objectId: string,
): Promise<void> {
  const context = record.print.context;
  if (!context) return;
  const probe = ctx.tab().probe!;
  let container: string;
  try {
    container = await probe.resolve(frame, context.backendNodeId);
  } catch {
    throw new LayerError('TARGET_CHANGED', `The row that held ${record.ref} is gone. Nothing was dispatched.`);
  }
  try {
    const found = await probe.call<{ inside: boolean; text: string; shown: string }>(
      frame,
      container,
      'contextOf',
      new NodeArg(objectId),
    );
    if (!found.inside)
      throw new LayerError(
        'TARGET_CHANGED',
        `${record.ref} is no longer inside the row it was shown in. Nothing was dispatched.`,
      );
    // The digest stays internal: it includes what selects and textareas hold, which can be secrets. The message quotes
    // the row's text without them.
    if (fingerprint(found.text) !== context.digest) {
      const now = found.shown ? ` (${quote(found.shown)})` : '';
      throw new LayerError(
        'TARGET_CHANGED',
        `The row of ${record.ref} now holds different content${now}; it may be another record. Nothing was dispatched.`,
      );
    }
  } finally {
    await probe.release(frame, container);
  }
}

/** Why Chrome leaves a node out of the accessibility tree, in words (the names of CDP's `ignoredReasons`). */
const IGNORED_REASONS: Record<string, string> = {
  ariaHiddenElement: 'aria-hidden',
  ariaHiddenSubtree: 'inside an aria-hidden element',
  presentationalRole: 'a presentational role',
  inertElement: 'inert',
  inertSubtree: 'inside an inert element',
  notRendered: 'not rendered',
  notVisible: 'not visible',
};

export type AxIdentity = { role: string; name: string } | { hidden: string };

/**
 * What Chrome's accessibility tree calls a node now: its role and name, or why it gives none. A node hidden from
 * accessibility (aria-hidden) can still be seen and clicked, so a caller must never read "no name" as "no change".
 */
export async function axIdentity(ctx: ToolContext, frame: FrameRecord, backendNodeId: number): Promise<AxIdentity> {
  const attachment = await ctx.attach();
  const { nodes } = await attachment.cdp.send<{ nodes: AXNode[] }>(frame.sessionId, 'Accessibility.getPartialAXTree', {
    backendNodeId,
    fetchRelatives: false,
  });
  const node = nodes.find(n => n.backendDOMNodeId === backendNodeId);
  if (!node) return { hidden: 'it has no accessibility node' };
  if (node.ignored) {
    const reasons = (node.ignoredReasons ?? []).map(r => IGNORED_REASONS[r.name]).filter(Boolean);
    return { hidden: reasons.length ? [...new Set(reasons)].join(', ') : 'ignored' };
  }
  return {
    role: typeof node.role?.value === 'string' ? node.role.value : '',
    name: cleanText(typeof node.name?.value === 'string' ? node.name.value : ''),
  };
}

const NAME_ATTRIBUTES = ['aria-label', 'aria-labelledby', 'title'];

/** The name sources (`nameSources`) that differ, as they are now: attributes and label text, never a value. */
export function changedSources(was: string, now: string): string {
  const a = was.split('\u001f');
  const b = now.split('\u001f');
  const out = NAME_ATTRIBUTES.flatMap((name, i) => (a[i] === b[i] ? [] : [`${name} ${b[i] ? quote(b[i]) : '(none)'}`]));
  const wasLabels = a.slice(NAME_ATTRIBUTES.length).join('\u001f');
  const labels = b.slice(NAME_ATTRIBUTES.length);
  if (wasLabels !== labels.join('\u001f'))
    out.push(labels.length ? `label ${labels.map(l => quote(l)).join(', ')}` : 'no label');
  return out.join(', ') || 'its labels';
}

/**
 * Step 4: compare with what the agent was shown, using the source that produced the observation.
 *
 * A node Chrome leaves out of the accessibility tree has no role and name to compare. When the target is first
 * resolved that is left to actionability, which waits for a hidden element and says why it cannot be used. `strict`
 * is for the moments input is about to be sent to an element that can take it: there, a node that cannot be compared
 * is a changed node (hiding a button from accessibility does not stop a click on it).
 */
async function revalidate(
  ctx: ToolContext,
  frame: FrameRecord,
  record: RefRecord,
  objectId: string,
  strict = false,
): Promise<void> {
  if (record.source === 'layout') {
    // Refs found by layout signals: the tag, the text digest and the other sources of the name (aria-label, title,
    // a field's labels), with one definition on both sides. The gate classifies the name shown, so every source it can
    // come from must be unchanged.
    const probe = ctx.tab().probe!;
    const [state, digest, names] = await Promise.all([
      probe.call<{ tag: string }>(frame, objectId, 'state'),
      probe.call<string>(frame, objectId, 'textDigest'),
      record.print.names === undefined ? undefined : probe.call<string>(frame, objectId, 'nameSources'),
    ]);
    // The digests are compared, never quoted: they include what selects and textareas hold.
    if (state.tag !== record.print.tag || digest !== record.print.text) {
      const was = record.print.name ? `${record.print.tag} ${quote(record.print.name)}` : record.print.tag;
      throw new LayerError(
        'TARGET_CHANGED',
        `${record.ref} was ${was}${state.tag !== record.print.tag ? ` and is now ${state.tag}` : ', and its text has changed'}. Nothing was dispatched.`,
      );
    }
    if (names !== record.print.names) {
      throw new LayerError(
        'TARGET_CHANGED',
        `${record.ref} was ${record.print.tag} ${quote(record.print.name)}, and what its name comes from has changed: now ${changedSources(record.print.names!, names!)}. Nothing was dispatched.`,
      );
    }
    return;
  }
  let live: AxIdentity;
  try {
    live = await axIdentity(ctx, frame, record.backendNodeId);
  } catch (error) {
    throw new LayerError(
      'NODE_DETACHED',
      `${record.ref} is no longer in the page (${error instanceof Error ? error.message : error})`,
    );
  }
  const what = (r: string, n: string) => (n ? `${r} ${quote(n)}` : `an unnamed ${r}`);
  if ('hidden' in live) {
    if (!strict) return;
    // A node taken out of the document is reported the same way; say that instead.
    const state = await ctx.tab().probe!.call<{ connected: boolean }>(frame, objectId, 'state');
    if (!state.connected) {
      throw new LayerError('NODE_DETACHED', `${record.ref} is no longer in the page. Nothing was dispatched.`);
    }
    throw new LayerError(
      'TARGET_CHANGED',
      `${record.ref} was ${what(record.print.role, shownName(record.print))} and is now left out of the accessibility tree (${live.hidden}), so it cannot be compared with what was shown. Nothing was dispatched.`,
    );
  }
  // Any change counts, a name that appears on an unnamed element included: the gate classifies the name shown. The
  // comparison is with Chrome's name at capture, exactly, also when it was printed with a masked value replaced.
  if (live.role !== record.print.role || live.name !== record.print.name) {
    // The live name is quoted as Chrome gives it; a value the tab's observations mask is replaced in it by the
    // result filter, like everywhere else.
    throw new LayerError(
      'TARGET_CHANGED',
      `${record.ref} was ${what(record.print.role, shownName(record.print))} and is now ${what(live.role, live.name)}. Nothing was dispatched.`,
    );
  }
}

/**
 * The target is still what the session was shown, checked at a moment input is about to reach it: after the wait for
 * actionability, which can last seconds and scrolls, and after the page's handlers ran on the layer's own input (the
 * pointer moving over the target, the press). `context` adds the record context, which scrolling a virtualized list or
 * a hover handler can change.
 */
export async function assertAsShown(
  ctx: ToolContext,
  target: ResolvedTarget,
  options: { context: boolean },
): Promise<void> {
  await revalidate(ctx, target.frame, target.record, target.objectId, true);
  if (options.context) await checkRecordContext(ctx, target.frame, target.record, target.objectId);
}
