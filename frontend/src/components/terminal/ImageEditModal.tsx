'use client';

import { useState, useCallback, useEffect, type ComponentType, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Copy,
  Share2,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Crop,
  Eraser,
  Maximize2,
  Send,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type AspectRatio,
  type ImageTransform,
  DEFAULT_TRANSFORM,
  copyImageToClipboard,
  downloadImage,
  buildImageEditPrompt,
} from '@/lib/imageStudioUtils';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useThemeStore } from '@/store/useThemeStore';
import toast from 'react-hot-toast';

const RATIOS: { id: AspectRatio; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '3:4', label: '3:4' },
];

interface ImageEditModalProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt?: string;
  variants?: Array<{ imageUrl: string; provider?: string; matchScore?: number }>;
}

export function ImageEditModal({ open, onClose, src, alt = 'Image', variants = [] }: ImageEditModalProps) {
  const { setPrompt, submit } = useTerminalChat();
  const siteTheme = useThemeStore((s) => s.theme);
  const [transform, setTransform] = useState<ImageTransform>(DEFAULT_TRANSFORM);
  const [editPrompt, setEditPrompt] = useState('');
  const [cropMode, setCropMode] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(src);

  useEffect(() => {
    if (open) setPreviewSrc(src);
  }, [open, src]);

  const resetTransform = useCallback(() => setTransform(DEFAULT_TRANSFORM), []);

  if (!open || typeof document === 'undefined') return null;

  const previewStyle: CSSProperties = {
    transform: `rotate(${transform.rotation}deg) scaleX(${transform.flipH ? -1 : 1}) scaleY(${transform.flipV ? -1 : 1})`,
    transition: 'transform 0.25s ease',
  };

  const ar = transform.aspectRatio;
  const frameClass =
    ar === '1:1'
      ? 'aspect-square'
      : ar === '4:3'
        ? 'aspect-[4/3]'
        : ar === '16:9'
          ? 'aspect-video'
          : ar === '9:16'
            ? 'aspect-[9/16]'
            : ar === '3:4'
              ? 'aspect-[3/4]'
              : '';

  function rotateCW() {
    setTransform((t) => ({ ...t, rotation: t.rotation + 90 }));
  }

  function rotateCCW() {
    setTransform((t) => ({ ...t, rotation: t.rotation - 90 }));
  }

  function toggleFlipH() {
    setTransform((t) => ({ ...t, flipH: !t.flipH }));
  }

  function toggleFlipV() {
    setTransform((t) => ({ ...t, flipV: !t.flipV }));
  }

  function setRatio(ratio: AspectRatio) {
    setTransform((t) => ({ ...t, aspectRatio: ratio }));
    if (ratio !== 'free') setCropMode(true);
  }

  function runAiAction(action: string) {
    const prompt = buildImageEditPrompt(action, previewSrc, editPrompt.trim() || undefined);
    setPrompt(prompt);
    onClose();
    toast('Edit queued — press GO', { icon: '✨' });
  }

  function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editPrompt.trim()) return;
    const prompt = buildImageEditPrompt('Apply this edit', previewSrc, editPrompt.trim());
    setPrompt(prompt);
    onClose();
    void submit(prompt);
    setEditPrompt('');
  }

  function handlePost() {
    toast('Post to social — connect in Integrations', { icon: '📤' });
  }

  const themeClass =
    siteTheme === 'white'
      ? 'xv-image-modal--white'
      : siteTheme === 'black'
        ? 'xv-image-modal--black'
        : 'xv-image-modal--gray';

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={cn(
          'relative z-10 flex flex-col w-full max-w-4xl max-h-[95vh] rounded-2xl border shadow-2xl overflow-hidden xv-image-modal-enter',
          themeClass
        )}
      >
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0 xv-image-modal-header">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#60a5fa]" />
            <h2 className="text-sm font-bold text-[var(--foreground)]">AI Image Editor</h2>
            <span className="text-[9px] text-[var(--muted)] hidden sm:inline">Personal & Commercial use</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--muted)]"
            aria-label="Close editor"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-4 min-h-[200px] lg:min-h-0 overflow-auto xv-image-modal-preview">
            <div
              className={cn(
                'relative flex items-center justify-center w-full max-w-lg overflow-hidden rounded-xl border xv-image-modal-frame',
                cropMode && frameClass ? frameClass : 'max-h-[50vh]'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt={alt}
                className={cn(
                  'max-w-full max-h-[50vh] object-contain',
                  cropMode && frameClass && 'object-cover w-full h-full'
                )}
                style={previewStyle}
              />
            </div>
          </div>

          <aside className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l flex flex-col xv-image-modal-aside">
            <div className="p-3 space-y-3 overflow-y-auto flex-1">
              <section>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Ratio</p>
                <div className="flex flex-wrap gap-1">
                  {RATIOS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRatio(r.id)}
                      className={cn(
                        'px-2 py-1 rounded-md text-[10px] font-medium border transition-colors',
                        transform.aspectRatio === r.id
                          ? 'border-[#006aff]/50 bg-[#006aff]/20 text-[#93c5fd]'
                          : 'border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/10'
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Transform</p>
                <div className="grid grid-cols-4 gap-1">
                  <ToolBtn icon={RotateCcw} label="↺" onClick={rotateCCW} title="Rotate left" />
                  <ToolBtn icon={RotateCw} label="↻" onClick={rotateCW} title="Rotate right" />
                  <ToolBtn icon={FlipHorizontal} label="↔" onClick={toggleFlipH} title="Flip horizontal" />
                  <ToolBtn icon={FlipVertical} label="↕" onClick={toggleFlipV} title="Flip vertical" />
                </div>
                <button
                  type="button"
                  onClick={() => setCropMode((c) => !c)}
                  className={cn(
                    'mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium border transition-colors',
                    cropMode
                      ? 'border-[#006aff]/40 bg-[#006aff]/15 text-[#93c5fd]'
                      : 'border-white/10 bg-white/5 text-[var(--muted)]'
                  )}
                >
                  <Crop className="h-3.5 w-3.5" />
                  Crop to ratio
                </button>
              </section>

              <section>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">AI tools</p>
                <div className="space-y-1">
                  <AiToolBtn
                    icon={Eraser}
                    label="Remove background"
                    onClick={() => runAiAction('Remove background')}
                  />
                  <AiToolBtn
                    icon={Maximize2}
                    label="Upscale 4×"
                    onClick={() => runAiAction('Upscale resolution 4x with enhanced detail')}
                  />
                </div>
              </section>

              <section className="flex flex-wrap gap-1">
                <MiniBtn
                  icon={Download}
                  label="Download"
                  onClick={() => downloadImage(previewSrc, 'xroga-edited.png', transform)}
                />
                <MiniBtn
                  icon={Copy}
                  label="Copy"
                  onClick={() => copyImageToClipboard(previewSrc, transform)}
                />
                <MiniBtn icon={Share2} label="Post" onClick={handlePost} />
              </section>

              <button
                type="button"
                onClick={resetTransform}
                className="text-[9px] text-[var(--muted)] hover:text-[var(--foreground)] underline"
              >
                Reset transforms
              </button>
            </div>

            <form
              onSubmit={handleChatSubmit}
              className="p-3 border-t shrink-0 xv-image-modal-chat"
            >
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                AI edit chat
              </p>
              <div className="flex gap-1.5 items-end rounded-xl border border-[#006aff]/30 bg-[#006aff]/5 p-1.5 focus-within:border-[#006aff]/50 transition-colors">
                <input
                  type="text"
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="e.g. make neon brighter, add rain…"
                  className="flex-1 min-w-0 bg-transparent text-[12px] text-[var(--foreground)] placeholder:text-[var(--muted)] px-2 py-1.5 outline-none"
                />
                <button
                  type="submit"
                  disabled={!editPrompt.trim()}
                  className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-[#006aff] text-white disabled:opacity-40 hover:bg-[#0056cc] transition-colors"
                  aria-label="Send edit"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </aside>
        </div>

        {variants.length > 1 && (
          <div className="border-t px-3 py-2 shrink-0 xv-image-modal-variants">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
              All tries from this prompt
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {variants.map((v) => (
                <button
                  key={v.imageUrl}
                  type="button"
                  onClick={() => {
                    setPreviewSrc(v.imageUrl);
                    resetTransform();
                  }}
                  className={cn(
                    'relative shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors',
                    previewSrc === v.imageUrl
                      ? 'border-[#006aff]'
                      : 'border-white/10 hover:border-white/25',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.imageUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function ToolBtn({
  icon: Icon,
  label,
  onClick,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[var(--foreground)] transition-colors"
    >
      <Icon className="h-4 w-4 text-[#60a5fa]" />
      <span className="text-[9px] text-[var(--muted)]">{label}</span>
    </button>
  );
}

function AiToolBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-purple-500/25 bg-purple-500/10 hover:bg-purple-500/20 text-left transition-colors"
    >
      <Icon className="h-4 w-4 text-purple-300 shrink-0" />
      <span className="text-[11px] font-medium text-purple-200">{label}</span>
    </button>
  );
}

function MiniBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-[var(--foreground)]/80"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
