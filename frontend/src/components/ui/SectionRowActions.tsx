'use client';

import { Copy, Download, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface SectionRowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onDownload?: () => void;
  className?: string;
  size?: 'sm' | 'xs';
}

export function SectionRowActions({
  onEdit,
  onDelete,
  onCopy,
  onDownload,
  className,
  size = 'xs',
}: SectionRowActionsProps) {
  const btn =
    size === 'xs'
      ? 'p-1.5 rounded-md text-[10px]'
      : 'p-2 rounded-lg text-xs';

  const items = [
    { key: 'edit', icon: Pencil, label: 'Edit', onClick: onEdit },
    { key: 'copy', icon: Copy, label: 'Copy', onClick: onCopy },
    { key: 'download', icon: Download, label: 'Download', onClick: onDownload },
    { key: 'delete', icon: Trash2, label: 'Delete', onClick: onDelete, danger: true },
  ].filter((i) => i.onClick);

  if (!items.length) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {items.map(({ key, icon: Icon, label, onClick, danger }) => (
        <button
          key={key}
          type="button"
          title={label}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className={cn(
            btn,
            'inline-flex items-center gap-1 border border-[var(--card-border)] bg-[var(--card)]/80 hover:bg-[var(--accent)]/10 transition-colors font-medium',
            danger ? 'hover:text-red-400 hover:border-red-400/30' : 'hover:text-[var(--accent)]'
          )}
        >
          <Icon className="w-3 h-3" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export async function copyText(text: string, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error('Copy failed');
  }
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Downloaded');
}

export function downloadUrl(filename: string, url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  toast.success('Download started');
}
