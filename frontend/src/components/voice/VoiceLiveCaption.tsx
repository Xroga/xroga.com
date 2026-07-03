'use client';

import { cn } from '@/lib/utils';

interface VoiceLiveCaptionProps {
  speaker: 'user' | 'ai';
  label: string;
  text: string;
  live?: boolean;
  placeholder?: string;
  visible?: boolean;
}

export function VoiceLiveCaption({
  speaker,
  label,
  text,
  live,
  placeholder,
  visible = true,
}: VoiceLiveCaptionProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        'xv-voice-live-caption',
        speaker === 'user' ? 'xv-voice-live-caption--user' : 'xv-voice-live-caption--ai',
        live && 'xv-voice-live-caption--live'
      )}
    >
      <span className="xv-voice-live-caption-label">{label}</span>
      <p className={cn(!text && placeholder && 'xv-voice-muted italic')}>
        {text || placeholder || '…'}
      </p>
    </div>
  );
}
