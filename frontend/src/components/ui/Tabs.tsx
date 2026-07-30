'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
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
}

/**
 * ARIA tablist implementing the roving-tabindex + arrow-key navigation
 * pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Panels are
 * rendered by the caller; this only owns the tab strip.
 */
export function Tabs({ items, activeId, onChange, orientation = 'vertical', className, idPrefix = 'xv-tab' }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

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
        orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
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
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-token-sm px-3 py-2 text-left text-sm font-medium transition-colors duration-150',
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
