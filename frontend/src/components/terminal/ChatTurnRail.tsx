'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface ChatTurn {
  id: string;
  label: string;
}

function clip(text: string, max = 36): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

interface ChatTurnRailProps {
  turns: ChatTurn[];
  activeId: string | null;
  onJump: (id: string) => void;
  className?: string;
}

export function ChatTurnRail({ turns, activeId, onJump, className }: ChatTurnRailProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  const previewTurn = useMemo(
    () => turns.find((t) => t.id === (hoveredId ?? activeId)) ?? turns[turns.length - 1],
    [turns, hoveredId, activeId]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (turns.length < 2) {
      setExpanded(false);
      setHoveredId(null);
    }
  }, [turns.length]);

  if (turns.length < 2 || !mounted) return null;

  const rail = (
    <div
      className={cn(
        'xv-chat-turn-rail xv-chat-turn-rail--dock hidden lg:flex flex-col items-end pointer-events-auto',
        expanded && 'xv-chat-turn-rail--expanded',
        className
      )}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => {
        setExpanded(false);
        setHoveredId(null);
      }}
    >
      {expanded ? (
        <div className="xv-chat-turn-flyout flex flex-col items-stretch w-full min-w-0">
          {previewTurn ? (
            <div className="xv-chat-turn-preview mb-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/95 px-3 py-2 text-[11px] leading-snug text-[var(--foreground)] shadow-lg backdrop-blur-md">
              {previewTurn.label}
            </div>
          ) : null}

          <div className="xv-chat-turn-panel rounded-2xl border border-[var(--card-border)]/80 bg-[var(--card)]/55 backdrop-blur-md shadow-lg overflow-hidden">
            <div className="max-h-[min(52vh,420px)] overflow-y-auto py-2 px-1.5 space-y-0.5 scrollbar-thin">
              {turns.map((turn) => {
                const active = turn.id === activeId;
                return (
                  <button
                    key={turn.id}
                    type="button"
                    onMouseEnter={() => setHoveredId(turn.id)}
                    onFocus={() => setHoveredId(turn.id)}
                    onClick={() => onJump(turn.id)}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                      active
                        ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
                        : 'text-[var(--muted)] hover:bg-white/5 hover:text-[var(--foreground)]'
                    )}
                    aria-label={`Jump to: ${clip(turn.label, 80)}`}
                  >
                    <span
                      className={cn(
                        'min-w-0 flex-1 text-[10px] leading-snug',
                        active ? 'font-semibold' : 'font-medium opacity-85'
                      )}
                    >
                      {clip(turn.label)}
                    </span>
                    <span
                      className={cn(
                        'h-0.5 shrink-0 rounded-full transition-all',
                        active
                          ? 'w-5 bg-[var(--accent)]'
                          : 'w-2.5 bg-[var(--muted)]/40 group-hover:w-4 group-hover:bg-[var(--accent)]/55'
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="xv-chat-turn-collapsed flex flex-col items-end gap-2 py-3">
          {turns.map((turn) => {
            const active = turn.id === activeId;
            return (
              <button
                key={`tick-${turn.id}`}
                type="button"
                onMouseEnter={() => setHoveredId(turn.id)}
                onClick={() => onJump(turn.id)}
                title={clip(turn.label, 60)}
                aria-label={`Jump to prompt ${clip(turn.label, 40)}`}
                className={cn(
                  'rounded-full transition-all duration-200',
                  active
                    ? 'h-[3px] w-5 bg-[var(--accent)] shadow-[0_0_8px_rgba(96,165,250,0.4)]'
                    : 'h-[2px] w-2.5 bg-[var(--muted)]/40 hover:w-4 hover:bg-[var(--accent)]/55'
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  return createPortal(rail, document.body);
}

export function buildChatTurns(
  messages: Array<{ id: string; role: string; content: string }>
): ChatTurn[] {
  return messages
    .filter((m) => m.role === 'user' && m.content.trim())
    .map((m) => ({
      id: m.id,
      label: m.content.trim(),
    }));
}
