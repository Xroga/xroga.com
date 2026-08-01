'use client';

/**
 * One row of the execution log.
 *
 * Rows are deliberately uniform: a gutter marker, an optional source, and the
 * text. No row type gets a card, a border, or an animation of its own, because
 * visual weight would imply importance the backend never signalled — the old UI
 * gave a fixed checklist top billing regardless of what was actually happening.
 *
 * Colour is the only differentiator, and it maps to `level`, which is derived
 * from the payload rather than guessed.
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { TerminalEvent } from '@/lib/terminal/terminalEvent';

/** Gutter markers. ASCII, so they render identically in every terminal font. */
const MARKER: Record<TerminalEvent['kind'], string> = {
  session: '$',
  status: '›',
  output: ' ',
  artifact: '◆',
  result: '✓',
  failure: '✗',
  permission: '!',
};

const LEVEL_CLASS: Record<TerminalEvent['level'], string> = {
  info: 'xv-term-row--info',
  warn: 'xv-term-row--warn',
  error: 'xv-term-row--error',
  success: 'xv-term-row--success',
};

export const TerminalEventRow = memo(function TerminalEventRow({
  event,
}: {
  event: TerminalEvent;
}) {
  return (
    <div className={cn('xv-term-row', LEVEL_CLASS[event.level])} data-kind={event.kind}>
      <span className="xv-term-marker" aria-hidden="true">
        {MARKER[event.kind]}
      </span>
      <span className="xv-term-body">
        {event.source ? <span className="xv-term-source">{event.source}</span> : null}
        <span className="xv-term-text">{event.text}</span>
        {event.body ? <pre className="xv-term-output">{event.body}</pre> : null}
      </span>
    </div>
  );
});
