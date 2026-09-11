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
  particleCount: 300_000,
  particleSize: 1.75,
  particleOpacity: 0.92,
  speed: 1,
  cursorStrength: 0.1,
  cursorRadius: 115,
  maxDpr: 1.6,
};

const THEMES: Record<ThemeName, ThemePalette> = {
  white: {
    low: [26, 37, 50],
    high: [74, 118, 166],
    hot: [235, 247, 255],
  },
  gray: {
    low: [28, 31, 35],
    high: [235, 238, 242],
    hot: [255, 255, 255],
  },
  black: {
    low: [78, 81, 86],
    high: [242, 244, 247],
    hot: [255, 255, 255],
  },
  beige: {
    low: [65, 58, 52],
    high: [216, 205, 190],
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

export function SoftwareHeroParticleImage({
  className = '',
}: {
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const image = imageRef.current;
    const canvas = canvasRef.current;

    if (!root || !image || !canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });

    // The real source image remains visible even if WebGL is unavailable.
    if (!gl) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');

    let theme = getTheme();
    let pointCount = 0;
    let renderDpr = 1;
    let raf = 0;
    let started = performance.now();
    let visible = true;
    let rebuildTimer = 0;

    let displayRect = {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    };

    const pointer = {
      x: 0.72,
      y: 0.5,
      px: 0.72,
      py: 0.5,
      vx: 0,
      vy: 0,
      active: 0,
      overImage: false,
      lastMove: 0,
    };

    const vertexSource = `
      precision highp float;

      attribute vec2 a_home;
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

        // Always-on micro movement. The portrait never feels frozen.
        float field =
          sin(home.y * 14.0 + t * 0.52 + seed * 7.0) +
          cos(home.x * 12.0 - t * 0.44 + seed * 9.0);

        vec2 microFlow = normalize(
          vec2(
            cos(field + seed * 3.1),
            sin(field - seed * 2.4)
          ) + 0.0001
        );

        p += microFlow * u_alive * (0.0018 + seed * 0.0036);

        // Automatic dissolve / spread.
        float wave =
          0.5 +
          0.5 * sin(home.y * 12.0 + seed * 10.0 + t * 0.35);

        float threshold =
          mix(1.14, -0.10, u_spread) +
          (wave - 0.5) * 0.18;

        float local =
          smoothstep(
            threshold - 0.16,
            threshold + 0.07,
            home.x
          );

        float amount = local * u_spread;

        // Mostly horizontal dust plume, like the reference.
        vec2 sweep = normalize(
          vec2(
            0.96 + 0.22 * sin(seed * 17.0 + t * 0.44),
            signedSeed * 0.32 +
              0.14 * sin(home.x * 18.0 + t * 0.52)
          )
        );

        p += sweep * amount * (0.055 + seed * 0.24);

        // Curved swirl around the portrait.
        vec2 center = vec2(0.72, 0.50);
        vec2 radial = home - center;
        vec2 tangent =
          normalize(vec2(-radial.y, radial.x) + 0.0001);

        p +=
          tangent *
          amount *
          signedSeed *
          (0.022 + seed * 0.078);

        p.x +=
          sin(t * 0.48 + home.y * 15.0 + seed * 11.0) *
          amount *
          0.015;

        p.y +=
          cos(t * 0.54 + home.x * 14.0 + seed * 9.0) *
          amount *
          0.018;

        // Cursor only becomes strong while it is over the displayed Ada image.
        if (u_mouseActive > 0.001) {
          vec2 delta = p - u_mouse;
          vec2 scaled = vec2(delta.x * aspect, delta.y);
          float distance = length(scaled);
          float radius = u_cursorRadius / u_resolution.y;

          float influence =
            1.0 -
            smoothstep(radius * 0.12, radius, distance);

          influence *= u_mouseActive;

          vec2 direction = normalize(delta + 0.0001);
          vec2 curl = vec2(-direction.y, direction.x);

          p +=
            direction *
            influence *
            u_cursorStrength *
            0.30;

          p +=
            curl *
            influence *
            u_cursorStrength *
            0.18;

          p +=
            u_mouseVel *
            influence *
            u_cursorStrength *
            1.18;
        }

        gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);

        gl_PointSize =
          max(
            1.0,
            u_pointSize *
            a_size *
            (1.0 + amount * 0.38)
          );

        v_luma = a_luma;
        v_edge = a_edge;
        v_seed = a_seed;

        v_alpha =
          u_particleOpacity *
          mix(0.42, 0.98, max(a_edge, a_luma * 0.72)) *
          mix(1.0, 0.82, amount);
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
            0.18 +
            v_luma * 0.60 +
            v_edge * 0.52,
            0.0,
            1.0
          );

        vec3 color =
          mix(u_lowColor, u_highColor, brightness);

        if (v_seed > 0.993) {
          color = mix(color, u_hotColor, 0.88);
        }

        gl_FragColor =
          vec4(color, v_alpha * mask);
      }
    `;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Unable to create WebGL shader.');

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader) || 'Shader compile failed.';
        gl.deleteShader(shader);
        throw new Error(info);
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

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteProgram(program);
      return;
    }

    gl.useProgram(program);

    const attributes = {
      home: gl.getAttribLocation(program, 'a_home'),
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
      const buffer = gl.createBuffer();
      if (!buffer || attribute < 0) return;

      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(
        attribute,
        size,
        gl.FLOAT,
        false,
        0,
        0,
      );

      buffers.push(buffer);
    };

    const clearBuffers = () => {
      while (buffers.length) {
        const buffer = buffers.pop();
        if (buffer) gl.deleteBuffer(buffer);
      }
    };

    const getDisplayedImageRect = () => {
      const rootRect = root.getBoundingClientRect();
      const imageElementRect = image.getBoundingClientRect();

      const naturalWidth = Math.max(1, image.naturalWidth);
      const naturalHeight = Math.max(1, image.naturalHeight);

      // CSS uses object-fit: contain, so calculate the actual painted image box.
      const scale = Math.min(
        imageElementRect.width / naturalWidth,
        imageElementRect.height / naturalHeight,
      );

      const paintedWidth = naturalWidth * scale;
      const paintedHeight = naturalHeight * scale;

      return {
        x:
          imageElementRect.left -
          rootRect.left +
          (imageElementRect.width - paintedWidth) / 2,
        y:
          imageElementRect.top -
          rootRect.top +
          (imageElementRect.height - paintedHeight) / 2,
        width: paintedWidth,
        height: paintedHeight,
      };
    };

    const buildParticles = () => {
      if (!image.naturalWidth || !image.naturalHeight) return;

      const rootRect = root.getBoundingClientRect();
      if (rootRect.width < 1 || rootRect.height < 1) return;

      displayRect = getDisplayedImageRect();

      const sampleWidth = 620;
      const sampleHeight = Math.max(
        1,
        Math.round(
          sampleWidth *
            (image.naturalHeight / image.naturalWidth),
        ),
      );

      const sample = document.createElement('canvas');
      sample.width = sampleWidth;
      sample.height = sampleHeight;

      const context = sample.getContext('2d', {
        willReadFrequently: true,
      });

      if (!context) return;

      try {
        context.drawImage(
          image,
          0,
          0,
          sampleWidth,
          sampleHeight,
        );
      } catch {
        return;
      }

      let imageData: ImageData;

      try {
        imageData = context.getImageData(
          0,
          0,
          sampleWidth,
          sampleHeight,
        );
      } catch {
        // If remote sampling is blocked, the source portrait still stays visible.
        return;
      }

      const data = imageData.data;

      const lumaAt = (x: number, y: number) => {
        const px = Math.max(
          0,
          Math.min(sampleWidth - 1, Math.floor(x)),
        );
        const py = Math.max(
          0,
          Math.min(sampleHeight - 1, Math.floor(y)),
        );

        const index = (py * sampleWidth + px) * 4;

        return (
          data[index] * 0.2126 +
          data[index + 1] * 0.7152 +
          data[index + 2] * 0.0722
        ) / 255;
      };

      const actualCount =
        rootRect.width < 700
          ? 120_000
          : rootRect.width < 1100
            ? 210_000
            : SETTINGS.particleCount;

      pointCount = actualCount;

      const homes = new Float32Array(actualCount * 2);
      const seeds = new Float32Array(actualCount);
      const lumas = new Float32Array(actualCount);
      const edges = new Float32Array(actualCount);
      const sizes = new Float32Array(actualCount);

      for (let i = 0; i < actualCount; i += 1) {
        const sampleX = Math.random() * (sampleWidth - 1);
        const sampleY = Math.random() * (sampleHeight - 1);

        const luma = lumaAt(sampleX, sampleY);

        const gradientX = Math.abs(
          lumaAt(sampleX + 2, sampleY) -
            lumaAt(sampleX - 2, sampleY),
        );

        const gradientY = Math.abs(
          lumaAt(sampleX, sampleY + 2) -
            lumaAt(sampleX, sampleY - 2),
        );

        const edge = Math.min(
          1,
          (gradientX + gradientY) * 3.1,
        );

        const normalizedX = sampleX / sampleWidth;
        const normalizedY = sampleY / sampleHeight;

        const jitterX = (Math.random() - 0.5) * 1.2;
        const jitterY = (Math.random() - 0.5) * 1.2;

        homes[i * 2] =
          (displayRect.x +
            normalizedX * displayRect.width +
            jitterX) /
          rootRect.width;

        homes[i * 2 + 1] =
          1 -
          (displayRect.y +
            normalizedY * displayRect.height +
            jitterY) /
            rootRect.height;

        seeds[i] = Math.random();

        // Invert source luminance so facial / clothing structure becomes
        // a dense monochrome stipple field like the reference.
        lumas[i] = Math.max(
          0.04,
          1 - luma * 0.78,
        );

        edges[i] = edge;
        sizes[i] = 0.48 + Math.random() * 0.90;
      }

      clearBuffers();

      bindBuffer(attributes.home, homes, 2);
      bindBuffer(attributes.seed, seeds, 1);
      bindBuffer(attributes.luma, lumas, 1);
      bindBuffer(attributes.edge, edges, 1);
      bindBuffer(attributes.size, sizes, 1);
    };

    const resize = () => {
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
        canvas.width !== width ||
        canvas.height !== height
      ) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        gl.viewport(0, 0, width, height);
      }
    };

    // AUTO ONLY:
    // resolved -> dissolve -> spread -> rebuild -> resolved -> repeat
    const automaticSpread = (seconds: number) => {
      if (reducedMotion.matches) return 0;

      const time = seconds % 18;

      if (time < 4) return 0.015;

      if (time < 7.2) {
        return smoothstep(4, 7.2, time);
      }

      if (time < 10.2) return 1;

      if (time < 14.8) {
        return 1 - smoothstep(10.2, 14.8, time);
      }

      return 0.015;
    };

    const setColor = (
      location: WebGLUniformLocation | null,
      value: [number, number, number],
    ) => {
      if (!location) return;

      gl.uniform3f(
        location,
        value[0] / 255,
        value[1] / 255,
        value[2] / 255,
      );
    };

    const render = (now: number) => {
      raf = requestAnimationFrame(render);

      if (!visible || pointCount === 0) return;

      const seconds = (now - started) / 1000;
      const spread = automaticSpread(seconds);

      if (now - pointer.lastMove > 650) {
        pointer.active *= 0.965;
        pointer.vx *= 0.9;
        pointer.vy *= 0.9;
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

      // Keeps particles subtly alive even in the resolved phase.
      gl.uniform1f(
        uniforms.alive,
        reducedMotion.matches
          ? 0
          : 0.68 +
              Math.sin(seconds * 0.8) * 0.22,
      );

      gl.uniform2f(
        uniforms.resolution,
        canvas.width,
        canvas.height,
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
          pointer.overImage &&
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

      gl.drawArrays(
        gl.POINTS,
        0,
        pointCount,
      );

      // Never let the source portrait disappear.
      image.style.opacity = String(
        0.92 - spread * 0.48,
      );
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rootRect = root.getBoundingClientRect();

      const x =
        (event.clientX - rootRect.left) /
        rootRect.width;

      const y =
        1 -
        (event.clientY - rootRect.top) /
          rootRect.height;

      pointer.vx = x - pointer.px;
      pointer.vy = y - pointer.py;

      pointer.px = x;
      pointer.py = y;

      pointer.x = x;
      pointer.y = y;

      const localX =
        event.clientX - rootRect.left;

      const localY =
        event.clientY - rootRect.top;

      pointer.overImage =
        localX >= displayRect.x &&
        localX <= displayRect.x + displayRect.width &&
        localY >= displayRect.y &&
        localY <= displayRect.y + displayRect.height;

      pointer.active = 1;
      pointer.lastMove = performance.now();
    };

    const scheduleRebuild = () => {
      window.clearTimeout(rebuildTimer);

      rebuildTimer = window.setTimeout(() => {
        resize();
        buildParticles();
      }, 100);
    };

    const handleImageLoad = () => {
      resize();
      buildParticles();
      started = performance.now();
    };

    const themeObserver = new MutationObserver(() => {
      theme = getTheme();
    });

    const resizeObserver = new ResizeObserver(scheduleRebuild);

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

    image.addEventListener('load', handleImageLoad);

    resize();

    if (image.complete && image.naturalWidth) {
      buildParticles();
    }

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

      image.removeEventListener(
        'load',
        handleImageLoad,
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
      className={`xsw-hero-particles ${className}`.trim()}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        className="xsw-hero-particles__image"
        src={IMAGE_URL}
        crossOrigin="anonymous"
        alt=""
      />

      <canvas
        ref={canvasRef}
        className="xsw-hero-particles__canvas"
      />
    </div>
  );
}
