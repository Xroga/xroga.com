'use client';

import { useEffect, useRef } from 'react';

const BAR = 2;
const GAP = 2;
export const WAVE_HISTORY = 240;

/** Loudness of one batch of microphone samples, 0..1, for the live waveform. */
export function voiceLevel(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.min(1, Math.sqrt(sum / Math.max(1, samples.length)) * 6);
}

/** Scrolling bars drawn from real microphone levels, newest on the right.
 * Silence stays a row of dots, matching a dictation bar rather than an animation.
 */
export function VoiceWaveform({ levels, active }: { levels: { current: number[] }; active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    let frame = 0;
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = element.clientWidth, height = element.clientHeight;
      if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
        element.width = Math.round(width * ratio);
        element.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(element).color;
      const slots = Math.floor(width / (BAR + GAP)), history = levels.current;
      for (let slot = 0; slot < slots; slot++) {
        const index = history.length - slots + slot;
        const level = index >= 0 ? history[index] : 0;
        const barHeight = Math.max(BAR, level * height * 0.9);
        const x = slot * (BAR + GAP);
        context.globalAlpha = level > 0.04 ? 0.95 : 0.4;
        context.fillRect(x, (height - barHeight) / 2, BAR, barHeight);
      }
      if (active) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [levels, active]);
  return <canvas ref={canvas} className="xv-voice-live-wave" aria-hidden="true" data-testid="xroga-voice-waveform" />;
}
