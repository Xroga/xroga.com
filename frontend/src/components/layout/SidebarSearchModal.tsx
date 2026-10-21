'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Search, X, FolderOpen, MessageSquare } from 'lucide-react';
import { api, type Project } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SidebarSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function SidebarSearchModal({ open, onClose }: SidebarSearchModalProps) {
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.projects
      .list()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    searchInputRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, [open]);

  if (!open) return null;

  const q = query.toLowerCase();
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(q));

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-start justify-center px-3 pt-[min(10vh,80px)] bg-black/80" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Search projects and chats"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#484848] bg-[#191919] text-[#f5f5f5] shadow-[0_24px_72px_rgba(0,0,0,.72)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--card-border)]">
          <Search className="w-4 h-4 text-[var(--muted)]" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects and chats..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-[#b4b4b4] focus:outline-none"
          />
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Close search">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {loading ? (
            <p className="text-sm text-[var(--muted)] text-center py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[var(--muted)] text-center py-8">No results</p>
          ) : (
            filtered.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.id}`}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-white/5 transition-colors'
                )}
              >
                <FolderOpen className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-[var(--muted)] capitalize">{p.type}</p>
                </div>
              </Link>
            ))
          )}
          <Link
            href="/dashboard/chats"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-white/5 mt-1 border-t border-[var(--card-border)] pt-3"
          >
            <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
            <span>View all chats</span>
          </Link>
        </div>
      </section>
    </div>,
    document.body,
  );
}
