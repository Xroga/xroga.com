'use client';

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  items: readonly TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** 'vertical' for a desktop side rail, 'horizontal' for mobile pill row. */
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  idPrefix?: string;
  /**
   * The prefix of the panel ids these tabs control, when it differs from their own.
   *
   * Settings renders this twice — a desktop rail and a mobile strip — over one set
   * of panels. Sharing `idPrefix` would put duplicate ids in the document; without
   * this, the second copy's `aria-controls` would point at panels that do not exist.
   */
  panelPrefix?: string;
}

/**
 * ARIA tablist implementing the roving-tabindex + arrow-key navigation
 * pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Panels are
 * rendered by the caller; this only owns the tab strip.
 */
export function Tabs({ items, activeId, onChange, orientation = 'vertical', className, idPrefix = 'xv-tab', panelPrefix }: TabsProps) {
  const panels = panelPrefix ?? idPrefix;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  /*
   * A horizontal strip scrolls rather than wraps, so the active tab can be off
   * screen — on arrival from a deep link, or after arrow-key navigation walks past
   * the edge. `inline: 'center'` brings it back; `block: 'nearest'` keeps the page
   * itself still, which a default scrollIntoView would not.
   */
  useEffect(() => {
    if (orientation !== 'horizontal') return;
    refs.current[activeId]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeId, orientation]);

  function focusIndex(index: number) {
    const item = items[(index + items.length) % items.length];
    onChange(item.id);
    refs.current[item.id]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = items.findIndex((item) => item.id === activeId);
    const isVertical = orientation === 'vertical';
    const nextKey = isVertical ? 'ArrowDown' : 'ArrowRight';
    const prevKey = isVertical ? 'ArrowUp' : 'ArrowLeft';

    if (event.key === nextKey) {
      event.preventDefault();
      focusIndex(currentIndex + 1);
    } else if (event.key === prevKey) {
      event.preventDefault();
      focusIndex(currentIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusIndex(items.length - 1);
    }
  }

  return (
    <div
      role="tablist"
      aria-orientation={orientation}
      onKeyDown={onKeyDown}
      className={cn(
        'flex gap-1',
        // Horizontal does not wrap. Wrapping turned nine sections into three rows of
        // pills that pushed the panel down the page, which is why this was a native
        // select before; it scrolls under the finger instead.
        orientation === 'vertical' ? 'flex-col' : 'xv-tabstrip flex-row flex-nowrap',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[item.id] = node;
            }}
            role="tab"
            id={`${idPrefix}-${item.id}`}
            aria-selected={active}
            aria-controls={`${panels}-panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-token-sm px-3 py-2 text-left text-sm font-medium transition-colors duration-150',
              orientation === 'horizontal' && 'xv-tabstrip__tab whitespace-nowrap',
              'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
              active
                ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
