'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronDown,
  Copy,
  Download,
  Trash2,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sparkles,
  FileText,
  Music,
  Film,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const COLS = 4;
const DEFAULT_ROWS = 2;
const VISIBLE = COLS * DEFAULT_ROWS;

function fileKind(type: string, name: string) {
  if (type.startsWith('image/')) {
    if (type.includes('gif')) return 'GIF';
    return 'IMAGE';
  }
  if (type.startsWith('video/')) return 'VIDEO';
  if (type.startsWith('audio/')) return 'AUDIO';
  const ext = name.split('.').pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : 'FILE';
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function NaturalImageThumb({ url, alt }: { url: string; alt: string }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const maxSide = 72;

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      const { naturalWidth: nw, naturalHeight: nh } = img;
      if (!nw || !nh) return;
      const scale = Math.min(maxSide / nw, maxSide / nh, 1);
      setDims({ w: Math.round(nw * scale), h: Math.round(nh * scale) });
    };
    img.src = url;
  }, [url]);

  const style = dims ? { width: dims.w, height: dims.h } : { width: maxSide, height: maxSide };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      style={style}
      className="object-contain rounded max-w-full"
    />
  );
}

function FilePreviewModal({
  file,
  url,
  onClose,
  onRename,
  onRemove,
}: {
  file: File;
  url: string | null;
  onClose: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(file.name);
  const [aiPrompt, setAiPrompt] = useState('');
  const [rot, setRot] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  const transform = `rotate(${rot}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`;

  async function copyImage() {
    if (!url || !isImage) return;
    try {
      const blob = await fetch(url).then((r) => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast.success('Image copied');
    } catch {
      toast.error('Copy not supported in this browser');
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl border border-[var(--card-border)] w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b border-[var(--card-border)]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== file.name && onRename(name)}
            className="flex-1 bg-transparent text-sm font-semibold focus:outline-none"
          />
          <button type="button" onClick={onClose} className="p-1 text-[var(--muted)]"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 flex justify-center bg-black/20 min-h-[200px]">
          {url && isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="max-h-[50vh] object-contain rounded-lg" style={{ transform }} />
          ) : url && isVideo ? (
            <video src={url} controls className="max-h-[50vh] max-w-full rounded-lg" />
          ) : (
            <div className="flex flex-col items-center justify-center text-[var(--muted)]">
              <FileText className="w-12 h-12 mb-2" />
              <p className="text-xs">{file.type || 'Document'}</p>
            </div>
          )}
        </div>
        {isImage && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => setRot((r) => r + 90)} className="xv-file-tool-btn"><RotateCw className="w-3 h-3" /> Rotate</button>
              <button type="button" onClick={() => setFlipH((v) => !v)} className="xv-file-tool-btn"><FlipHorizontal className="w-3 h-3" /> Flip H</button>
              <button type="button" onClick={() => setFlipV((v) => !v)} className="xv-file-tool-btn"><FlipVertical className="w-3 h-3" /> Flip V</button>
            </div>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="AI edit: remove background, upscale, change format… describe what you want"
              rows={2}
              className="w-full text-xs px-2.5 py-2 rounded-lg border border-[var(--card-border)] bg-white/5 resize-none"
            />
            <button
              type="button"
              onClick={() => toast('AI image edit queued — coming with Swarm media API', { icon: '✨' })}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#006aff]/15 text-[#006aff] text-xs font-bold"
            >
              <Sparkles className="w-3.5 h-3.5" /> Apply AI edit
            </button>
          </div>
        )}
        <div className="flex gap-2 p-3 border-t border-[var(--card-border)]">
          {url && isImage && (
            <button type="button" onClick={() => void copyImage()} className="xv-file-tool-btn flex-1 justify-center">
              <Copy className="w-3 h-3" /> Copy image
            </button>
          )}
          {url && (
            <a href={url} download={name} className="xv-file-tool-btn flex-1 justify-center">
              <Download className="w-3 h-3" /> Download
            </a>
          )}
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(name); toast.success('Name copied'); }}
            className="xv-file-tool-btn flex-1 justify-center"
          >
            <Copy className="w-3 h-3" /> Copy name
          </button>
          <button type="button" onClick={() => { onRemove(); onClose(); }} className="xv-file-tool-btn text-red-400 flex-1 justify-center">
            <Trash2 className="w-3 h-3" /> Remove
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ChatBarFileGrid({
  files,
  onRemove,
  onRename,
}: {
  files: File[];
  onRemove: (index: number) => void;
  onRename: (index: number, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [urls, setUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    const next: Record<number, string> = {};
    files.forEach((f, i) => {
      if (f.type.startsWith('image/') || f.type.startsWith('video/')) {
        next[i] = URL.createObjectURL(f);
      }
    });
    setUrls(next);
    return () => Object.values(next).forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const visibleFiles = useMemo(() => {
    if (expanded) return files;
    return files.slice(0, VISIBLE);
  }, [files, expanded]);

  if (files.length === 0) return null;

  const previewFile = previewIdx !== null ? files[previewIdx] : null;

  return (
    <div className="px-2 sm:px-3 py-2">
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 items-end">
        {visibleFiles.map((f) => {
          const i = files.indexOf(f);
          const kind = fileKind(f.type, f.name);
          const url = urls[i];
          const isImage = f.type.startsWith('image/');
          const isVideo = f.type.startsWith('video/');
          const isAudio = f.type.startsWith('audio/');

          return (
            <div
              key={`${f.name}-${i}`}
              role="button"
              tabIndex={0}
              onClick={() => setPreviewIdx(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPreviewIdx(i); }}
              className={cn(
                'group relative rounded-lg overflow-hidden bg-black/15 xv-file-tile cursor-pointer',
                isImage ? 'flex items-center justify-center p-1 min-h-[48px]' : 'aspect-square'
              )}
            >
              {url && isImage ? (
                <NaturalImageThumb url={url} alt={f.name} />
              ) : isVideo ? (
                <div className="w-full h-full flex items-center justify-center bg-black/25">
                  <Film className="w-6 h-6 text-[var(--muted)]" />
                </div>
              ) : isAudio ? (
                <div className="w-full h-full flex items-center justify-center bg-black/25">
                  <Music className="w-6 h-6 text-[var(--muted)]" />
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black/25">
                  <FileText className="w-6 h-6 text-[var(--muted)]" />
                </div>
              )}
              <span className="absolute top-0.5 left-0.5 text-[7px] font-bold px-1 py-0.5 rounded bg-black/50 text-white/90">
                {kind}
              </span>
              <span className="absolute bottom-0 inset-x-0 text-[7px] px-1 py-0.5 bg-black/55 text-white/80 truncate">
                {formatSize(f.size)}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 z-[2]"
                aria-label={`Remove ${f.name}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
      </div>
      {files.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 w-full flex items-center justify-center gap-1 text-[10px] text-[var(--muted)] py-1 rounded-lg hover:bg-white/5 shadow-sm"
        >
          <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
          {expanded ? 'Show less' : `+${files.length - VISIBLE} more`}
        </button>
      )}
      {previewFile && previewIdx !== null && (
        <FilePreviewModal
          file={previewFile}
          url={urls[previewIdx] ?? null}
          onClose={() => setPreviewIdx(null)}
          onRename={(name) => onRename(previewIdx, name)}
          onRemove={() => onRemove(previewIdx)}
        />
      )}
    </div>
  );
}
