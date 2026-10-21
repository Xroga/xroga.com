'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatTurn {
  id: string;
  role?: 'user' | 'assistant';
  label: string;
  summary: string;
  detail?: string;
}

export const MAX_VISIBLE_CHAT_TURNS = 45;
export function chatRailCapacity(viewportWidth: number, viewportHeight: number): number {
  const target = viewportWidth < 640 ? 15 : viewportWidth < 1024 ? 25 : MAX_VISIBLE_CHAT_TURNS;
  const available = Math.max(6, Math.floor((viewportHeight - 84) / 11));
  return Math.min(target, available);
}
const STORAGE_PREFIX = 'xroga:conversation-bookmarks:v1:';

export function bookmarkStorageKey(conversationKey: string): string {
  return STORAGE_PREFIX + encodeURIComponent(conversationKey);
}

/** Preserve real first/last, active and bookmarked anchors while sampling long histories. */
export function visibleChatTurns(turns: ChatTurn[], _bookmarkedIds: readonly string[] = [], _activeId: string | null = null,
  capacity = MAX_VISIBLE_CHAT_TURNS, start = Math.max(0, turns.length - capacity)): ChatTurn[] {
  // Only real messages, in a stable bounded window. The arrows reach older/newer
  // messages without creating hundreds of overlapping or synthetic dash markers.
  const size = Math.max(1, capacity);
  const from = Math.max(0, Math.min(start, Math.max(0, turns.length - size)));
  return turns.slice(from, from + size);
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
export function buildChatTurns(messages: Array<{ id: string; role: string; content: string; featureOutput?: unknown }>): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let previousPrompt: ChatTurn | null = null;
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const lines = cleanLines(message.content ?? '');
    if (!lines.length && message.role === 'assistant' && message.featureOutput && typeof message.featureOutput === 'object') {
      // Generated outputs are real assistant-message anchors, even without markdown.
      const output = message.featureOutput as Record<string, unknown>;
      const actualTitle = [output.title, output.name, output.filename, output.description]
        .find(value => typeof value === 'string' && value.trim()) as string | undefined;
      const actualType = typeof output.type === 'string' ? output.type.replace(/[_-]/g, ' ') : '';
      if (actualTitle) lines.push(actualTitle.trim());
      else if (actualType) lines.push('Generated ' + actualType);
    }
    if (!lines.length) continue;
    const turn: ChatTurn = {
      id: message.id,
      role: message.role,
      label: clip(lines[0], 200),
      summary: clip(lines.slice(1).join(' '), 170),
    };
    if (message.role === 'user') {
      previousPrompt = turn;
      turns.push(turn);
    } else if (previousPrompt) {
      // One user request and its answer share one dash and one stable target ID.
      // Real assistant output enriches the user's preview, never a second marker.
      if (!previousPrompt.summary) previousPrompt.summary = clip(lines[0], 170);
      if (!previousPrompt.detail && lines[1]) previousPrompt.detail = clip(lines[1], 140);
    } else {
      // Restored conversations may legitimately begin with an assistant message.
      turns.push(turn);
    }
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
  const [layout, setLayout] = useState({ left: 8, height: 800, navigable: false, width: 1366 });
  const [mounted, setMounted] = useState(false);
  const [bookmarks, setBookmarks] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] });
  const [pageStart, setPageStart] = useState(0);

  useEffect(() => {
    setMounted(true);
    const root = document.querySelector<HTMLElement>('.xv-terminal-scroll')
      ?? document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto')
      ?? document.documentElement;
    const place = () => {
      const bounds = root.getBoundingClientRect();
      const scrollable = root.scrollHeight > root.clientHeight + 40;
      setLayout(previous => {
        const next = { left: Math.max(4, Math.round(bounds.left + (window.innerWidth < 640 ? 3 : 8))), height: Math.max(120, window.innerHeight - 16), navigable: scrollable, width: window.innerWidth };
        return previous.left === next.left && previous.height === next.height && previous.navigable === next.navigable && previous.width === next.width ? previous : next;
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
    setPageStart(0);
  }, [conversationKey]);

  const savedIds = bookmarks.key === conversationKey ? bookmarks.ids : [];
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);
  const capacity = chatRailCapacity(layout.width, layout.height);
  const maxStart = Math.max(0, turns.length - capacity);
  // A new or restored conversation opens at its actual latest messages.
  const effectiveStart = Math.min(pageStart, maxStart);
  const visibleTurns = useMemo(
    () => visibleChatTurns(turns, savedIds, activeId, capacity, effectiveStart),
    [turns, savedIds, activeId, capacity, effectiveStart],
  );
  const turnIndices = useMemo(() => new Map(turns.map((turn, index) => [turn.id, index])), [turns]);
  const activeIndex = turnIndices.get(activeId ?? '') ?? -1;
  const visibleActiveId = activeIndex >= effectiveStart && activeIndex < effectiveStart + visibleTurns.length
    ? activeId : null;
  const hoveredIndex = visibleTurns.findIndex(turn => turn.id === hoveredId);
  const hoveredTurn = hoveredIndex >= 0 ? visibleTurns[hoveredIndex] : null;
  const hasOlder = effectiveStart > 0;
  const hasNewer = effectiveStart + capacity < turns.length;

  useEffect(() => {
    // Only change pages when the active message actually exits the visible window.
    // This keeps markers fixed while reading within a page.
    if (activeIndex < 0 || turns.length <= capacity) return;
    setPageStart(previous => {
      const start = Math.min(previous, maxStart);
      if (activeIndex < start) return Math.max(0, activeIndex - Math.floor(capacity / 3));
      if (activeIndex >= start + capacity) return Math.min(maxStart, activeIndex - capacity + Math.floor(capacity / 3));
      return previous;
    });
  }, [activeIndex, capacity, maxStart, turns.length]);

  useEffect(() => {
    // The first render after loading a long conversation should start at the
    // latest genuine content, not the earliest messages or stale previous session.
    if (turns.length > capacity && pageStart === 0 && activeIndex < 0) {
      setPageStart(maxStart);
    }
  }, [turns.length, capacity, maxStart, activeIndex, pageStart]);

  function toggleBookmark(id: string) {
    const current = bookmarks.key === conversationKey ? bookmarks.ids : [];
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
    setBookmarks({ key: conversationKey, ids: next });
    try { localStorage.setItem(bookmarkStorageKey(conversationKey), JSON.stringify(next)); } catch { /* Non-persistent storage fallback. */ }
  }

  if (!mounted || turns.length < 2 || !layout.navigable || visibleTurns.length < 2 || (layout.width < 360)) return null;

  const markerTop = hoveredIndex >= 0 ? turnMarkerTop(hoveredIndex, visibleTurns.length, layout.height) : 0;
  return createPortal(
    <nav
      className={cn('xv-chat-turn-rail xv-chat-turn-rail--dock', className)}
      style={{ left: layout.left }}
      aria-label="Conversation turn navigation"
      onMouseLeave={() => setHoveredId(null)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHoveredId(null); }}
    >
      {hasOlder ? <button type="button" className="xv-chat-rail-page xv-chat-rail-page--older"
        aria-label="Older messages" onClick={() => { setHoveredId(null); setPageStart(Math.max(0, effectiveStart - capacity)); }}>
        <ChevronUp size={13} aria-hidden="true" />
      </button> : null}
      {visibleTurns.map((turn, index) => {
        const current = turn.id === visibleActiveId;
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
          aria-label={`${saved ? 'Bookmarked ' : ''}message: ${clip(turn.label, 78)}`}
          aria-current={current ? 'location' : undefined}
        ><span aria-hidden="true" /></button>;
      })}
      {hasNewer ? <button type="button" className="xv-chat-rail-page xv-chat-rail-page--newer"
        aria-label="Newer messages" onClick={() => { setHoveredId(null); setPageStart(Math.min(maxStart, effectiveStart + capacity)); }}>
        <ChevronDown size={13} aria-hidden="true" />
      </button> : null}
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
