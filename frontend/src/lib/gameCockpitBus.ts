'use client';

import type { CockpitSceneId } from './gameCockpitContent';

/**
 * A three-event bus for the Game Builder page.
 *
 * The page is mostly server-rendered; only the pieces that need state are client
 * components. Those pieces still have to talk to each other — a card down the page
 * selects a preset that the hero cockpit shows — and the alternatives were worse:
 * lifting state to the page would turn the whole route into one client component,
 * and a store would add a dependency and a persistence surface for three
 * interactions that should not survive a reload.
 *
 * Window events keep each section independently mounted and cost nothing when the
 * page is only read. `xroga:companion-ask` is deliberately reused rather than
 * reinvented — it is the existing convention for filling the public prompt bar, and
 * HomepageChatBar already listens for it.
 */

export const PRESET_EVENT = 'xroga:gc-preset';
export const ITERATE_EVENT = 'xroga:gc-iterate';
export const ASK_EVENT = 'xroga:companion-ask';

/** Point the cockpit at a preset. */
export function selectPreset(scene: CockpitSceneId) {
  window.dispatchEvent(new CustomEvent(PRESET_EVENT, { detail: { scene } }));
}

/** Fill the public prompt bar, the same way the companion does. */
export function fillPrompt(text: string) {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { text } }));
}

/** Send focus to the conversational iteration input. */
export function focusIteration() {
  window.dispatchEvent(new CustomEvent(ITERATE_EVENT));
}

export function onPreset(handler: (scene: CockpitSceneId) => void): () => void {
  const listener = (event: Event) => {
    const scene = (event as CustomEvent<{ scene?: CockpitSceneId }>).detail?.scene;
    if (scene) handler(scene);
  };
  window.addEventListener(PRESET_EVENT, listener);
  return () => window.removeEventListener(PRESET_EVENT, listener);
}

export function onIterate(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(ITERATE_EVENT, listener);
  return () => window.removeEventListener(ITERATE_EVENT, listener);
}

/**
 * Scroll an element into view, honouring reduced motion. Used when a card down the
 * page hands its prompt to the hero — moving the value without moving the viewport
 * would look like the click did nothing.
 */
export function revealElement(node: HTMLElement | null) {
  if (!node) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}
