import type { KeyboardEvent } from 'react';

const STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/** Arrow keys, Home and End for a radiogroup or tablist with a roving tab stop: move focus and select. */
export function rovingKeys(ev: KeyboardEvent<HTMLElement>) {
  if (!(ev.key in STEP) && ev.key !== 'Home' && ev.key !== 'End') return;
  const items = [...ev.currentTarget.querySelectorAll<HTMLElement>('[role="radio"], [role="tab"]')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  ev.preventDefault();
  const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1 : (i + STEP[ev.key] + items.length) % items.length;
  items[n].focus({ preventScroll: true });
  items[n].click();
}
