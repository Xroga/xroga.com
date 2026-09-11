'use client';

import { useEffect, useRef } from 'react';

type ThemeName = 'white' | 'gray' | 'black' | 'beige';

type RGB = [number, number, number];

type ThemeConfig = {
  background: RGB;
  centerShade: RGB;
  colors: RGB[];
};

type Star = {
  x: number;
  y: number;
  z: number;
  prevZ: number;
  speed: number;
  size: number;
  colorIndex: number;
  twinkle: number;
  sideBoost: number;
  hot: boolean;
};

const SETTINGS = {
  speed: 0.5,
  intensity: 1,
  rotation: 0,
  opacity: 1,

  // Deliberately denser than the 128-streak reference so the hero feels full.
  streakCount: 320,

  stretchFactor: 0.055,
  fadePower: 1.72,
  maxFPS: 60,
  maxDpr: 1.5,
  interactionEnabled: true,
  pauseWhenOffscreen: true,
};

const THEMES: Record<ThemeName, ThemeConfig> = {
  // White theme: blue + black + purple.
  white: {
    background: [244, 247, 251],
    centerShade: [244, 247, 251],
    colors: [
      [27, 95, 224],
      [7, 10, 14],
      [103, 63, 212],
      [17, 73, 173],
      [54, 32, 122],
    ],
  },

  // Gray theme: white + blue + black.
  gray: {
    background: [72, 76, 82],
    centerShade: [72, 76, 82],
    colors: [
      [255, 255, 255],
      [77, 125, 255],
      [12, 14, 18],
      [206, 214, 225],
      [35, 58, 112],
    ],
  },

  // Black theme: white + gray + blue + purple.
  black: {
    background: [5, 5, 5],
    centerShade: [5, 5, 5],
    colors: [
      [255, 255, 255],
      [182, 188, 198],
      [79, 123, 255],
      [125, 92, 255],
      [225, 229, 236],
    ],
  },

  // Beige theme: white + black + purple.
  beige: {
    background: [234, 223, 206],
    centerShade: [234, 223, 206],
    colors: [
      [255, 255, 255],
      [8, 8, 10],
      [107, 63, 201],
      [58, 36, 105],
      [235, 231, 244],
    ],
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

export function AiChatLightspeed({
  className = '',
}: {
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;

    if (!root || !canvas) return;

    const ctx = canvas.getContext('2d', {
      alpha: false,
    });

    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let themeName = getTheme();
    let width = 1;
    let height = 1;
    let dpr = 1;

    let raf = 0;
    let running = true;
    let pressed = false;
    let compression = 0;
    let lastFrame = performance.now();
    let lastDraw = 0;

    const center = {
      x: 0.55,
      y: 0.51,
    };

    const stars: Star[] = [];

    const resetStar = (star: Star, fresh = false) => {
      const angle = Math.random() * Math.PI * 2;

      // Bias toward the middle and outer ring so the tunnel stays readable
      // while many streaks are still visible at once.
      const radius =
        0.07 +
        Math.pow(Math.random(), 0.52) * 1.15;

      star.x = Math.cos(angle) * radius;
      star.y =
        Math.sin(angle) *
        radius *
        (0.60 + Math.random() * 0.40);

      star.z = fresh
        ? 0.10 + Math.random() * 0.90
        : 0.90 + Math.random() * 0.16;

      star.prevZ =
        star.z + SETTINGS.stretchFactor;

      star.speed =
        0.70 + Math.random() * 0.90;

      star.size =
        0.45 + Math.random() * 1.65;

      star.colorIndex =
        Math.floor(Math.random() * 5);

      star.twinkle =
        Math.random() * Math.PI * 2;

      star.sideBoost =
        0.82 + Math.random() * 0.48;

      star.hot =
        Math.random() < 0.18;
    };

    for (let i = 0; i < SETTINGS.streakCount; i += 1) {
      const star: Star = {
        x: 0,
        y: 0,
        z: 1,
        prevZ: 1,
        speed: 1,
        size: 1,
        colorIndex: 0,
        twinkle: 0,
        sideBoost: 1,
        hot: false,
      };

      resetStar(star, true);
      stars.push(star);
    }

    const resize = () => {
      const rect = root.getBoundingClientRect();

      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);

      dpr = Math.min(
        window.devicePixelRatio || 1,
        SETTINGS.maxDpr,
      );

      const renderWidth = Math.max(
        1,
        Math.floor(width * dpr),
      );

      const renderHeight = Math.max(
        1,
        Math.floor(height * dpr),
      );

      if (
        canvas.width !== renderWidth ||
        canvas.height !== renderHeight
      ) {
        canvas.width = renderWidth;
        canvas.height = renderHeight;

        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        ctx.setTransform(
          dpr,
          0,
          0,
          dpr,
          0,
          0,
        );
      }
    };

    const project = (
      star: Star,
      z: number,
    ) => {
      const fov =
        Math.min(width, height) * 0.48;

      const rx =
        star.x * Math.cos(SETTINGS.rotation) -
        star.y * Math.sin(SETTINGS.rotation);

      const ry =
        star.x * Math.sin(SETTINGS.rotation) +
        star.y * Math.cos(SETTINGS.rotation);

      return {
        x:
          width * center.x +
          (rx / z) * fov,

        y:
          height * center.y +
          (ry / z) * fov,
      };
    };

    const inExtendedViewport = (
      point: { x: number; y: number },
    ) => {
      const margin = 220;

      return (
        point.x > -margin &&
        point.x < width + margin &&
        point.y > -margin &&
        point.y < height + margin
      );
    };

    const draw = (
      now: number,
      deltaSeconds: number,
    ) => {
      const theme = THEMES[themeName];

      const isLightTheme =
        themeName === 'white' ||
        themeName === 'beige';

      ctx.globalCompositeOperation = 'source-over';

      ctx.fillStyle =
        `rgb(${theme.background[0]},${theme.background[1]},${theme.background[2]})`;

      ctx.fillRect(
        0,
        0,
        width,
        height,
      );

      const targetCompression =
        pressed ? 1 : 0;

      compression +=
        (targetCompression - compression) *
        (pressed ? 0.17 : 0.055);

      const speedBoost =
        1 + compression * 2.8;

      const baseSpeed =
        0.18 *
        SETTINGS.speed *
        speedBoost;

      ctx.lineCap = 'round';

      for (const star of stars) {
        star.prevZ =
          star.z +
          SETTINGS.stretchFactor *
            (1 + compression * 1.8);

        if (!reducedMotion.matches) {
          star.z -=
            baseSpeed *
            star.speed *
            deltaSeconds;
        }

        const head = project(
          star,
          Math.max(star.z, 0.025),
        );

        const tail = project(
          star,
          Math.max(star.prevZ, 0.035),
        );

        if (
          star.z < 0.038 ||
          !inExtendedViewport(head)
        ) {
          resetStar(star, false);
          continue;
        }

        const progress =
          1 - Math.min(1, star.z);

        const fade =
          Math.pow(
            Math.max(0, progress),
            SETTINGS.fadePower,
          );

        let alpha =
          Math.min(
            1,
            0.10 + fade * 1.26,
          ) *
          SETTINGS.opacity *
          SETTINGS.intensity;

        // Light backgrounds need stronger opaque streak bodies.
        if (isLightTheme) {
          alpha =
            Math.min(
              1,
              alpha * 1.28 + 0.05,
            );
        }

        alpha *=
          0.80 +
          0.20 *
            Math.sin(
              now * 0.0015 +
              star.twinkle,
            );

        const color =
          theme.colors[
            star.colorIndex %
            theme.colors.length
          ];

        const dx =
          head.x - tail.x;

        const dy =
          head.y - tail.y;

        const length =
          Math.hypot(dx, dy);

        if (length < 0.35) continue;

        const edgePower =
          Math.min(
            1,
            length / 115,
          );

        const lineWidth =
          star.size *
          star.sideBoost *
          (0.62 + edgePower * 2.55) *
          (1 + compression * 0.30);

        /*
         * Dark themes use additive blending for a luminous hyperspace look.
         * Light themes must use source-over, otherwise black/purple/blue
         * wash out against white/beige.
         */
        ctx.globalCompositeOperation =
          isLightTheme
            ? 'source-over'
            : 'lighter';

        ctx.strokeStyle = rgba(
          color,
          isLightTheme
            ? alpha * 0.16
            : alpha * 0.08,
        );

        ctx.lineWidth =
          lineWidth *
          (isLightTheme ? 3.2 : 5.2);

        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();

        const gradient =
          ctx.createLinearGradient(
            tail.x,
            tail.y,
            head.x,
            head.y,
          );

        gradient.addColorStop(
          0,
          rgba(color, 0),
        );

        gradient.addColorStop(
          0.18,
          rgba(
            color,
            alpha *
              (isLightTheme
                ? 0.28
                : 0.20),
          ),
        );

        gradient.addColorStop(
          0.60,
          rgba(
            color,
            alpha *
              (isLightTheme
                ? 0.88
                : 0.74),
          ),
        );

        if (
          themeName === 'black' &&
          star.hot
        ) {
          gradient.addColorStop(
            1,
            `rgba(255,248,255,${Math.min(
              1,
              alpha * 1.18,
            )})`,
          );
        } else {
          gradient.addColorStop(
            1,
            rgba(
              color,
              Math.min(
                1,
                alpha *
                  (isLightTheme
                    ? 1.28
                    : 1.12),
              ),
            ),
          );
        }

        ctx.globalCompositeOperation =
          isLightTheme
            ? 'source-over'
            : 'lighter';

        ctx.strokeStyle = gradient;

        ctx.lineWidth =
          lineWidth *
          (isLightTheme ? 1.12 : 1);

        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();

        // Dark needle core keeps light-theme streaks crisp.
        if (isLightTheme) {
          ctx.globalCompositeOperation =
            'source-over';

          ctx.strokeStyle =
            rgba(
              color,
              Math.min(
                1,
                alpha * 0.92,
              ),
            );

          ctx.lineWidth =
            Math.max(
              0.75,
              lineWidth * 0.38,
            );

          ctx.beginPath();

          ctx.moveTo(
            tail.x + dx * 0.44,
            tail.y + dy * 0.44,
          );

          ctx.lineTo(
            head.x,
            head.y,
          );

          ctx.stroke();
        }

        // Faint extended trail.
        if (length > 16) {
          const farTail = {
            x:
              tail.x -
              dx * 0.28,

            y:
              tail.y -
              dy * 0.28,
          };

          const ghost =
            ctx.createLinearGradient(
              farTail.x,
              farTail.y,
              tail.x,
              tail.y,
            );

          ghost.addColorStop(
            0,
            rgba(color, 0),
          );

          ghost.addColorStop(
            1,
            rgba(
              color,
              alpha *
                (isLightTheme
                  ? 0.24
                  : 0.16),
            ),
          );

          ctx.globalCompositeOperation =
            isLightTheme
              ? 'source-over'
              : 'lighter';

          ctx.strokeStyle = ghost;

          ctx.lineWidth =
            Math.max(
              0.45,
              lineWidth *
                (isLightTheme
                  ? 0.62
                  : 0.52),
            );

          ctx.beginPath();
          ctx.moveTo(
            farTail.x,
            farTail.y,
          );
          ctx.lineTo(
            tail.x,
            tail.y,
          );
          ctx.stroke();
        }
      }

      // Sparse/quiet vanishing-point tunnel.
      ctx.globalCompositeOperation =
        'source-over';

      const tunnelRadius =
        Math.min(
          width,
          height,
        ) *
        (isLightTheme ? 0.205 : 0.235);

      const tunnel =
        ctx.createRadialGradient(
          width * center.x,
          height * center.y,
          0,
          width * center.x,
          height * center.y,
          tunnelRadius,
        );

      const shade =
        theme.centerShade;

      tunnel.addColorStop(
        0,
        `rgba(${shade[0]},${shade[1]},${shade[2]},${
          isLightTheme ? 0.78 : 0.96
        })`,
      );

      tunnel.addColorStop(
        0.31,
        `rgba(${shade[0]},${shade[1]},${shade[2]},${
          isLightTheme ? 0.58 : 0.80
        })`,
      );

      tunnel.addColorStop(
        0.66,
        `rgba(${shade[0]},${shade[1]},${shade[2]},${
          isLightTheme ? 0.12 : 0.20
        })`,
      );

      tunnel.addColorStop(
        1,
        `rgba(${shade[0]},${shade[1]},${shade[2]},0)`,
      );

      ctx.fillStyle = tunnel;
      ctx.fillRect(
        0,
        0,
        width,
        height,
      );

      // Global depth.
      const vignette =
        ctx.createRadialGradient(
          width * 0.5,
          height * 0.5,
          Math.min(width, height) * 0.18,
          width * 0.5,
          height * 0.5,
          Math.max(width, height) * 0.70,
        );

      if (isLightTheme) {
        vignette.addColorStop(
          0,
          'rgba(255,255,255,0)',
        );

        vignette.addColorStop(
          1,
          themeName === 'white'
            ? 'rgba(26,45,73,.07)'
            : 'rgba(76,55,41,.08)',
        );
      } else {
        vignette.addColorStop(
          0,
          'rgba(0,0,0,0)',
        );

        vignette.addColorStop(
          1,
          'rgba(0,0,0,.28)',
        );
      }

      ctx.fillStyle = vignette;
      ctx.fillRect(
        0,
        0,
        width,
        height,
      );
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);

      if (!running) return;

      const minDelta =
        1000 / SETTINGS.maxFPS;

      if (
        now - lastDraw <
        minDelta
      ) {
        return;
      }

      const deltaSeconds =
        Math.min(
          0.034,
          (now - lastFrame) /
            1000 || 0.016,
        );

      lastFrame = now;
      lastDraw = now;

      resize();
      draw(
        now,
        deltaSeconds,
      );
    };

    const handlePointerDown = () => {
      if (!SETTINGS.interactionEnabled) return;
      pressed = true;
    };

    const handlePointerUp = () => {
      pressed = false;
    };

    const handlePointerLeave = () => {
      pressed = false;
    };

    const themeObserver =
      new MutationObserver(() => {
        themeName = getTheme();
      });

    themeObserver.observe(
      document.body,
      {
        attributes: true,
        attributeFilter: ['class'],
      },
    );

    const resizeObserver =
      new ResizeObserver(resize);

    resizeObserver.observe(root);

    let intersectionObserver:
      | IntersectionObserver
      | null = null;

    if (
      SETTINGS.pauseWhenOffscreen
    ) {
      intersectionObserver =
        new IntersectionObserver(
          ([entry]) => {
            running =
              entry?.isIntersecting ??
              true;

            if (running) {
              lastFrame =
                performance.now();
            }
          },
          {
            threshold: 0.01,
          },
        );

      intersectionObserver.observe(root);
    }

    root.addEventListener(
      'pointerdown',
      handlePointerDown,
    );

    root.addEventListener(
      'pointerleave',
      handlePointerLeave,
    );

    window.addEventListener(
      'pointerup',
      handlePointerUp,
    );

    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);

      themeObserver.disconnect();
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();

      root.removeEventListener(
        'pointerdown',
        handlePointerDown,
      );

      root.removeEventListener(
        'pointerleave',
        handlePointerLeave,
      );

      window.removeEventListener(
        'pointerup',
        handlePointerUp,
      );
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`xac-lightspeed ${className}`.trim()}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="xac-lightspeed__canvas"
      />
    </div>
  );
}
