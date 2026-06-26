'use client';

import { useEffect, useState } from 'react';
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

  if (!open) return null;

  const q = query.toLowerCase();
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(q));

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--card-border)] bg-[var(--card)] backdrop-blur-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--card-border)]">
          <Search className="w-4 h-4 text-[var(--muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects and chats..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/5">
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
      </div>
    </div>
  );
}
