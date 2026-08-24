'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * The depth the stack is drawn at.
 *
 * `offset` is how many places behind the active card this one sits. Only the two
 * behind the front are drawn; anything deeper is fully transparent and stops being
 * painted, because a fourth ghost at 0.9 scale reads as clutter rather than depth.
 */
function depth(offset: number) {
  if (offset === 0) return { scale: 1, opacity: 1, y: 0 };

  /*
   * Distance sets how far back a card sits; sign sets which way it leans.
   *
   * Both directions recede. Answered cards settle upward behind the front one, and
   * cards still to come wait just below it — an earlier version returned the active
   * card's own values for every offset at or below zero, which painted all three
   * upcoming cards at full opacity directly behind the front one. They were covered
   * exactly, so it looked right and was not: nothing receded, and the stack had no
   * depth until the first advance pushed a card into the positive side.
   */
  const distance = Math.abs(offset);
  const direction = offset > 0 ? -1 : 1;

  if (distance === 1) return { scale: 0.975, opacity: 0.8, y: 14 * direction };
  if (distance === 2) return { scale: 0.95, opacity: 0.5, y: 26 * direction };
  // Deeper than the two drawn: kept mounted, because its state is real, but painted
  // out — a fourth ghost reads as clutter rather than as depth.
  return { scale: 0.93, opacity: 0, y: 34 * direction };
}

export interface StackItem {
  id: string;
  content: ReactNode;
}

/**
 * A stack of cards where the completed ones settle behind the current one.
 *
 * Cards that have already been passed keep their place in the stack rather than
 * unmounting, which is what gives the advance its sense of depth — the card that was
 * just answered is still visible, a little further away.
 */
export function OnboardingCardStack({
  items,
  activeIndex,
}: {
  items: StackItem[];
  activeIndex: number;
}) {
  // Honours the OS setting: the stack still reorders and the depth still reads, it
  // simply stops springing. Motion is decoration here, never the only signal.
  const reduced = useReducedMotion();

  const spring = reduced
    ? { duration: 0.12 }
    : { type: 'spring' as const, stiffness: 320, damping: 34, mass: 0.9 };

  return (
    <div className="xv-onb-stack">
      {items.map((item, index) => {
        // Behind the active card are the ones already answered, nearest last.
        const offset = activeIndex - index;
        const isActive = offset === 0;
        const behind = offset > 0;
        const target = depth(offset);

        return (
          <motion.div
            key={item.id}
            className="xv-onb-stack__card"
            // Upcoming cards wait below and slightly small, so the first advance
            // brings one forward rather than revealing an empty slot.
            initial={{ scale: 0.96, opacity: 0, y: 18 }}
            animate={{
              ...target,
              // Deeper than the two drawn: keep it mounted (its state is real) but
              // out of the paint and out of the hit test.
              pointerEvents: isActive ? 'auto' : 'none',
            }}
            transition={spring}
            style={{ zIndex: items.length - Math.abs(offset) }}
            // The stack behind the front is scenery; only the front card is content.
            // `inert` takes the whole subtree out of the tab order, so a card that has
            // been answered cannot be reached by keyboard behind the one in front.
            aria-hidden={!isActive}
            inert={behind || offset < 0}
          >
            {item.content}
          </motion.div>
        );
      })}
    </div>
  );
}
