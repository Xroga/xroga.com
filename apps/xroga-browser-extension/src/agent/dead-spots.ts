/**
 * Points on a painted page that were clicked and changed nothing, so the next identical attempt is refused before it is sent.
 *
 * A canvas reports no effect of its own; the loop compares the picture before and after each pointer action. A click after which the page looks exactly the same hit
 * nothing that reacts. Clicking the same point again (within a small radius) on the same unchanged page cannot do anything new, so after two such clicks a third one
 * is refused with the reason, and the model has to take a different way in (another point read from a fresh picture, a mark, the keyboard, a menu key, the app's
 * own command). Any change of the page clears the record, because a point that did nothing before may work once something else opened.
 */
export interface DeadSpot { x: number; y: number; misses: number }

const RADIUS = 0.015;
const REFUSE_AFTER = 2;

export class DeadSpots {
  #spots: DeadSpot[] = [];

  get spots(): readonly DeadSpot[] {
    return this.#spots;
  }

  /** A pointer action at [x, y] left the page exactly as it was. */
  missed(x: number, y: number): void {
    const hit = this.#spots.find(s => Math.abs(s.x - x) <= RADIUS && Math.abs(s.y - y) <= RADIUS);
    if (hit) hit.misses++;
    else this.#spots.push({ x, y, misses: 1 });
    if (this.#spots.length > 24) this.#spots.shift();
  }

  /** The page changed: every point may behave differently now. */
  changed(): void {
    this.#spots = [];
  }

  /** Why a pointer action at [x, y] is refused, or undefined when it may go. */
  refusal(x: number, y: number): string | undefined {
    const hit = this.#spots.find(s => s.misses >= REFUSE_AFTER && Math.abs(s.x - x) <= RADIUS && Math.abs(s.y - y) <= RADIUS);
    if (!hit) return undefined;
    return `Refused, nothing was sent: the page has not changed since you clicked within ${RADIUS} of [${hit.x.toFixed(3)}, ${hit.y.toFixed(3)}] ${hit.misses} times, and each time nothing happened there. ` +
      'A third click at the same point cannot do anything new. Change the way in: read the target position again from a fresh picture (screenshot with region around it, or marks), ' +
      'use a keyboard shortcut or menu key (Alt, F10, the letter shown next to a command), the application\'s own command box, or a different control that reaches the same result.';
  }
}
