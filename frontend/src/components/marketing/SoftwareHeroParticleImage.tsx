'use client';

import { useEffect, useRef } from 'react';

type ThemeName = 'white' | 'gray' | 'black' | 'beige';

type ThemePalette = {
  low: [number, number, number];
  high: [number, number, number];
  hot: [number, number, number];
};

const IMAGE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/a/a4/Ada_Lovelace_portrait.jpg';

const SETTINGS = {
  particleCount: 280_000,
  particleSize: 1.72,
  particleOpacity: 0.94,
  speed: 1,
  cursorStrength: 0.14,
  cursorRadius: 150,
  maxDpr: 1.5,
  ambientShare: 0.18,
};

const THEMES: Record<ThemeName, ThemePalette> = {
  white: {
    low: [52, 88, 126],
    high: [87, 153, 219],
    hot: [244, 250, 255],
  },
  gray: {
    low: [63, 67, 73],
    high: [232, 235, 239],
    hot: [255, 255, 255],
  },
  black: {
    low: [76, 80, 86],
    high: [244, 246, 249],
    hot: [255, 255, 255],
  },
  beige: {
    low: [90, 76, 64],
    high: [224, 210, 192],
    hot: [255, 249, 239],
  },
};

function getTheme(): ThemeName {
  if (document.body.classList.contains('theme-beige')) return 'beige';
  if (document.body.classList.contains('theme-gray')) return 'gray';
  if (document.body.classList.contains('theme-black')) return 'black';
  return 'white';
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function ellipseMask(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  feather = 0.16,
) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const d = Math.sqrt(dx * dx + dy * dy);
  return 1 - smoothstep(1 - feather, 1, d);
}

export function SoftwareHeroParticleImage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLImageElement>(null);
  const portraitRef = useRef<HTMLCanvasElement>(null);
  const particleRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const source = sourceRef.current;
    const portraitCanvas = portraitRef.current;
    const particleCanvas = particleRef.current;

    if (!root || !source || !portraitCanvas || !particleCanvas) return;

    const gl = particleCanvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });

    if (!gl) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');

    let theme = getTheme();
    let raf = 0;
    let started = performance.now();
    let visible = true;
    let renderDpr = 1;
    let pointCount = 0;
    let rebuildTimer = 0;

    let cutout:
      | {
          canvas: HTMLCanvasElement;
          pixels: ImageData;
        }
      | null = null;

    let personRect = {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    };

    const pointer = {
      x: 0.5,
      y: 0.5,
      px: 0.5,
      py: 0.5,
      vx: 0,
      vy: 0,
      active: 0,
      insideHero: false,
      lastMove: 0,
    };

    const vertexSource = `
      precision highp float;

      attribute vec2 a_home;
      attribute vec2 a_field;
      attribute float a_ambient;
      attribute float a_seed;
      attribute float a_luma;
      attribute float a_edge;
      attribute float a_size;

      uniform float u_time;
      uniform float u_spread;
      uniform float u_alive;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform vec2 u_mouseVel;
      uniform float u_mouseActive;
      uniform float u_cursorRadius;
      uniform float u_cursorStrength;
      uniform float u_pointSize;
      uniform float u_particleOpacity;

      varying float v_alpha;
      varying float v_luma;
      varying float v_edge;
      varying float v_seed;

      void main() {
        vec2 home = a_home;
        vec2 p = home;

        float t = u_time;
        float seed = a_seed;
        float signedSeed = seed * 2.0 - 1.0;
        float aspect = u_resolution.x / u_resolution.y;

        // 18% of particles remain hero-wide even in the resolved phase.
        float fieldMix =
          max(
            a_ambient * 0.88,
            u_spread * (0.76 + seed * 0.20)
          );

        // Main movement between Ada and the full hero particle field.
        p = mix(home, a_field, fieldMix);

        // Always-on "alive" flow.
        float flowAngle =
          sin(p.y * 16.0 + t * 0.62 + seed * 9.0) +
          cos(p.x * 13.0 - t * 0.51 + seed * 7.0);

        vec2 flow = normalize(
          vec2(
            cos(flowAngle + seed * 2.6),
            sin(flowAngle - seed * 2.1)
          ) + 0.0001
        );

        p += flow * u_alive * (0.0022 + seed * 0.0040);

        // During spread, create a broad sweep across the hero.
        vec2 sweep = normalize(
          vec2(
            0.92 + 0.24 * sin(seed * 17.0 + t * 0.46),
            signedSeed * 0.28 +
              0.14 * sin(p.x * 18.0 + t * 0.56)
          )
        );

        p += sweep * u_spread * (0.010 + seed * 0.040);

        vec2 center = vec2(0.70, 0.50);
        vec2 radial = p - center;
        vec2 tangent =
          normalize(vec2(-radial.y, radial.x) + 0.0001);

        p +=
          tangent *
          u_spread *
          signedSeed *
          (0.008 + seed * 0.026);

        // Cursor interaction works over the ENTIRE hero.
        if (u_mouseActive > 0.001) {
          vec2 delta = p - u_mouse;
          vec2 scaled = vec2(delta.x * aspect, delta.y);
          float distance = length(scaled);
          float radius = u_cursorRadius / u_resolution.y;

          float influence =
            1.0 -
            smoothstep(radius * 0.10, radius, distance);

          influence *= u_mouseActive;

          vec2 direction = normalize(delta + 0.0001);
          vec2 curl = vec2(-direction.y, direction.x);

          // Repel + curl + cursor velocity wake.
          p +=
            direction *
            influence *
            u_cursorStrength *
            0.34;

          p +=
            curl *
            influence *
            u_cursorStrength *
            0.22;

          p +=
            u_mouseVel *
            influence *
            u_cursorStrength *
            1.85;
        }

        gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);

        gl_PointSize =
          max(
            1.0,
            u_pointSize *
            a_size *
            (1.0 + u_spread * 0.26)
          );

        v_luma = a_luma;
        v_edge = a_edge;
        v_seed = a_seed;

        float ambientAlpha =
          mix(1.0, 0.52, a_ambient);

        v_alpha =
          u_particleOpacity *
          ambientAlpha *
          mix(0.42, 0.98, max(a_edge, a_luma * 0.72));
      }
    `;

    const fragmentSource = `
      precision highp float;

      uniform vec3 u_lowColor;
      uniform vec3 u_highColor;
      uniform vec3 u_hotColor;

      varying float v_alpha;
      varying float v_luma;
      varying float v_edge;
      varying float v_seed;

      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float distance = length(point);

        if (distance > 0.5) discard;

        float mask =
          1.0 - smoothstep(0.28, 0.5, distance);

        float brightness =
          clamp(
            0.16 +
            v_luma * 0.62 +
            v_edge * 0.54,
            0.0,
            1.0
          );

        vec3 color =
          mix(u_lowColor, u_highColor, brightness);

        if (v_seed > 0.993) {
          color = mix(color, u_hotColor, 0.90);
        }

        gl_FragColor =
          vec4(color, v_alpha * mask);
      }
    `;

    const compile = (type: number, code: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Unable to create shader.');

      gl.shaderSource(shader, code);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message =
          gl.getShaderInfoLog(shader) || 'Shader compile failed.';
        gl.deleteShader(shader);
        throw new Error(message);
      }

      return shader;
    };

    const program = gl.createProgram();
    if (!program) return;

    const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    gl.useProgram(program);

    const attributes = {
      home: gl.getAttribLocation(program, 'a_home'),
      field: gl.getAttribLocation(program, 'a_field'),
      ambient: gl.getAttribLocation(program, 'a_ambient'),
      seed: gl.getAttribLocation(program, 'a_seed'),
      luma: gl.getAttribLocation(program, 'a_luma'),
      edge: gl.getAttribLocation(program, 'a_edge'),
      size: gl.getAttribLocation(program, 'a_size'),
    };

    const uniforms = {
      time: gl.getUniformLocation(program, 'u_time'),
      spread: gl.getUniformLocation(program, 'u_spread'),
      alive: gl.getUniformLocation(program, 'u_alive'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      mouse: gl.getUniformLocation(program, 'u_mouse'),
      mouseVel: gl.getUniformLocation(program, 'u_mouseVel'),
      mouseActive: gl.getUniformLocation(program, 'u_mouseActive'),
      cursorRadius: gl.getUniformLocation(program, 'u_cursorRadius'),
      cursorStrength: gl.getUniformLocation(program, 'u_cursorStrength'),
      pointSize: gl.getUniformLocation(program, 'u_pointSize'),
      particleOpacity: gl.getUniformLocation(program, 'u_particleOpacity'),
      lowColor: gl.getUniformLocation(program, 'u_lowColor'),
      highColor: gl.getUniformLocation(program, 'u_highColor'),
      hotColor: gl.getUniformLocation(program, 'u_hotColor'),
    };

    const buffers: WebGLBuffer[] = [];

    const bindBuffer = (
      attribute: number,
      data: Float32Array,
      size: number,
    ) => {
      if (attribute < 0) return;

      const buffer = gl.createBuffer();
      if (!buffer) return;

      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 0, 0);

      buffers.push(buffer);
    };

    const clearBuffers = () => {
      while (buffers.length) {
        const buffer = buffers.pop();
        if (buffer) gl.deleteBuffer(buffer);
      }
    };

    const createPersonCutout = () => {
      if (!source.naturalWidth || !source.naturalHeight) return null;

      const width = 720;
      const height = Math.max(
        1,
        Math.round(
          width * (source.naturalHeight / source.naturalWidth),
        ),
      );

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d', {
        willReadFrequently: true,
      });

      if (!ctx) return null;

      ctx.drawImage(source, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      const samples: [number, number, number][] = [];
      const cornerSize = Math.max(12, Math.floor(width * 0.06));

      const sampleCorner = (
        startX: number,
        startY: number,
        endX: number,
        endY: number,
      ) => {
        for (let y = startY; y < endY; y += 4) {
          for (let x = startX; x < endX; x += 4) {
            const i = (y * width + x) * 4;
            samples.push([
              data[i],
              data[i + 1],
              data[i + 2],
            ]);
          }
        }
      };

      sampleCorner(0, 0, cornerSize, cornerSize);
      sampleCorner(width - cornerSize, 0, width, cornerSize);
      sampleCorner(0, height - cornerSize, cornerSize, height);
      sampleCorner(
        width - cornerSize,
        height - cornerSize,
        width,
        height,
      );

      const bg = samples.reduce(
        (acc, c) => {
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
          return acc;
        },
        [0, 0, 0],
      );

      bg[0] /= samples.length;
      bg[1] /= samples.length;
      bg[2] /= samples.length;

      const alphaMask = new Uint8ClampedArray(width * height);

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;

          const nx = x / width;
          const ny = y / height;

          const dr = data[i] - bg[0];
          const dg = data[i + 1] - bg[1];
          const db = data[i + 2] - bg[2];

          const colorDistance = Math.sqrt(
            dr * dr + dg * dg + db * db,
          );

          const head = ellipseMask(
            nx,
            ny,
            0.53,
            0.22,
            0.23,
            0.22,
            0.24,
          );

          const torso = ellipseMask(
            nx,
            ny,
            0.52,
            0.56,
            0.43,
            0.44,
            0.17,
          );

          const lower = ellipseMask(
            nx,
            ny,
            0.50,
            0.84,
            0.48,
            0.32,
            0.18,
          );

          const personPrior = Math.max(head, torso, lower);

          const colorScore = smoothstep(
            30,
            88,
            colorDistance,
          );

          const alpha =
            Math.max(
              colorScore * personPrior,
              personPrior * 0.34,
            ) *
            personPrior;

          alphaMask[y * width + x] = Math.round(
            255 * Math.max(0, Math.min(1, alpha)),
          );
        }
      }

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;

      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) return null;

      const maskImage = maskCtx.createImageData(width, height);

      for (let p = 0; p < alphaMask.length; p += 1) {
        const j = p * 4;
        maskImage.data[j] = 255;
        maskImage.data[j + 1] = 255;
        maskImage.data[j + 2] = 255;
        maskImage.data[j + 3] = alphaMask[p];
      }

      maskCtx.putImageData(maskImage, 0, 0);

      const softenedMask = document.createElement('canvas');
      softenedMask.width = width;
      softenedMask.height = height;

      const softenedCtx = softenedMask.getContext('2d');
      if (!softenedCtx) return null;

      softenedCtx.filter = 'blur(2.2px)';
      softenedCtx.drawImage(maskCanvas, 0, 0);

      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(softenedMask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      return {
        canvas,
        pixels: ctx.getImageData(0, 0, width, height),
      };
    };

    const paintCutout = () => {
      if (!cutout) return;

      portraitCanvas.width = cutout.canvas.width;
      portraitCanvas.height = cutout.canvas.height;

      const ctx = portraitCanvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(
        0,
        0,
        portraitCanvas.width,
        portraitCanvas.height,
      );

      ctx.drawImage(cutout.canvas, 0, 0);
    };

    const getPersonRect = () => {
      const rootRect = root.getBoundingClientRect();
      const rect = portraitCanvas.getBoundingClientRect();

      return {
        x: rect.left - rootRect.left,
        y: rect.top - rootRect.top,
        width: rect.width,
        height: rect.height,
      };
    };

    const buildParticles = () => {
      if (!cutout) return;

      const rootRect = root.getBoundingClientRect();
      if (rootRect.width < 1 || rootRect.height < 1) return;

      personRect = getPersonRect();

      const { width, height } = cutout.canvas;
      const data = cutout.pixels.data;

      const candidates: {
        x: number;
        y: number;
        luma: number;
        edge: number;
      }[] = [];

      const lumaAt = (x: number, y: number) => {
        const px = Math.max(0, Math.min(width - 1, x | 0));
        const py = Math.max(0, Math.min(height - 1, y | 0));
        const i = (py * width + px) * 4;

        return (
          data[i] * 0.2126 +
          data[i + 1] * 0.7152 +
          data[i + 2] * 0.0722
        ) / 255;
      };

      for (let y = 2; y < height - 2; y += 2) {
        for (let x = 2; x < width - 2; x += 2) {
          const i = (y * width + x) * 4;
          const alpha = data[i + 3] / 255;

          if (alpha < 0.13) continue;

          const luma = lumaAt(x, y);

          const gx = Math.abs(
            lumaAt(x + 2, y) - lumaAt(x - 2, y),
          );

          const gy = Math.abs(
            lumaAt(x, y + 2) - lumaAt(x, y - 2),
          );

          const edge = Math.min(1, (gx + gy) * 3.1);

          const probability = Math.min(
            1,
            0.18 + alpha * 0.45 + edge * 0.42,
          );

          if (Math.random() > probability) continue;

          candidates.push({
            x: x / width,
            y: y / height,
            luma: Math.max(0.04, 1 - luma * 0.78),
            edge,
          });
        }
      }

      if (!candidates.length) return;

      const actualCount =
        rootRect.width < 700
          ? 120_000
          : rootRect.width < 1100
            ? 190_000
            : SETTINGS.particleCount;

      pointCount = actualCount;

      const homes = new Float32Array(actualCount * 2);
      const fields = new Float32Array(actualCount * 2);
      const ambient = new Float32Array(actualCount);
      const seeds = new Float32Array(actualCount);
      const lumas = new Float32Array(actualCount);
      const edges = new Float32Array(actualCount);
      const sizes = new Float32Array(actualCount);

      for (let i = 0; i < actualCount; i += 1) {
        const p =
          candidates[
            Math.floor(Math.random() * candidates.length)
          ];

        const jitterX = (Math.random() - 0.5) * 1.0;
        const jitterY = (Math.random() - 0.5) * 1.0;

        homes[i * 2] =
          (personRect.x +
            p.x * personRect.width +
            jitterX) /
          rootRect.width;

        homes[i * 2 + 1] =
          1 -
          (personRect.y +
            p.y * personRect.height +
            jitterY) /
            rootRect.height;

        /*
         * Full hero target.
         * Slight horizontal bias keeps the field cinematic instead of uniform noise.
         */
        const fx = Math.random();
        const band =
          0.5 +
          (Math.random() - 0.5) * 0.82 +
          Math.sin(fx * Math.PI * 2.0) * 0.07;

        fields[i * 2] = fx;
        fields[i * 2 + 1] = Math.max(0.03, Math.min(0.97, band));

        ambient[i] =
          Math.random() < SETTINGS.ambientShare ? 1 : 0;

        seeds[i] = Math.random();
        lumas[i] = p.luma;
        edges[i] = p.edge;
        sizes[i] = 0.50 + Math.random() * 0.86;
      }

      clearBuffers();

      bindBuffer(attributes.home, homes, 2);
      bindBuffer(attributes.field, fields, 2);
      bindBuffer(attributes.ambient, ambient, 1);
      bindBuffer(attributes.seed, seeds, 1);
      bindBuffer(attributes.luma, lumas, 1);
      bindBuffer(attributes.edge, edges, 1);
      bindBuffer(attributes.size, sizes, 1);
    };

    const resizeWebgl = () => {
      const rect = root.getBoundingClientRect();

      renderDpr = Math.min(
        window.devicePixelRatio || 1,
        SETTINGS.maxDpr,
      );

      const width = Math.max(
        1,
        Math.floor(rect.width * renderDpr),
      );

      const height = Math.max(
        1,
        Math.floor(rect.height * renderDpr),
      );

      if (
        particleCanvas.width !== width ||
        particleCanvas.height !== height
      ) {
        particleCanvas.width = width;
        particleCanvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const autoSpread = (seconds: number) => {
      if (reducedMotion.matches) return 0;

      const time = seconds % 18;

      if (time < 4) return 0.015;
      if (time < 7.2) return smoothstep(4, 7.2, time);
      if (time < 10.2) return 1;
      if (time < 14.8) {
        return 1 - smoothstep(10.2, 14.8, time);
      }

      return 0.015;
    };

    const setColor = (
      location: WebGLUniformLocation | null,
      color: [number, number, number],
    ) => {
      if (!location) return;

      gl.uniform3f(
        location,
        color[0] / 255,
        color[1] / 255,
        color[2] / 255,
      );
    };

    const render = (now: number) => {
      raf = requestAnimationFrame(render);

      if (!visible || pointCount === 0) return;

      const seconds = (now - started) / 1000;
      const spread = autoSpread(seconds);

      if (now - pointer.lastMove > 520) {
        pointer.active *= 0.952;
        pointer.vx *= 0.88;
        pointer.vy *= 0.88;
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendFunc(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
      );

      gl.useProgram(program);

      gl.uniform1f(
        uniforms.time,
        seconds * SETTINGS.speed,
      );

      gl.uniform1f(uniforms.spread, spread);

      gl.uniform1f(
        uniforms.alive,
        reducedMotion.matches
          ? 0
          : 0.78 + Math.sin(seconds * 0.8) * 0.20,
      );

      gl.uniform2f(
        uniforms.resolution,
        particleCanvas.width,
        particleCanvas.height,
      );

      gl.uniform2f(
        uniforms.mouse,
        pointer.x,
        pointer.y,
      );

      gl.uniform2f(
        uniforms.mouseVel,
        pointer.vx,
        pointer.vy,
      );

      gl.uniform1f(
        uniforms.mouseActive,
        finePointer.matches &&
          pointer.insideHero &&
          !reducedMotion.matches
          ? pointer.active
          : 0,
      );

      gl.uniform1f(
        uniforms.cursorRadius,
        SETTINGS.cursorRadius * renderDpr,
      );

      gl.uniform1f(
        uniforms.cursorStrength,
        SETTINGS.cursorStrength,
      );

      gl.uniform1f(
        uniforms.pointSize,
        SETTINGS.particleSize * renderDpr,
      );

      gl.uniform1f(
        uniforms.particleOpacity,
        SETTINGS.particleOpacity,
      );

      const palette = THEMES[theme];

      setColor(uniforms.lowColor, palette.low);
      setColor(uniforms.highColor, palette.high);
      setColor(uniforms.hotColor, palette.hot);

      gl.drawArrays(gl.POINTS, 0, pointCount);

      portraitCanvas.style.opacity = String(
        0.90 - spread * 0.52,
      );
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();

      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      pointer.insideHero = inside;

      if (!inside) return;

      const x = (event.clientX - rect.left) / rect.width;
      const y = 1 - (event.clientY - rect.top) / rect.height;

      pointer.vx = x - pointer.px;
      pointer.vy = y - pointer.py;

      pointer.px = x;
      pointer.py = y;

      pointer.x = x;
      pointer.y = y;

      pointer.active = 1;
      pointer.lastMove = performance.now();
    };

    const handlePointerLeave = () => {
      pointer.insideHero = false;
    };

    const rebuild = () => {
      window.clearTimeout(rebuildTimer);

      rebuildTimer = window.setTimeout(() => {
        resizeWebgl();
        buildParticles();
      }, 120);
    };

    const handleSourceLoad = () => {
      try {
        cutout = createPersonCutout();
        paintCutout();
        resizeWebgl();
        buildParticles();
        started = performance.now();
      } catch {
        portraitCanvas.style.opacity = '0';
      }
    };

    const themeObserver = new MutationObserver(() => {
      theme = getTheme();
    });

    const resizeObserver = new ResizeObserver(rebuild);

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

    resizeObserver.observe(root);
    visibilityObserver.observe(root);

    window.addEventListener(
      'pointermove',
      handlePointerMove,
      { passive: true },
    );

    root.addEventListener(
      'pointerleave',
      handlePointerLeave,
    );

    source.addEventListener('load', handleSourceLoad);

    if (source.complete && source.naturalWidth) {
      handleSourceLoad();
    }

    resizeWebgl();
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(rebuildTimer);

      themeObserver.disconnect();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();

      window.removeEventListener(
        'pointermove',
        handlePointerMove,
      );

      root.removeEventListener(
        'pointerleave',
        handlePointerLeave,
      );

      source.removeEventListener(
        'load',
        handleSourceLoad,
      );

      clearBuffers();

      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="xsw-hero-particles"
      aria-hidden="true"
    >
      {/* Hidden source only — never visible as an image card. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={sourceRef}
        className="xsw-hero-particles__source"
        src={IMAGE_URL}
        crossOrigin="anonymous"
        alt=""
      />

      {/* Transparent Ada cutout. */}
      <canvas
        ref={portraitRef}
        className="xsw-hero-particles__portrait"
      />

      {/* Hero-wide reactive particle field. */}
      <canvas
        ref={particleRef}
        className="xsw-hero-particles__canvas"
      />
    </div>
  );
}
