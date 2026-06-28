'use client';

import { useRef, useState } from 'react';
import { X, Upload, Check, Sparkles, Wand2, UserCircle2, Loader2, Box, Grid3x3, Camera } from 'lucide-react';
import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';
import { generateAvatarUrl, type AvatarGenerateStyle } from '@/lib/avatarGenerate';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface AvatarPickerModalProps {
  open: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  onSelect: (url: string) => void | Promise<void>;
  onUpload?: (file: File) => void | Promise<void>;
}

type UploadStyle = 'original' | '3d' | 'pixel';

export function AvatarPickerModal({
  open,
  onClose,
  currentUrl,
  onSelect,
  onUpload,
}: AvatarPickerModalProps) {
  const [picking, setPicking] = useState<string | null>(null);
  const [heroPrompt, setHeroPrompt] = useState('');
  const [selfPrompt, setSelfPrompt] = useState('');
  const [generating, setGenerating] = useState<AvatarGenerateStyle | null>(null);
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadStyle, setUploadStyle] = useState<UploadStyle>('original');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  async function pick(url: string) {
    setPicking(url);
    try {
      await onSelect(url);
      onClose();
    } finally {
      setPicking(null);
    }
  }

  async function generate(style: AvatarGenerateStyle) {
    const prompt = style === 'superhero' ? heroPrompt : selfPrompt;
    if (!prompt.trim()) {
      toast.error('Describe your avatar first');
      return;
    }
    setGenerating(style);
    try {
      await new Promise((r) => setTimeout(r, 900));
      const url = generateAvatarUrl(prompt, style);
      setGeneratedPreview(url);
      toast.success(style === 'superhero' ? 'Superhero avatar generated!' : '3D self avatar generated!');
    } finally {
      setGenerating(null);
    }
  }

  async function applyGenerated() {
    if (!generatedPreview) return;
    await pick(generatedPreview);
  }

  async function confirmUpload() {
    if (!pendingFile || !onUpload) return;
    if (uploadStyle === '3d') {
      const url = generateAvatarUrl(pendingFile.name, 'self3d');
      await pick(url);
      return;
    }
    if (uploadStyle === 'pixel') {
      const url = generateAvatarUrl(pendingFile.name, 'pixel');
      await pick(url);
      return;
    }
    await onUpload(pendingFile);
    setPendingFile(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-picker-title"
        className="relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[min(90vh,820px)] rounded-t-[28px] sm:rounded-[28px] border border-white/10 bg-[#1a1b26] shadow-[0_32px_80px_rgba(0,0,0,0.55)] flex flex-col overflow-hidden"
      >
        <div className="shrink-0 relative overflow-hidden px-5 py-5 border-b border-white/8">
          <div className="absolute inset-0 bg-gradient-to-br from-[#5865f2]/30 via-[#006aff]/20 to-[#fffc00]/10 pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#5865f2] to-[#006aff] flex items-center justify-center">
                  <Camera className="w-3.5 h-3.5 text-white" />
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/70">Profile</span>
              </div>
              <h2 id="avatar-picker-title" className="font-bold text-xl tracking-tight text-white">
                Choose or generate your avatar
              </h2>
              <p className="text-xs text-white/55 mt-1 max-w-sm">
                Pick a photo, upload your own, or AI-generate a superhero / 3D self portrait
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/15 text-white/80" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-5">
          <section className="rounded-2xl bg-[#23242f] border border-white/8 p-3.5 space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#5865f2] flex items-center gap-2">
              <Wand2 className="w-3.5 h-3.5" /> AI Avatar Generator
            </h3>
            <div className="space-y-3">
              <div className="rounded-xl bg-black/25 border border-white/6 p-3 space-y-2">
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#fffc00]" /> Superhero you love
                </p>
                <input
                  value={heroPrompt}
                  onChange={(e) => setHeroPrompt(e.target.value)}
                  placeholder="e.g. Goku, Batman, Ben 10…"
                  className="w-full text-xs px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/35 focus:outline-none focus:border-[#5865f2]/60"
                />
                <button
                  type="button"
                  disabled={generating === 'superhero'}
                  onClick={() => void generate('superhero')}
                  className="w-full text-xs font-bold py-2.5 rounded-xl bg-gradient-to-r from-[#5865f2] to-[#006aff] text-white hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {generating === 'superhero' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Generate Hero
                </button>
              </div>
              <div className="rounded-xl bg-black/25 border border-white/6 p-3 space-y-2">
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <UserCircle2 className="w-3.5 h-3.5 text-sky-300" /> Your 3D self
                </p>
                <input
                  value={selfPrompt}
                  onChange={(e) => setSelfPrompt(e.target.value)}
                  placeholder="Describe your look, style, vibe…"
                  className="w-full text-xs px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/35 focus:outline-none focus:border-[#006aff]/60"
                />
                <button
                  type="button"
                  disabled={generating === 'self3d'}
                  onClick={() => void generate('self3d')}
                  className="w-full text-xs font-bold py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-[#006aff] text-white hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {generating === 'self3d' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Generate 3D Self
                </button>
              </div>
            </div>
            {generatedPreview && (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-[#5865f2]/40 bg-[#5865f2]/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={generatedPreview} alt="Generated preview" className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white/20" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white">AI preview ready</p>
                  <p className="text-[10px] text-white/50">Use this as your profile photo</p>
                </div>
                <button
                  type="button"
                  onClick={() => void applyGenerated()}
                  className="text-xs font-bold px-3 py-2 rounded-xl bg-[#fffc00] text-black shrink-0"
                >
                  Use it
                </button>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/45 mb-2.5">Profile photos</h3>
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
              {XROGA_PROFILE_AVATARS.map((avatar, i) => {
                const selected = currentUrl === avatar.url;
                const loading = picking === avatar.url;
                return (
                  <button
                    key={avatar.url}
                    type="button"
                    disabled={!!picking}
                    onClick={() => void pick(avatar.url)}
                    className={cn(
                      'relative shrink-0 snap-start w-[72px] h-[72px] rounded-2xl overflow-hidden border-2 transition-all hover:scale-105',
                      selected ? 'border-[#fffc00] ring-2 ring-[#fffc00]/40' : 'border-white/15 hover:border-[#5865f2]/60'
                    )}
                    title={avatar.label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatar.url} alt={avatar.label} className="w-full h-full object-cover" loading={i < 5 ? 'eager' : 'lazy'} />
                    {selected && (
                      <span className="absolute inset-0 bg-[#5865f2]/30 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </span>
                    )}
                    {loading && (
                      <span className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="shrink-0 px-4 sm:px-5 py-4 border-t border-white/8 bg-[#1e1f2a] space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setPendingFile(file);
                setUploadStyle('original');
              }
            }}
          />

          {pendingFile ? (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-white/80">Style your upload</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'original' as const, label: 'Original', icon: Upload },
                  { key: '3d' as const, label: '3D vibe', icon: Box },
                  { key: 'pixel' as const, label: 'Pixel vibe', icon: Grid3x3 },
                ]).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setUploadStyle(key)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all',
                      uploadStyle === key
                        ? 'bg-[#5865f2]/25 border-[#5865f2] text-white'
                        : 'bg-white/5 border-white/10 text-white/60 hover:border-white/25'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingFile(null)}
                  className="flex-1 py-2.5 rounded-xl border border-white/15 text-xs font-semibold text-white/70"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmUpload()}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#fffc00] to-[#f59e0b] text-black text-xs font-bold"
                >
                  Apply photo
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-[#5865f2] to-[#006aff] text-white text-sm font-bold shadow-lg shadow-[#5865f2]/25 hover:opacity-95 transition-opacity"
            >
              <Upload className="w-4 h-4" /> Upload custom photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
