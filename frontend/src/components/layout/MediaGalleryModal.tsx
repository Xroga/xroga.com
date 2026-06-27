'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Image as ImageIcon, Film, Music } from 'lucide-react';
import { loadMediaItems, type MediaItem } from '@/lib/mediaStorage';

interface MediaGalleryModalProps {
  open: boolean;
  onClose: () => void;
}

export function MediaGalleryModal({ open, onClose }: MediaGalleryModalProps) {
  const [items, setItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setItems(loadMediaItems());
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl max-h-[80vh] rounded-2xl border border-[var(--card-border)] bg-[var(--card)] backdrop-blur-xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
          <h2 className="font-semibold text-sm">AI Media — quick view</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 mx-auto text-[var(--muted)] mb-3 opacity-50" />
              <p className="text-sm text-[var(--muted)]">No media yet</p>
              <p className="text-xs text-[var(--muted)] mt-1">
                Generated images, videos, and audio will appear here
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-[var(--card-border)] overflow-hidden">
                  {item.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.name} className="w-full aspect-square object-cover" />
                  ) : item.type === 'video' ? (
                    <div className="aspect-square bg-white/5 flex items-center justify-center">
                      <Film className="w-8 h-8 text-[var(--muted)]" />
                    </div>
                  ) : (
                    <div className="aspect-square bg-white/5 flex items-center justify-center">
                      <Music className="w-8 h-8 text-[var(--muted)]" />
                    </div>
                  )}
                  <p className="text-xs p-2 truncate">{item.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-[var(--card-border)] text-center">
          <Link href="/dashboard/media" onClick={onClose} className="text-xs text-[var(--accent)] hover:underline">
            Open full AI Media library →
          </Link>
        </div>
      </div>
    </div>
  );
}
