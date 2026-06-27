'use client';

import { useRef, useState } from 'react';
import { X, Upload, Check, Sparkles, Wand2, UserCircle2, Loader2 } from 'lucide-react';
import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';
import { generateAvatarUrl } from '@/lib/avatarGenerate';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface AvatarPickerModalProps {
  open: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  onSelect: (url: string) => void | Promise<void>;
  onUpload?: (file: File) => void | Promise<void>;
}

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
  const [generating, setGenerating] = useState<'superhero' | 'self3d' | null>(null);
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
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

  async function generate(style: 'superhero' | 'self3d') {
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

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-picker-title"
        className="relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[min(90vh,780px)] rounded-t-3xl sm:rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[0_24px_80px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden"
      >
        <div className="shrink-0 px-5 sm:px-6 py-5 border-b border-[var(--card-border)]/50 bg-gradient-to-r from-[#006aff]/10 via-transparent to-slate-400/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--accent)]">Profile</span>
              </div>
              <h2 id="avatar-picker-title" className="font-bold text-xl sm:text-2xl tracking-tight">
                Choose or generate your avatar
              </h2>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
                Pick a photo, upload your own, or AI-generate a superhero / 3D self portrait
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-5 space-y-6">
          {/* AI Generators */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-2">
              <Wand2 className="w-3.5 h-3.5 text-[#006aff]" /> AI Avatar Generator
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[var(--card-border)]/50 p-3 bg-white/[0.03] space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Superhero you love
                </p>
                <input
                  value={heroPrompt}
                  onChange={(e) => setHeroPrompt(e.target.value)}
                  placeholder="e.g. Goku, Batman, Ben 10…"
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[var(--background)]/50 border border-[var(--card-border)]/40 focus:outline-none focus:border-[#006aff]/50"
                />
                <button
                  type="button"
                  disabled={generating === 'superhero'}
                  onClick={() => void generate('superhero')}
                  className="w-full text-xs font-bold py-2 rounded-xl bg-[#006aff] text-white hover:bg-[#1b7aff] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {generating === 'superhero' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Generate Hero
                </button>
              </div>
              <div className="rounded-2xl border border-[var(--card-border)]/50 p-3 bg-white/[0.03] space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <UserCircle2 className="w-3.5 h-3.5 text-slate-400" /> Your 3D self
                </p>
                <input
                  value={selfPrompt}
                  onChange={(e) => setSelfPrompt(e.target.value)}
                  placeholder="Describe your look, style, vibe…"
                  className="w-full text-xs px-3 py-2 rounded-xl bg-[var(--background)]/50 border border-[var(--card-border)]/40 focus:outline-none focus:border-[#006aff]/50"
                />
                <button
                  type="button"
                  disabled={generating === 'self3d'}
                  onClick={() => void generate('self3d')}
                  className="w-full text-xs font-bold py-2 rounded-xl bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {generating === 'self3d' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Generate 3D Self
                </button>
              </div>
            </div>
            {generatedPreview && (
              <div className="flex items-center gap-3 p-3 rounded-2xl border border-[#006aff]/30 bg-[#006aff]/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={generatedPreview} alt="Generated preview" className="w-16 h-16 rounded-xl object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">AI preview ready</p>
                  <p className="text-[10px] text-[var(--muted)]">Use this as your profile photo</p>
                </div>
                <button
                  type="button"
                  onClick={() => void applyGenerated()}
                  className="text-xs font-bold px-3 py-2 rounded-xl bg-[#006aff] text-white shrink-0"
                >
                  Use it
                </button>
              </div>
            )}
          </section>

          {/* Profile photos */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Profile photos</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
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
                      'relative aspect-square rounded-2xl overflow-hidden border-2 transition-all hover:scale-[1.05]',
                      selected ? 'border-[#006aff] ring-2 ring-[#006aff]/40' : 'border-[var(--card-border)]/50 hover:border-[#006aff]/50'
                    )}
                    title={avatar.label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatar.url} alt={avatar.label} className="w-full h-full object-cover" loading={i < 5 ? 'eager' : 'lazy'} />
                    {selected && (
                      <span className="absolute inset-0 bg-[#006aff]/25 flex items-center justify-center">
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

        <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-[var(--card-border)]/50">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && onUpload) void onUpload(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-[var(--card-border)] hover:border-[#006aff]/50 text-sm font-semibold transition-all"
          >
            <Upload className="w-4 h-4" /> Upload custom photo
          </button>
        </div>
      </div>
    </div>
  );
}
