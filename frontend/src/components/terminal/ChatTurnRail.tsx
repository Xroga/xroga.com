'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface ChatTurn {
  id: string;
  label: string;
  summary: string;
  detail?: string;
}

export const MAX_VISIBLE_CHAT_TURNS = 50;

/** Show only real conversation turns, keeping the latest 50 navigable in the rail. */
export function visibleChatTurns(turns: ChatTurn[]): ChatTurn[] {
  return turns.length > MAX_VISIBLE_CHAT_TURNS ? turns.slice(-MAX_VISIBLE_CHAT_TURNS) : turns;
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

/** Center real turns vertically, keeping a tight sequence and compressing only when needed. */
export function turnMarkerTop(index: number, count: number, railHeight: number): number {
  // Leave room for the hover preview at both ends so it can stay centered on its tick.
  const step = count > 1 ? Math.min(11, Math.max(1, (railHeight - 144) / (count - 1))) : 11;
  const start = (railHeight - step * Math.max(0, count - 1)) / 2;
  return start + index * step;
}

function responsePreview(content: string): Pick<ChatTurn, 'summary' | 'detail'> {
  const lines = content
    .replace(/```[\s\S]*?```/g, ' Code details are in the response. ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:#{1,6}\s+|>\s*)/, '').replace(/[*_`]/g, '').trim())
    .filter(Boolean);
  const summary = lines.find((line) => !/^(?:[-•]|\d+\.)\s/.test(line)) ?? lines[0] ?? '';
  const detail = lines.find((line) => /^(?:[-•]|\d+\.)\s/.test(line))?.replace(/^(?:[-•]|\d+\.)\s*/, '');
  return { summary: clip(summary, 112), detail: detail ? clip(detail, 100) : undefined };
}

interface ChatTurnRailProps {
  turns: ChatTurn[];
  activeId: string | null;
  onJump: (id: string) => void;
  className?: string;
}

/** A quiet full-height conversation map, not a second scrolling chat panel. */
export function ChatTurnRail({ turns, activeId, onJump, className }: ChatTurnRailProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [left, setLeft] = useState(8);
  const [railHeight, setRailHeight] = useState(800);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const scrollRoot = document.querySelector<HTMLElement>('.xv-terminal-scroll')
      ?? document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto');
    const place = () => {
      setLeft(Math.max(8, Math.round((scrollRoot?.getBoundingClientRect().left ?? 0) + 8)));
      setRailHeight(Math.max(48, window.innerHeight - 16));
    };
    place();
    const observer = scrollRoot ? new ResizeObserver(place) : null;
    if (scrollRoot) observer?.observe(scrollRoot);
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, []);

  const visibleTurns = useMemo(() => visibleChatTurns(turns), [turns]);
  const hoveredIndex = useMemo(() => visibleTurns.findIndex((turn) => turn.id === hoveredId), [visibleTurns, hoveredId]);
  const hoveredTurn = hoveredIndex >= 0 ? visibleTurns[hoveredIndex] : null;

  if (!mounted || visibleTurns.length === 0) return null;

  return createPortal(
    <nav
      className={cn('xv-chat-turn-rail xv-chat-turn-rail--dock hidden lg:block', className)}
      style={{ left }}
      aria-label="Conversation turn navigation"
      onMouseLeave={() => setHoveredId(null)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHoveredId(null);
      }}
    >
      {visibleTurns.map((turn, index) => (
        <button
          key={turn.id}
          type="button"
          className={cn('xv-chat-turn-tick', turn.id === activeId && 'xv-chat-turn-tick--active')}
          style={{ top: turnMarkerTop(index, visibleTurns.length, railHeight) }}
          onMouseEnter={() => setHoveredId(turn.id)}
          onFocus={() => setHoveredId(turn.id)}
          onClick={() => onJump(turn.id)}
          aria-label={`Jump to: ${clip(turn.label, 80)}`}
          aria-current={turn.id === activeId ? 'location' : undefined}
        >
          <span aria-hidden="true" />
        </button>
      ))}
      {hoveredTurn ? (
        <div
          className="xv-chat-turn-preview"
          style={{ '--xv-preview-position': `${turnMarkerTop(hoveredIndex, visibleTurns.length, railHeight)}px` } as React.CSSProperties}
        >
          <div className="xv-chat-turn-preview-heading">
            <strong title={hoveredTurn.label}>{clip(hoveredTurn.label, 50)}</strong>
          </div>
          <p>{hoveredTurn.summary || 'Waiting for Xroga’s response…'}</p>
          {hoveredTurn.detail ? <p className="xv-chat-turn-preview-detail"><span aria-hidden="true">•</span>{hoveredTurn.detail}</p> : null}
        </div>
      ) : null}
    </nav>,
    document.body,
  );
}

export function buildChatTurns(messages: Array<{ id: string; role: string; content: string }>): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let current: ChatTurn | null = null;
  for (const message of messages) {
    if (message.role === 'user' && message.content.trim()) {
      current = { id: message.id, label: message.content.trim(), summary: '' };
      turns.push(current);
    } else if (message.role === 'assistant' && current && !current.summary && message.content.trim()) {
      Object.assign(current, responsePreview(message.content));
    }
  }
  return turns;
}
