'use client';

import { useEffect, useRef } from 'react';

type ThemeName = 'white' | 'gray' | 'black' | 'beige';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  alpha: number;
  spin: number;
  spinSpeed: number;
};

type PointerSample = {
  x: number;
  y: number;
  time: number;
};

const MAX_PARTICLES = 760;
const BASE_EMIT = 12;
const FAST_EMIT = 22;
const TRAIL_SPACING = 11;
const MAX_SEGMENT_POINTS = 7;
const DPR_CAP = 1.25;

function currentTheme(): ThemeName {
  if (document.body.classList.contains('theme-beige')) return 'beige';
  if (document.body.classList.contains('theme-gray')) return 'gray';
  if (document.body.classList.contains('theme-black')) return 'black';
  return 'white';
}

function themeRgb(theme: ThemeName): readonly [number, number, number] {
  if (theme === 'black' || theme === 'gray') return [255, 255, 255] as const;
  if (theme === 'beige') return [14, 14, 14] as const;
  return [37, 99, 235] as const;
}

function emitBurst(
  particles: Particle[],
  x: number,
  y: number,
  speed: number,
  count: number,
) {
  for (let index = 0; index < count; index += 1) {
    if (particles.length >= MAX_PARTICLES) particles.shift();

    const angle = Math.random() * Math.PI * 2;
    const spread = 12 + Math.random() * 58 + Math.min(speed, 3.5) * 13;
    const velocity = 0.05 + Math.random() * 0.27 + Math.min(speed, 3.2) * 0.055;
    const life = 360 + Math.random() * 620;

    particles.push({
      x: x + Math.cos(angle) * spread * Math.random(),
      y: y + Math.sin(angle) * spread * Math.random(),
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      size: 1.2 + Math.random() * 7.8,
      life,
      maxLife: life,
      alpha: 0.45 + Math.random() * 0.55,
      spin: Math.random() * Math.PI,
      spinSpeed: (Math.random() - 0.5) * 0.003,
    });
  }
}

export function HomepageCursorGlitter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');
    if (reducedMotion.matches || !finePointer.matches) return;

    const ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
    });
    if (!ctx) return;

    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;
    let lastFrame = performance.now();
    let latestPointer: PointerSample | null = null;
    let renderedPointer: PointerSample | null = null;
    let theme = currentTheme();
    let scrolling = false;
    let scrollTimer = 0;
    const particles: Particle[] = [];

    const resize = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };

    const emitTrail = () => {
      const current = latestPointer;
      if (!current || scrolling) return;

      if (!renderedPointer) {
        renderedPointer = current;
        emitBurst(particles, current.x, current.y, 0, BASE_EMIT + 5);
        return;
      }

      const dx = current.x - renderedPointer.x;
      const dy = current.y - renderedPointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.6) {
        renderedPointer = current;
        return;
      }

      const delta = Math.max(1, current.time - renderedPointer.time);
      const speed = distance / delta;
      const points = Math.min(
        MAX_SEGMENT_POINTS,
        Math.max(1, Math.ceil(distance / TRAIL_SPACING)),
      );
      const emitCount =
        BASE_EMIT +
        Math.min(
          FAST_EMIT - BASE_EMIT,
          Math.floor(speed * 4),
        );

      for (let point = 1; point <= points; point += 1) {
        const t = point / points;
        emitBurst(
          particles,
          renderedPointer.x + dx * t,
          renderedPointer.y + dy * t,
          speed,
          emitCount,
        );
      }

      renderedPointer = current;
    };

    const render = (now: number) => {
      raf = 0;
      const delta = Math.min(34, Math.max(1, now - lastFrame));
      lastFrame = now;

      emitTrail();
      ctx.clearRect(0, 0, width, height);

      const rgb = themeRgb(theme);
      let writeIndex = 0;

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        particle.life -= delta;
        if (particle.life <= 0) continue;

        const age = 1 - particle.life / particle.maxLife;
        const fadeIn = Math.min(1, age * 8);
        const fadeOut = Math.max(0, 1 - age);
        const alpha = particle.alpha * fadeIn * fadeOut * fadeOut;

        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vx *= 0.986;
        particle.vy *= 0.986;
        particle.spin += particle.spinSpeed * delta;

        const scale = 0.72 + (1 - age) * 0.48;
        const size = Math.max(1, particle.size * scale);

        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.spin);
        ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.restore();

        particles[writeIndex] = particle;
        writeIndex += 1;
      }

      particles.length = writeIndex;

      const pointerPending =
        latestPointer &&
        (!renderedPointer ||
          latestPointer.x !== renderedPointer.x ||
          latestPointer.y !== renderedPointer.y);

      if (particles.length > 0 || pointerPending) {
        raf = requestAnimationFrame(render);
      }
    };

    const ensureAnimation = () => {
      if (raf) return;
      lastFrame = performance.now();
      raf = requestAnimationFrame(render);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      latestPointer = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
      };
      ensureAnimation();
    };

    const handlePointerLeave = () => {
      latestPointer = null;
      renderedPointer = null;
    };

    const handleScroll = () => {
      scrolling = true;
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrolling = false;
        renderedPointer = latestPointer;
        ensureAnimation();
      }, 70);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      particles.length = 0;
      latestPointer = null;
      renderedPointer = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ctx.clearRect(0, 0, width, height);
    };

    const themeObserver = new MutationObserver(() => {
      theme = currentTheme();
      ensureAnimation();
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      themeObserver.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      if (raf) cancelAnimationFrame(raf);
      particles.length = 0;
      ctx.clearRect(0, 0, width, height);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="xv-homepage-cursor-glitter pointer-events-none fixed inset-0 z-[1] h-screen w-screen"
    />
  );
}
