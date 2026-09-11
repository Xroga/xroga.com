'use client';

import { useEffect, useRef } from 'react';

type ThemeName = 'white' | 'gray' | 'black' | 'beige';

type ThemePalette = {
  low: [number, number, number];
  mid: [number, number, number];
  high: [number, number, number];
  glow: [number, number, number];
  baseAlpha: number;
  highAlpha: number;
};

const THEMES: Record<ThemeName, ThemePalette> = {
  white: {
    low: [190, 215, 235],
    mid: [120, 181, 235],
    high: [55, 133, 218],
    glow: [64, 145, 230],
    baseAlpha: 0.23,
    highAlpha: 0.92,
  },
  gray: {
    low: [174, 179, 186],
    mid: [226, 229, 233],
    high: [255, 255, 255],
    glow: [255, 255, 255],
    baseAlpha: 0.22,
    highAlpha: 0.92,
  },
  black: {
    low: [68, 73, 80],
    mid: [161, 167, 176],
    high: [247, 249, 252],
    glow: [245, 248, 252],
    baseAlpha: 0.19,
    highAlpha: 0.96,
  },
  beige: {
    low: [190, 170, 145],
    mid: [221, 201, 174],
    high: [255, 250, 243],
    glow: [255, 247, 233],
    baseAlpha: 0.22,
    highAlpha: 0.92,
  },
};

const CFG = {
  columns: 128,
  speed: 15,
  fillThreshold: 0.3,
  dashHead: 0.1,
  dashTail: 1,
  rowFloor: 0.3,
  curvature: 1,
  glow: 0.25,
  opacity: 1,
  cursorRadius: 0.5,
  cursorIntensity: 1,
  alternateRows: true,
  cursorInteraction: true,
};

function currentTheme(): ThemeName {
  if (document.body.classList.contains('theme-beige')) return 'beige';
  if (document.body.classList.contains('theme-gray')) return 'gray';
  if (document.body.classList.contains('theme-black')) return 'black';
  return 'white';
}

function rand01(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mixColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(mix(a[0], b[0], t)),
    Math.round(mix(a[1], b[1], t)),
    Math.round(mix(a[2], b[2], t)),
  ];
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function AiCodingAgentSquaresTerminal({
  className = '',
}: {
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hero = canvas.parentElement;
    if (!hero) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');

    let width = 1;
    let height = 1;
    let dpr = 1;
    let cols = CFG.columns;
    let rows = 64;
    let raf = 0;
    let visible = true;
    let theme: ThemeName = currentTheme();

    let seeds = new Float32Array(0);
    let phases = new Float32Array(0);
    let speeds = new Float32Array(0);
    let sizeBias = new Float32Array(0);

    const mouse = {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      strength: 0,
    };

    const rebuild = () => {
      cols = width < 720 ? 78 : CFG.columns;
      rows = Math.max(44, Math.round(cols * (height / width) * 0.82));

      const count = rows * cols;
      seeds = new Float32Array(count);
      phases = new Float32Array(count);
      speeds = new Float32Array(count);
      sizeBias = new Float32Array(count);

      for (let i = 0; i < count; i += 1) {
        seeds[i] = rand01(i + 11);
        phases[i] = rand01(i + 211) * Math.PI * 2;
        speeds[i] = 0.55 + rand01(i + 91) * 0.85;
        sizeBias[i] = 0.78 + rand01(i + 451) * 0.55;
      }
    };

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);

      dpr = Math.min(window.devicePixelRatio || 1, 1.25);

      const nextWidth = Math.max(1, Math.floor(width * dpr));
      const nextHeight = Math.max(1, Math.floor(height * dpr));

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        rebuild();

        mouse.x = width * 0.5;
        mouse.y = height * 0.5;
        mouse.tx = mouse.x;
        mouse.ty = mouse.y;
      }
    };

    const render = (now: number) => {
      if (!visible) {
        raf = requestAnimationFrame(render);
        return;
      }

      resize();
      ctx.clearRect(0, 0, width, height);

      mouse.x += (mouse.tx - mouse.x) * 0.07;
      mouse.y += (mouse.ty - mouse.y) * 0.07;
      mouse.strength *= 0.994;

      const palette = THEMES[theme];
      const cellW = width / cols;
      const cellH = height / rows;
      const gapX = Math.max(1.8, cellW * 0.38);
      const gapY = Math.max(2, cellH * 0.38);
      const baseW = Math.max(2.1, cellW - gapX);
      const baseH = Math.max(2, cellH - gapY);

      const t = reducedMotion.matches ? 0 : now * 0.001 * (CFG.speed / 15);
      const radius = Math.max(width, height) * 0.22 * CFG.cursorRadius;

      for (let r = 0; r < rows; r += 1) {
        const rowWave =
          0.5 +
          0.5 *
            Math.sin(
              t * 0.95 +
                r * 0.42 +
                Math.sin(r * 0.11 + t * 0.18) * 0.75,
            );

        const rowEnergy = CFG.rowFloor + (1 - CFG.rowFloor) * rowWave;
        const curve =
          Math.sin(r * 0.18 + t * 0.35) *
          cellH *
          0.9 *
          CFG.curvature;

        const alternateOffset =
          CFG.alternateRows && r % 2 ? cellW * 0.48 : 0;

        for (let c = 0; c < cols; c += 1) {
          const i = r * cols + c;
          const seed = seeds[i];

          const x = c * cellW + cellW * 0.5 + alternateOffset;

          const wave2 = Math.cos(
            c * 0.047 -
              r * 0.13 +
              t * 0.72 +
              phases[i] * 0.7,
          );

          const y =
            r * cellH +
            cellH * 0.5 +
            curve * (0.18 + 0.18 * wave2);

          const flicker =
            0.5 +
            0.5 *
              Math.sin(
                t * (2.15 * speeds[i]) +
                  phases[i] +
                  Math.sin(t * 0.33 + seed * 12) * 0.8,
              );

          const stream =
            0.5 +
            0.5 *
              Math.sin(
                c * 0.14 +
                  r * 0.082 -
                  t * 2.2 +
                  phases[i] * 0.5,
              );

          const dash = smoothstep(CFG.dashHead, CFG.dashTail, stream);

          const dx = x - mouse.x;
          const dy = y - mouse.y;
          const distance = Math.hypot(dx, dy);

          const cursor =
            CFG.cursorInteraction && finePointer.matches
              ? 1 - smoothstep(radius * 0.12, radius, distance)
              : 0;

          const cursorPower =
            cursor *
            mouse.strength *
            CFG.cursorIntensity;

          let energy =
            rowEnergy * 0.27 +
            flicker * 0.42 +
            dash * 0.31;

          const pocket =
            0.5 +
            0.5 *
              Math.sin(
                c * 0.035 +
                  r * 0.055 +
                  Math.sin(r * 0.04 + t * 0.25) * 1.25,
              );

          energy *= 0.72 + 0.4 * pocket;
          energy += cursorPower * 0.62;

          if (energy < CFG.fillThreshold) continue;

          const visibility = Math.max(
            0,
            Math.min(
              1,
              (energy - CFG.fillThreshold) / (1 - CFG.fillThreshold),
            ),
          );

          const color =
            visibility > 0.72
              ? mixColor(
                  palette.mid,
                  palette.high,
                  (visibility - 0.72) / 0.28,
                )
              : mixColor(
                  palette.low,
                  palette.mid,
                  visibility / 0.72,
                );

          const alpha =
            CFG.opacity *
            mix(
              palette.baseAlpha,
              palette.highAlpha,
              visibility,
            );

          const push = cursorPower * cellW * 1.6;
          const px =
            x +
            (dx / Math.max(1, distance)) * push;
          const py =
            y +
            (dy / Math.max(1, distance)) * push * 0.55;

          const dashScale =
            seed > 0.79
              ? mix(1, 1.9, dash)
              : mix(0.82, 1.2, dash);

          const squareWidth = Math.max(
            1,
            baseW *
              sizeBias[i] *
              dashScale *
              (0.72 + 0.42 * visibility),
          );

          const squareHeight = Math.max(
            1,
            baseH * (0.72 + 0.46 * visibility),
          );

          if (CFG.glow > 0 && visibility > 0.86) {
            ctx.shadowBlur = 5 * CFG.glow;
            ctx.shadowColor =
              `rgba(${palette.glow[0]},${palette.glow[1]},${palette.glow[2]},${(visibility - 0.86) * 0.36})`;
          } else {
            ctx.shadowBlur = 0;
          }

          ctx.fillStyle =
            `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;

          ctx.fillRect(
            Math.round(px - squareWidth / 2),
            Math.round(py - squareHeight / 2),
            Math.max(1, Math.round(squareWidth)),
            Math.max(1, Math.round(squareHeight)),
          );
        }
      }

      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(render);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!finePointer.matches) return;

      const rect = hero.getBoundingClientRect();

      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!inside) {
        mouse.strength *= 0.92;
        return;
      }

      mouse.tx = event.clientX - rect.left;
      mouse.ty = event.clientY - rect.top;
      mouse.strength = 1;
    };

    const themeObserver = new MutationObserver(() => {
      theme = currentTheme();
    });

    const resizeObserver = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
      },
      { threshold: 0.01 },
    );

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    resizeObserver.observe(hero);
    visibilityObserver.observe(hero);

    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });

    resize();
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      ctx.clearRect(0, 0, width, height);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
    />
  );
}
