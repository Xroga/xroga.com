'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatTurn {
  id: string;
  role?: 'user' | 'assistant';
  label: string;
  summary: string;
  detail?: string;
}

export const MAX_VISIBLE_CHAT_TURNS = 50;
const STORAGE_PREFIX = 'xroga:conversation-bookmarks:v1:';

export function bookmarkStorageKey(conversationKey: string): string {
  return STORAGE_PREFIX + encodeURIComponent(conversationKey);
}

/** Preserve real first/last, active and bookmarked anchors while sampling long histories. */
export function visibleChatTurns(turns: ChatTurn[], bookmarkedIds: readonly string[] = [], activeId: string | null = null): ChatTurn[] {
  if (turns.length <= MAX_VISIBLE_CHAT_TURNS) return turns;
  const saved = new Set(bookmarkedIds);
  const priority = new Set<number>([0, turns.length - 1]);
  for (let index = 0; index < turns.length; index++) {
    if (saved.has(turns[index].id) || turns[index].id === activeId) priority.add(index);
  }
  // Large histories are compressed, but keep every bookmark where viewport density permits.
  const limit = Math.min(100, Math.max(MAX_VISIBLE_CHAT_TURNS, priority.size));
  const chosen = [...priority].sort((a, b) => a - b);
  if (chosen.length > limit) {
    const retained = [0, turns.length - 1];
    for (const index of chosen.slice(1, -1).reverse().slice(0, limit - 2)) retained.push(index);
    priority.clear();
    retained.forEach(index => priority.add(index));
  }
  const available = limit - priority.size;
  if (available > 0) {
    // Evenly distribute the other real anchors; no synthetic or unresolvable markers.
    for (let n = 0; n < available; n++) {
      const target = Math.round(((n + 1) * (turns.length - 1)) / (available + 1));
      if (!priority.has(target)) priority.add(target);
    }
    while (priority.size < limit) {
      const indices = [...priority].sort((a, b) => a - b);
      let gap = 0;
      let nextIndex = -1;
      for (let n = 1; n < indices.length; n++) {
        const distance = indices[n] - indices[n - 1];
        if (distance > gap) { gap = distance; nextIndex = Math.floor((indices[n] + indices[n - 1]) / 2); }
      }
      if (gap <= 1 || nextIndex < 0) break;
      priority.add(nextIndex);
    }
  }
  return [...priority].sort((a, b) => a - b).map(index => turns[index]);
}

export function turnMarkerTop(index: number, count: number, railHeight: number): number {
  const step = count > 1 ? Math.min(12, Math.max(5, (railHeight - 48) / (count - 1))) : 12;
  return (railHeight - step * Math.max(0, count - 1)) / 2 + index * step;
}

export function proximityWidth(distance: number | null): number {
  if (distance === null) return 7;
  return [30, 20, 14, 10][Math.abs(distance)] ?? 7;
}

function cleanLines(content: string): string[] {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split(/\n+/)
    .map(line => line.replace(/^\s*(?:#{1,6}\s+|>\s*|[-*•]\s+|\d+\.\s+)/, '')
      .replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1) + '…';
}

/** Only genuine user/assistant text; temporary stream/tool events never create markers. */
export function buildChatTurns(messages: Array<{ id: string; role: string; content: string }>): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let previousPrompt: ChatTurn | null = null;
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const lines = cleanLines(message.content ?? '');
    if (!lines.length) continue;
    const turn: ChatTurn = {
      id: message.id,
      role: message.role,
      label: clip(lines[0], 200),
      summary: clip(lines.slice(1).join(' '), 170),
    };
    if (message.role === 'user') {
      previousPrompt = turn;
    } else if (previousPrompt && !previousPrompt.summary) {
      // A user prompt's preview may show the genuine reply excerpt, as in the references.
      previousPrompt.summary = clip(lines[0], 170);
      previousPrompt.detail = lines[1] ? clip(lines[1], 140) : undefined;
    }
    turns.push(turn);
  }
  return turns;
}

interface ChatTurnRailProps {
  turns: ChatTurn[];
  activeId: string | null;
  onJump: (id: string) => void;
  conversationKey: string;
  className?: string;
}

/**
 * One canonical rail for the current conversation. Bookmark ids are persisted per
 * account+session; no message content is written to bookmark storage.
 */
export function ChatTurnRail({ turns, activeId, onJump, conversationKey, className }: ChatTurnRailProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [layout, setLayout] = useState({ left: 8, height: 800, navigable: false });
  const [mounted, setMounted] = useState(false);
  const [bookmarks, setBookmarks] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] });

  useEffect(() => {
    setMounted(true);
    const root = document.querySelector<HTMLElement>('.xv-terminal-scroll')
      ?? document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto')
      ?? document.documentElement;
    const place = () => {
      const bounds = root.getBoundingClientRect();
      const scrollable = root.scrollHeight > root.clientHeight + 40;
      setLayout(previous => {
        const next = { left: Math.max(8, Math.round(bounds.left + 8)), height: Math.max(120, window.innerHeight - 16), navigable: scrollable };
        return previous.left === next.left && previous.height === next.height && previous.navigable === next.navigable ? previous : next;
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(root);
    window.addEventListener('resize', place);
    root.addEventListener('scroll', place, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener('resize', place); root.removeEventListener('scroll', place); };
  }, [conversationKey, turns.length]);

  useEffect(() => {
    let ids: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(bookmarkStorageKey(conversationKey)) ?? '[]');
      if (Array.isArray(raw)) ids = raw.filter((item): item is string => typeof item === 'string').slice(0, 500);
    } catch { /* Storage may be disabled; bookmarking still works for this session. */ }
    setBookmarks({ key: conversationKey, ids });
    setHoveredId(null);
  }, [conversationKey]);

  const savedIds = bookmarks.key === conversationKey ? bookmarks.ids : [];
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);
  const visibleTurns = useMemo(() => visibleChatTurns(turns, savedIds, activeId), [turns, savedIds, activeId]);
  const hoveredIndex = visibleTurns.findIndex(turn => turn.id === hoveredId);
  const hoveredTurn = hoveredIndex >= 0 ? visibleTurns[hoveredIndex] : null;

  function toggleBookmark(id: string) {
    const current = bookmarks.key === conversationKey ? bookmarks.ids : [];
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
    setBookmarks({ key: conversationKey, ids: next });
    try { localStorage.setItem(bookmarkStorageKey(conversationKey), JSON.stringify(next)); } catch { /* Non-persistent storage fallback. */ }
  }

  if (!mounted || turns.length < 2 || !layout.navigable || visibleTurns.length < 2) return null;

  const markerTop = hoveredIndex >= 0 ? turnMarkerTop(hoveredIndex, visibleTurns.length, layout.height) : 0;
  return createPortal(
    <nav
      className={cn('xv-chat-turn-rail xv-chat-turn-rail--dock hidden lg:block', className)}
      style={{ left: layout.left }}
      aria-label="Conversation turn navigation"
      onMouseLeave={() => setHoveredId(null)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHoveredId(null); }}
    >
      {visibleTurns.map((turn, index) => {
        const current = turn.id === activeId;
        const saved = savedSet.has(turn.id);
        const near = hoveredIndex < 0 ? null : Math.abs(index - hoveredIndex);
        const width = hoveredIndex >= 0
          ? proximityWidth(near)
          : saved ? 13 : current ? 12 : 7;
        const style = {
          top: turnMarkerTop(index, visibleTurns.length, layout.height),
          '--xv-dash-width': width + 'px',
        } as CSSProperties;
        return <button
          key={turn.id}
          type="button"
          className={cn('xv-chat-turn-tick', current && 'xv-chat-turn-tick--active', saved && 'xv-chat-turn-tick--bookmarked', hoveredId === turn.id && 'xv-chat-turn-tick--hovered')}
          style={style}
          onMouseEnter={() => setHoveredId(turn.id)}
          onFocus={() => setHoveredId(turn.id)}
          onClick={() => onJump(turn.id)}
          aria-label={`Jump to ${saved ? 'bookmarked ' : ''}${turn.role ?? 'message'}: ${clip(turn.label, 78)}`}
          aria-current={current ? 'location' : undefined}
        ><span aria-hidden="true" /></button>;
      })}
      {hoveredTurn ? <div
        className="xv-chat-turn-preview"
        style={{ '--xv-preview-position': Math.max(75, Math.min(layout.height - 75, markerTop)) + 'px' } as CSSProperties}
        onMouseEnter={() => setHoveredId(hoveredTurn.id)}
      >
        <div className="xv-chat-turn-preview-heading">
          <strong title={hoveredTurn.label}>{clip(hoveredTurn.label, 112)}</strong>
          <button type="button" className="xv-chat-turn-bookmark"
            aria-label={savedSet.has(hoveredTurn.id) ? 'Remove bookmark' : 'Bookmark this message'}
            aria-pressed={savedSet.has(hoveredTurn.id)}
            onClick={() => toggleBookmark(hoveredTurn.id)}>
            <Bookmark size={15} aria-hidden="true" fill={savedSet.has(hoveredTurn.id) ? 'currentColor' : 'none'} />
          </button>
        </div>
        {hoveredTurn.summary ? <p>{hoveredTurn.summary}</p> : null}
        {hoveredTurn.detail ? <p className="xv-chat-turn-preview-detail"><span aria-hidden="true">•</span>{hoveredTurn.detail}</p> : null}
      </div> : null}
    </nav>,
    document.body,
  );
}
