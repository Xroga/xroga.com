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

const GRID = 11;
const CORE_RADIUS = 82;
const OUTER_RADIUS = 158;
const MAX_SIZE = 8.8;
const MIN_SIZE = 1.2;
const RISE_MS = 150;
const TARGET_DECAY_MS = 520;
const VISUAL_DECAY_MS = 780;
const MAX_LINGER_MS = 1500;
const STAMP_GAP = 10;
const OUTER_DENSITY = 0.56;
const MIN_MOVE = 0.8;
const PINK = [80, 160, 255] as const;

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

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastPointer: { x: number; y: number } | null = null;
    let lastMoveTime = 0;
    let raf = 0;
    let lastFrame = performance.now();
    const cells = new Map<string, GlitterCell>();

    const clearCanvas = () => {
      ctx.clearRect(0, 0, width, height);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      if (amount <= 0.015) return;

      const key = `${gx},${gy}`;
      let cell = cells.get(key);

      if (!cell) {
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

      cell.target = Math.min(1.22, Math.max(cell.target, amount) + amount * 0.25);
      cell.touched = now;
    };

    const stamp = (x: number, y: number, speed: number, now: number) => {
      const outer = OUTER_RADIUS * (1 + Math.min(speed, 2.5) * 0.08);
      const minGX = Math.floor((x - outer) / GRID) - 1;
      const maxGX = Math.ceil((x + outer) / GRID) + 1;
      const minGY = Math.floor((y - outer) / GRID) - 1;
      const maxGY = Math.ceil((y + outer) / GRID) + 1;

      for (let gy = minGY; gy <= maxGY; gy += 1) {
        const py = gy * GRID;

        for (let gx = minGX; gx <= maxGX; gx += 1) {
          const px = gx * GRID;
          const distance = Math.hypot(px - x, py - y);
          if (distance > outer) continue;

          const noise = randomForCell(gx, gy, 7);
          let amount = 0;

          if (distance <= CORE_RADIUS) {
            let t = 1 - distance / CORE_RADIUS;
            t = smoothstep01(t);
            amount = 0.38 + Math.pow(t, 0.58) * 0.72;
            if (noise < 0.025 && amount < 0.72) continue;
          } else {
            const t = 1 - (distance - CORE_RADIUS) / (outer - CORE_RADIUS);
            const falloff = Math.pow(Math.max(0, t), 1.35);
            const keepChance = 0.05 + falloff * OUTER_DENSITY + Math.min(speed, 2.5) * 0.035;
            if (noise > keepChance) continue;

            amount = (0.12 + falloff * 0.46) * (0.72 + randomForCell(gx, gy, 19) * 0.42);
          }

          activateCell(gx, gy, amount, now);
        }
      }
    };

    const emitSegment = (x0: number, y0: number, x1: number, y1: number, speed: number, now: number) => {
      const distance = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(distance / STAMP_GAP));

      for (let index = 0; index <= steps; index += 1) {
        const t = index / steps;
        stamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, speed, now);
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const delta = Math.min(40, Math.max(1, now - lastFrame));
      lastFrame = now;
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
        if ((cell.value < 0.012 && cell.target < 0.012) || ageSinceTouch > MAX_LINGER_MS) {
          cells.delete(key);
          continue;
        }

        alive += 1;
        const x = cell.gx * GRID;
        const y = cell.gy * GRID;
        const glitter = 0.9 + 0.1 * Math.sin(now * 0.009 + cell.seed * Math.PI * 8);
        const visible = Math.max(0, Math.min(1, cell.value * glitter));
        const size = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.pow(visible, 0.67);
        const alpha = Math.min(1, 0.22 + visible * 0.95);
        const squareSize = Math.max(1, Math.round(size));

        ctx.fillStyle = `rgba(${PINK[0]}, ${PINK[1]}, ${PINK[2]}, ${alpha})`;
        ctx.fillRect(
          Math.round(x - squareSize / 2),
          Math.round(y - squareSize / 2),
          squareSize,
          squareSize,
        );
      }

      if (alive > 0) {
        raf = requestAnimationFrame(frame);
      }
    };

    const ensureAnimation = () => {
      if (raf) return;
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const now = performance.now();
      const x = event.clientX;
      const y = event.clientY;

      if (!lastPointer) {
        lastPointer = { x, y };
        lastMoveTime = now;
        stamp(x, y, 0, now);
        ensureAnimation();
        return;
      }

      const distance = Math.hypot(x - lastPointer.x, y - lastPointer.y);
      if (distance < MIN_MOVE) return;

      const delta = Math.max(1, now - lastMoveTime);
      const speed = distance / delta;
      emitSegment(lastPointer.x, lastPointer.y, x, y, speed, now);
      lastPointer = { x, y };
      lastMoveTime = now;
      ensureAnimation();
    };

    const handlePointerLeave = () => {
      lastPointer = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      cells.clear();
      lastPointer = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearCanvas();
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (raf) cancelAnimationFrame(raf);
      cells.clear();
      clearCanvas();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[35] h-screen w-screen"
    />
  );
}
