'use client';

import { useEffect, useRef } from 'react';

/**
 * An original, lightweight XROGA visual: a lensing ring embedded in a
 * stippled particle hemisphere. The canvas is presentational only;
 * accessible content is supplied by the surrounding HTML.
 */
export function BlackHoleVisual() {
  const surface = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = surface.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;
    const ctx = context;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    let stopped = false;
    let frame = 0;
    let w = 0;
    let h = 0;
    let lastFrame = 0;
    const hash = (n: number) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
      return s - Math.floor(s);
    };

    const measure = () => {
      const r = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(0);
    };

    function draw(seconds: number) {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const radius = Math.min(w * 0.49, h * 0.86);
      const centerX = w * 0.5;
      const baseline = h * 0.97;
      const holeY = baseline - radius * 0.41;
      const holeR = radius * 0.215;

      const haze = ctx.createRadialGradient(centerX, holeY, holeR * .55, centerX, holeY, radius * 1.3);
      haze.addColorStop(0, 'rgba(255,255,255,.14)');
      haze.addColorStop(.35, 'rgba(190,190,190,.065)');
      haze.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h);

      // Stippled upper hemisphere: perspective, occlusion and deterministic density.
      const amount = w < 640 ? 1900 : 4400;
      const phase = seconds * .012;
      for (let i = 0; i < amount; i++) {
        const horizontal = hash(i * 3 + 19) * 2 - 1;
        const elevation = hash(i * 7 + 101);
        const dome = Math.sqrt(Math.max(0, 1 - horizontal * horizontal));
        const offsetX = horizontal * radius;
        const offsetY = elevation * dome * radius * .94;
        const x = centerX + offsetX + Math.sin(phase + i * .02) * .65;
        const y = baseline - offsetY;
        const dx = x - centerX;
        const dy = (y - holeY) * 1.1;
        if (dx * dx + dy * dy < holeR * holeR * 1.3) continue;
        const strength = .11 + .58 * hash(i * 11 + 87);
        const lowerGlow = .35 + .65 * (1 - elevation);
        const twinkle = media.matches ? 1 : (.85 + .15 * Math.sin(seconds * .5 + i));
        ctx.fillStyle = 'rgba(242,243,246,' + (strength * lowerGlow * twinkle).toFixed(3) + ')';
        const dot = i % 37 === 0 ? 1.65 : i % 9 === 0 ? 1.05 : .65;
        ctx.fillRect(x, y, dot, dot);
      }

      // Accretion disk in flattened perspective: discrete particles, not a stock image.
      for (let i = 0; i < 1800; i++) {
        const orbit = hash(i * 13 + 27) * Math.PI * 2 + phase * (i % 4 + 1);
        const distance = holeR * (1.3 + hash(i * 19 + 33) * 2.9);
        const x = centerX + Math.cos(orbit) * distance;
        const y = holeY + Math.sin(orbit) * distance * .29;
        const opacity = (.07 + .64 * hash(i * 17 + 8)) * Math.min(1, distance / (holeR * 2));
        ctx.fillStyle = 'rgba(242,245,249,' + opacity.toFixed(3) + ')';
        ctx.fillRect(x, y, i % 31 === 0 ? 1.65 : .7, i % 31 === 0 ? 1.65 : .7);
      }

      // Event horizon: deliberately black, outlined by gravitational lensing.
      const eclipse = ctx.createRadialGradient(centerX, holeY, 0, centerX, holeY, holeR * 1.45);
      eclipse.addColorStop(0, '#000000');
      eclipse.addColorStop(.69, '#000000');
      eclipse.addColorStop(.77, 'rgba(0,0,0,.99)');
      eclipse.addColorStop(.84, 'rgba(235,240,246,.30)');
      eclipse.addColorStop(.91, 'rgba(245,246,250,.07)');
      eclipse.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = eclipse;
      ctx.beginPath();
      ctx.arc(centerX, holeY, holeR * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(centerX, holeY);
      ctx.rotate(-.2);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, holeR * (1.25 + i * .17), holeR * (.76 + i * .12), 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(248,249,252,' + (.46 - i * .12) + ')';
        ctx.lineWidth = i === 0 ? 1.35 : .7;
        ctx.stroke();
      }
      ctx.restore();

      // Fine far-field stars.
      for (let i = 0; i < 100; i++) {
        const x = hash(i * 41 + 7) * w;
        const y = hash(i * 79 + 13) * h * .8;
        const a = hash(i * 23 + 5) * .47;
        ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        ctx.fillRect(x, y, i % 17 === 0 ? 1.6 : .75, i % 17 === 0 ? 1.6 : .75);
      }
    }

    function animate(timestamp: number) {
      if (stopped || media.matches) return;
      if (visible && timestamp - lastFrame > 52) {
        lastFrame = timestamp;
        draw(timestamp / 1000);
      }
      frame = requestAnimationFrame(animate);
    }

    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    resize?.observe(canvas);
    if (!resize) window.addEventListener('resize', measure);
    const observer = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => { visible = !!entries[0]?.isIntersecting; })
      : null;
    observer?.observe(canvas);
    measure();
    if (!media.matches) frame = requestAnimationFrame(animate);
    const onMotionChange = () => {
      cancelAnimationFrame(frame);
      draw(0);
      if (!media.matches) frame = requestAnimationFrame(animate);
    };
    media.addEventListener?.('change', onMotionChange);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      resize?.disconnect();
      observer?.disconnect();
      media.removeEventListener?.('change', onMotionChange);
      if (!resize) window.removeEventListener('resize', measure);
    };
  }, []);

  return <canvas ref={surface} aria-hidden="true" className="bh-event-canvas" />;
}
