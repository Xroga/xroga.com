'use client';

import { useEffect, useRef } from 'react';

type GlitterCell = {
  gx: number;
  gy: number;
  value: number;
  target: number;
  touched: number;
  seed: number;
};

type PointerSample = {
  x: number;
  y: number;
  time: number;
};

const GRID = 16;
const CORE_RADIUS = 58;
const OUTER_RADIUS = 104;
const MAX_SIZE = 7.4;
const MIN_SIZE = 1.1;
const RISE_MS = 110;
const TARGET_DECAY_MS = 300;
const VISUAL_DECAY_MS = 430;
const MAX_LINGER_MS = 720;
const STAMP_GAP = 24;
const MAX_STAMPS_PER_FRAME = 4;
const MAX_CELLS = 360;
const OUTER_DENSITY = 0.34;
const MIN_MOVE = 1.6;
const BLUE = [38, 122, 230] as const;

function randomForCell(x: number, y: number, salt = 0) {
  let n = (Math.imul(x + salt * 17, 374761393) ^ Math.imul(y - salt * 23, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

function smoothstep01(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
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

    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastRenderedPointer: PointerSample | null = null;
    let latestPointer: PointerSample | null = null;
    let raf = 0;
    let lastFrame = performance.now();
    let scrolling = false;
    let scrollTimer = 0;
    const cells = new Map<string, GlitterCell>();

    const clearCanvas = () => {
      ctx.clearRect(0, 0, width, height);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      clearCanvas();
    };

    const activateCell = (gx: number, gy: number, amount: number, now: number) => {
      if (amount <= 0.025) return;

      const key = `${gx},${gy}`;
      let cell = cells.get(key);

      if (!cell) {
        if (cells.size >= MAX_CELLS) return;
        cell = {
          gx,
          gy,
          value: 0,
          target: 0,
          touched: now,
          seed: randomForCell(gx, gy, 91),
        };
        cells.set(key, cell);
      }

      cell.target = Math.min(1.15, Math.max(cell.target, amount) + amount * 0.18);
      cell.touched = now;
    };

    const stamp = (x: number, y: number, speed: number, now: number) => {
      const speedBoost = 1 + Math.min(speed, 2.2) * 0.045;
      const outer = OUTER_RADIUS * speedBoost;
      const outerSq = outer * outer;
      const coreSq = CORE_RADIUS * CORE_RADIUS;
      const minGX = Math.floor((x - outer) / GRID);
      const maxGX = Math.ceil((x + outer) / GRID);
      const minGY = Math.floor((y - outer) / GRID);
      const maxGY = Math.ceil((y + outer) / GRID);

      for (let gy = minGY; gy <= maxGY; gy += 1) {
        const py = gy * GRID;

        for (let gx = minGX; gx <= maxGX; gx += 1) {
          const px = gx * GRID;
          const dx = px - x;
          const dy = py - y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq > outerSq) continue;

          const noise = randomForCell(gx, gy, 7);
          const distance = Math.sqrt(distanceSq);
          let amount = 0;

          if (distanceSq <= coreSq) {
            const t = smoothstep01(1 - distance / CORE_RADIUS);
            amount = 0.4 + Math.pow(t, 0.62) * 0.62;
            if (noise < 0.04 && amount < 0.68) continue;
          } else {
            const t = 1 - (distance - CORE_RADIUS) / (outer - CORE_RADIUS);
            const falloff = Math.pow(Math.max(0, t), 1.45);
            const keepChance =
              0.035 +
              falloff * OUTER_DENSITY +
              Math.min(speed, 2.2) * 0.018;
            if (noise > keepChance) continue;

            amount =
              (0.1 + falloff * 0.38) *
              (0.76 + randomForCell(gx, gy, 19) * 0.32);
          }

          activateCell(gx, gy, amount, now);
        }
      }
    };

    const emitLatestSegment = (now: number) => {
      const current = latestPointer;
      if (!current) return;

      if (!lastRenderedPointer) {
        lastRenderedPointer = current;
        stamp(current.x, current.y, 0, now);
        return;
      }

      const dx = current.x - lastRenderedPointer.x;
      const dy = current.y - lastRenderedPointer.y;
      const distance = Math.hypot(dx, dy);

      if (distance < MIN_MOVE) {
        lastRenderedPointer = current;
        return;
      }

      const delta = Math.max(1, current.time - lastRenderedPointer.time);
      const speed = distance / delta;
      const desiredSteps = Math.max(1, Math.ceil(distance / STAMP_GAP));
      const steps = Math.min(MAX_STAMPS_PER_FRAME, desiredSteps);

      for (let index = 1; index <= steps; index += 1) {
        const t = index / steps;
        stamp(
          lastRenderedPointer.x + dx * t,
          lastRenderedPointer.y + dy * t,
          speed,
          now,
        );
      }

      lastRenderedPointer = current;
    };

    const frame = (now: number) => {
      raf = 0;
      const delta = Math.min(34, Math.max(1, now - lastFrame));
      lastFrame = now;

      // During active scroll, prioritize scrolling and the immediate pointer.
      if (!scrolling) emitLatestSegment(now);

      clearCanvas();

      let alive = 0;
      const riseK = 1 - Math.exp(-delta / RISE_MS);
      const targetDecay = Math.exp(-delta / TARGET_DECAY_MS);
      const visualDecay = Math.exp(-delta / VISUAL_DECAY_MS);

      for (const [key, cell] of cells) {
        cell.value += (cell.target - cell.value) * riseK;
        cell.target *= targetDecay;

        if (cell.target < cell.value) {
          cell.value *= visualDecay;
        }

        const ageSinceTouch = now - cell.touched;
        if (
          (cell.value < 0.014 && cell.target < 0.014) ||
          ageSinceTouch > MAX_LINGER_MS
        ) {
          cells.delete(key);
          continue;
        }

        alive += 1;
        const x = cell.gx * GRID;
        const y = cell.gy * GRID;
        const glitter = 0.92 + 0.08 * Math.sin(now * 0.008 + cell.seed * Math.PI * 8);
        const visible = Math.max(0, Math.min(1, cell.value * glitter));
        const size = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.pow(visible, 0.7);
        const alpha = Math.min(0.94, 0.28 + visible * 0.84);
        const squareSize = Math.max(1, Math.round(size));

        ctx.fillStyle = `rgba(${BLUE[0]}, ${BLUE[1]}, ${BLUE[2]}, ${alpha})`;
        ctx.fillRect(
          Math.round(x - squareSize / 2),
          Math.round(y - squareSize / 2),
          squareSize,
          squareSize,
        );
      }

      const pointerChanged =
        latestPointer &&
        (!lastRenderedPointer ||
          latestPointer.x !== lastRenderedPointer.x ||
          latestPointer.y !== lastRenderedPointer.y);

      if (alive > 0 || pointerChanged) {
        raf = requestAnimationFrame(frame);
      }
    };

    const ensureAnimation = () => {
      if (raf) return;
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
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
      lastRenderedPointer = null;
    };

    const handleScroll = () => {
      scrolling = true;
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrolling = false;
        if (latestPointer) {
          lastRenderedPointer = latestPointer;
          ensureAnimation();
        }
      }, 90);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      cells.clear();
      latestPointer = null;
      lastRenderedPointer = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearCanvas();
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      if (raf) cancelAnimationFrame(raf);
      cells.clear();
      clearCanvas();
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
