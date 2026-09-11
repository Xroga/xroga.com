'use client';

import { useEffect, useRef } from 'react';

type ThemeName = 'white' | 'gray' | 'black' | 'beige';

type RGB = [number, number, number];

type ThemePalette = {
  background: RGB;
  star: RGB;
  dim: RGB;
  bloomA: RGB;
  bloomB: RGB;
  line: RGB;
};

type Particle = {
  x: number;
  y: number;
  z: number;
  size: number;
  speed: number;
  alpha: number;
  phase: number;
};

const PALETTES: Record<ThemeName, ThemePalette> = {
  white: {
    background: [244, 246, 249],
    star: [15, 20, 28],
    dim: [68, 80, 98],
    bloomA: [126, 160, 215],
    bloomB: [124, 92, 190],
    line: [38, 55, 84],
  },
  gray: {
    background: [65, 68, 74],
    star: [248, 249, 251],
    dim: [181, 187, 198],
    bloomA: [126, 156, 204],
    bloomB: [152, 136, 198],
    line: [220, 224, 232],
  },
  black: {
    background: [3, 4, 6],
    star: [248, 248, 246],
    dim: [144, 151, 164],
    bloomA: [122, 154, 202],
    bloomB: [124, 93, 192],
    line: [206, 213, 226],
  },
  beige: {
    background: [232, 223, 210],
    star: [31, 27, 23],
    dim: [103, 89, 78],
    bloomA: [154, 166, 197],
    bloomB: [126, 92, 174],
    line: [67, 58, 51],
  },
};

function getTheme(): ThemeName {
  if (document.body.classList.contains('theme-beige')) return 'beige';
  if (document.body.classList.contains('theme-gray')) return 'gray';
  if (document.body.classList.contains('theme-black')) return 'black';
  return 'white';
}

function rgba(color: RGB, alpha: number) {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
}

export function AiWebsiteBuilderAtmosphere({
  className = '',
}: {
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const rootNode = rootRef.current;
    const canvasNode = canvasRef.current;

    if (!rootNode || !canvasNode) return;
    const rootElement: HTMLDivElement = rootNode;
    const canvasElement: HTMLCanvasElement = canvasNode;

    const maybeContext = canvasElement.getContext('2d', { alpha: false });
    if (!maybeContext) return;
    const ctx: CanvasRenderingContext2D = maybeContext;

    let themeName = getTheme();
    let raf = 0;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let running = true;
    let last = performance.now();

    const pointer = {
      x: 0.5,
      y: 0.5,
      tx: 0.5,
      ty: 0.5,
    };

    const particles: Particle[] = Array.from({ length: 260 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.25 + Math.random() * 0.75,
      size: 0.45 + Math.random() * 1.6,
      speed: 0.015 + Math.random() * 0.045,
      alpha: 0.15 + Math.random() * 0.75,
      phase: Math.random() * Math.PI * 2,
    }));

    const beams = Array.from({ length: 15 }, (_, index) => ({
      x: 0.28 + (index / 14) * 0.44,
      y: 0.22 + Math.random() * 0.44,
      length: 0.08 + Math.random() * 0.26,
      speed: 0.00005 + Math.random() * 0.00011,
      alpha: 0.07 + Math.random() * 0.16,
      phase: Math.random() * Math.PI * 2,
    }));

    function resize() {
      const rect = rootElement.getBoundingClientRect();

      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      const rw = Math.max(1, Math.floor(width * dpr));
      const rh = Math.max(1, Math.floor(height * dpr));

      if (canvasElement.width !== rw || canvasElement.height !== rh) {
        canvasElement.width = rw;
        canvasElement.height = rh;
        canvasElement.style.width = `${width}px`;
        canvasElement.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    function drawBloom(
      x: number,
      y: number,
      radius: number,
      color: RGB,
      alpha: number,
    ) {
      const gradient = ctx.createRadialGradient(
        x,
        y,
        0,
        x,
        y,
        radius,
      );

      gradient.addColorStop(0, rgba(color, alpha));
      gradient.addColorStop(0.32, rgba(color, alpha * 0.36));
      gradient.addColorStop(1, rgba(color, 0));

      ctx.fillStyle = gradient;
      ctx.fillRect(
        x - radius,
        y - radius,
        radius * 2,
        radius * 2,
      );
    }

    function render(now: number) {
      raf = requestAnimationFrame(render);
      if (!running) return;

      const delta = Math.min(40, now - last);
      last = now;

      pointer.x += (pointer.tx - pointer.x) * 0.035;
      pointer.y += (pointer.ty - pointer.y) * 0.035;

      const palette = PALETTES[themeName];
      const light = themeName === 'white' || themeName === 'beige';

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgb(${palette.background.join(',')})`;
      ctx.fillRect(0, 0, width, height);

      const px = (pointer.x - 0.5) * width * 0.035;
      const py = (pointer.y - 0.5) * height * 0.035;

      if (!light) ctx.globalCompositeOperation = 'screen';

      drawBloom(
        width * 0.08 + px,
        height * 0.92 + py,
        Math.max(width, height) * 0.42,
        palette.bloomA,
        light ? 0.16 : 0.26,
      );

      drawBloom(
        width * 0.94 + px * 0.45,
        height * 0.05 + py * 0.45,
        Math.max(width, height) * 0.31,
        palette.bloomB,
        light ? 0.12 : 0.18,
      );

      ctx.globalCompositeOperation = 'source-over';

      // Subtle vertical "interface" rails.
      beams.forEach((beam, index) => {
        const travel =
          (now * beam.speed + beam.phase + index * 0.07) % 1;

        const x =
          width * beam.x +
          Math.sin(now * 0.00018 + index) * width * 0.008 +
          px * 0.24;

        const y =
          height * (beam.y + travel * 0.42);

        const length = height * beam.length;

        const gradient = ctx.createLinearGradient(
          x,
          y - length,
          x,
          y + length,
        );

        gradient.addColorStop(0, rgba(palette.line, 0));
        gradient.addColorStop(
          0.42,
          rgba(palette.line, beam.alpha),
        );
        gradient.addColorStop(
          0.58,
          rgba(palette.line, beam.alpha * 0.86),
        );
        gradient.addColorStop(1, rgba(palette.line, 0));

        ctx.strokeStyle = gradient;
        ctx.lineWidth = index % 5 === 0 ? 1.25 : 0.6;

        ctx.beginPath();
        ctx.moveTo(x, y - length);
        ctx.lineTo(x, y + length);
        ctx.stroke();
      });

      particles.forEach((particle) => {
        particle.y -=
          particle.speed *
          (delta / 1000) *
          (0.7 + particle.z);

        if (particle.y < -0.08) {
          particle.y = 1.08;
          particle.x = Math.random();
        }

        const drift =
          Math.sin(
            now * 0.00024 +
            particle.phase,
          ) *
          0.012 *
          particle.z;

        const x =
          (particle.x + drift) * width +
          px * particle.z;

        const y =
          particle.y * height +
          py * particle.z;

        const pulse =
          0.68 +
          0.32 *
            Math.sin(
              now * 0.0012 +
              particle.phase,
            );

        const color =
          particle.z > 0.64
            ? palette.star
            : palette.dim;

        ctx.fillStyle =
          rgba(
            color,
            particle.alpha *
              pulse *
              (light ? 0.72 : 0.92),
          );

        const size =
          particle.size *
          (0.65 + particle.z * 0.85);

        ctx.fillRect(
          x,
          y,
          size,
          size,
        );
      });

      // Sparse dot matrix around the perimeter.
      const step = 22;
      ctx.fillStyle = rgba(
        palette.dim,
        light ? 0.08 : 0.11,
      );

      for (let y = step; y < height; y += step) {
        for (let x = step; x < width; x += step) {
          const nx = x / width;
          const ny = y / height;

          const edge =
            Math.min(
              nx,
              1 - nx,
              ny,
              1 - ny,
            );

          if (edge > 0.17) continue;

          const noise =
            Math.sin(x * 0.071 + y * 0.043) *
              0.5 +
            0.5;

          if (noise > 0.57) {
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }

      // Fine film grain.
      ctx.globalCompositeOperation = 'source-over';
      const grainAlpha = light ? 0.025 : 0.045;

      for (let i = 0; i < 150; i += 1) {
        const x = Math.random() * width;
        const y = Math.random() * height;

        ctx.fillStyle =
          Math.random() > 0.5
            ? rgba(palette.star, grainAlpha)
            : rgba(palette.dim, grainAlpha);

        ctx.fillRect(x, y, 1, 1);
      }
    }

    function handlePointer(event: PointerEvent) {
      const rect = rootElement.getBoundingClientRect();

      pointer.tx =
        Math.max(
          0,
          Math.min(
            1,
            (event.clientX - rect.left) / rect.width,
          ),
        );

      pointer.ty =
        Math.max(
          0,
          Math.min(
            1,
            (event.clientY - rect.top) / rect.height,
          ),
        );
    }

    const themeObserver = new MutationObserver(() => {
      themeName = getTheme();
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(rootElement);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        running = entry?.isIntersecting ?? true;
        if (running) last = performance.now();
      },
      { threshold: 0.01 },
    );

    intersectionObserver.observe(rootElement);

    window.addEventListener('pointermove', handlePointer, {
      passive: true,
    });

    resize();
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('pointermove', handlePointer);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`xwb-atmosphere ${className}`.trim()}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="xwb-atmosphere__canvas" />
    </div>
  );
}
