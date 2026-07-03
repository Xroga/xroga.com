'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface VoiceWaveformProps {
  stream: MediaStream | null;
  active: boolean;
  className?: string;
  bars?: number;
}

export function VoiceWaveform({ stream, active, className, bars = 24 }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stream || !active) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(data);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const gap = 3;
      const barW = (w - gap * (bars - 1)) / bars;
      const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#4a7aff';

      for (let i = 0; i < bars; i++) {
        const idx = Math.floor((i / bars) * data.length);
        const v = data[idx] / 255;
        const barH = Math.max(4, v * h * 0.92);
        const x = i * (barW + gap);
        const y = (h - barH) / 2;

        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.35 + v * 0.65;
        ctx.fillRect(x, y, barW, barH);
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      void audioCtx.close();
    };
  }, [stream, active, bars]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={48}
      className={cn('xv-voice-waveform', !active && 'opacity-30', className)}
      aria-hidden
    />
  );
}
