'use client';

import { useEffect, useRef } from 'react';

type XrogaTheme = 'white' | 'beige' | 'gray' | 'black';

type ThemePreset = {
  color1: [number, number, number];
  color2: [number, number, number];
  opacity: number;
  scale: number;
  speed: number;
  cursorIntensity: number;
  lightness: number;
};

const THEME_PRESETS: Record<XrogaTheme, ThemePreset> = {
  white: {
    // White + clearly visible cool gray + restrained blue touch.
    color1: [0.50, 0.59, 0.69],
    color2: [0.95, 0.98, 1.0],
    opacity: 0.88,
    scale: 0.74,
    speed: 0.54,
    cursorIntensity: 0.62,
    lightness: 0.72,
  },
  beige: {
    // Warm ivory + stone/taupe watercolor.
    color1: [0.54, 0.47, 0.39],
    color2: [0.98, 0.94, 0.86],
    opacity: 0.84,
    scale: 0.74,
    speed: 0.52,
    cursorIntensity: 0.58,
    lightness: 0.6,
  },
  gray: {
    // Slate gray with a cool steel highlight.
    color1: [0.075, 0.09, 0.115],
    color2: [0.62, 0.67, 0.74],
    opacity: 0.74,
    scale: 0.76,
    speed: 0.66,
    cursorIntensity: 0.66,
    lightness: 0.35,
  },
  black: {
    // Deep charcoal + silver-gray watercolor.
    color1: [0.018, 0.022, 0.028],
    color2: [0.62, 0.66, 0.72],
    opacity: 0.82,
    scale: 0.72,
    speed: 0.72,
    cursorIntensity: 0.72,
    lightness: 0,
  },
};

const VERTEX_SHADER = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform float u_mouseActive;

  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform float u_speed;
  uniform float u_scale;
  uniform float u_opacity;
  uniform float u_cursorIntensity;
  uniform float u_themeLightness;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.56;
    mat2 rotation = mat2(0.82, -0.57, 0.57, 0.82);

    for (int i = 0; i < 6; i++) {
      value += amplitude * noise(p);
      p = rotation * p * 2.05 + 7.13;
      amplitude *= 0.54;
    }

    return value;
  }

  float ridged(vec2 p) {
    float n = fbm(p);
    return 1.0 - abs(n * 2.0 - 1.0);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 p = (uv - 0.5) * aspect;

    float t = u_time * u_speed;

    vec2 q;
    q.x = fbm(p * (2.2 / u_scale) + vec2(0.0, t * 0.045));
    q.y = fbm(p * (2.4 / u_scale) + vec2(5.2, -t * 0.038));

    vec2 r;
    r.x = fbm(
      p * (3.4 / u_scale) +
      3.5 * q +
      vec2(1.7, 9.2) +
      t * 0.055
    );
    r.y = fbm(
      p * (3.6 / u_scale) +
      3.9 * q +
      vec2(8.3, 2.8) -
      t * 0.048
    );

    vec2 mouse = u_mouse / u_resolution;
    vec2 mouseP = (mouse - 0.5) * aspect;

    float mouseDistance = length(p - mouseP);
    float cursorMask =
      exp(-mouseDistance * 5.2) *
      u_mouseActive;

    vec2 cursorWarp =
      normalize((p - mouseP) + vec2(0.0001)) *
      cursorMask *
      0.13 *
      u_cursorIntensity;

    vec2 warped =
      p +
      0.68 * q +
      0.42 * r +
      cursorWarp;

    float base = fbm(
      warped * (4.4 / u_scale) +
      vec2(t * 0.028, -t * 0.02)
    );

    float fine = fbm(
      warped * (10.0 / u_scale) -
      vec2(t * 0.022, t * 0.025)
    );

    float ridge = ridged(
      warped * (6.4 / u_scale) +
      r * 2.0
    );

    float field =
      base * 0.66 +
      fine * 0.20 +
      ridge * 0.14;

    // Ink pooling / watercolor edge definition.
    float band1 =
      smoothstep(0.32, 0.72, field);

    float band2 =
      smoothstep(
        0.48,
        0.80,
        field + 0.08 * sin(ridge * 18.0)
      );

    float edge = abs(band1 - band2);

    field += edge * 0.16;
    field +=
      cursorMask *
      0.11 *
      u_cursorIntensity;

    field =
      smoothstep(0.18, 0.88, field);

    field = pow(field, 1.05);

    vec3 color =
      mix(u_color1, u_color2, field);

    color +=
      vec3(u_themeLightness * 0.02) *
      (0.5 + fine * 0.5);

    gl_FragColor =
      vec4(color, u_opacity);
  }
`;

function currentXrogaTheme(): XrogaTheme {
  if (document.body.classList.contains('theme-beige')) return 'beige';
  if (document.body.classList.contains('theme-gray')) return 'gray';
  if (document.body.classList.contains('theme-black')) return 'black';
  return 'white';
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
) {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error('Unable to create watercolor shader.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message =
      gl.getShaderInfoLog(shader) ??
      'Watercolor shader compile failed.';

    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

export function AiAppBuilderWatercolor({
  className,
}: {
  className?: string;
}) {
  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const hero = canvas.parentElement;

    if (!hero) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });

    if (!gl) return;

    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      VERTEX_SHADER
    );

    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER
    );

    const program = gl.createProgram();

    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (
      !gl.getProgramParameter(
        program,
        gl.LINK_STATUS
      )
    ) {
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.useProgram(program);

    const buffer = gl.createBuffer();

    if (!buffer) return;

    gl.bindBuffer(
      gl.ARRAY_BUFFER,
      buffer
    );

    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]),
      gl.STATIC_DRAW
    );

    const positionLocation =
      gl.getAttribLocation(
        program,
        'a_position'
      );

    gl.enableVertexAttribArray(
      positionLocation
    );

    gl.vertexAttribPointer(
      positionLocation,
      2,
      gl.FLOAT,
      false,
      0,
      0
    );

    const uniforms = {
      resolution: gl.getUniformLocation(
        program,
        'u_resolution'
      ),
      time: gl.getUniformLocation(
        program,
        'u_time'
      ),
      mouse: gl.getUniformLocation(
        program,
        'u_mouse'
      ),
      mouseActive: gl.getUniformLocation(
        program,
        'u_mouseActive'
      ),
      color1: gl.getUniformLocation(
        program,
        'u_color1'
      ),
      color2: gl.getUniformLocation(
        program,
        'u_color2'
      ),
      speed: gl.getUniformLocation(
        program,
        'u_speed'
      ),
      scale: gl.getUniformLocation(
        program,
        'u_scale'
      ),
      opacity: gl.getUniformLocation(
        program,
        'u_opacity'
      ),
      cursorIntensity: gl.getUniformLocation(
        program,
        'u_cursorIntensity'
      ),
      themeLightness: gl.getUniformLocation(
        program,
        'u_themeLightness'
      ),
    };

    let theme =
      currentXrogaTheme();

    let mouseX = 0;
    let mouseY = 0;
    let mouseActive = 0;
    let lastPointerTime = 0;
    let animationFrame = 0;
    let destroyed = false;

    const reducedMotion =
      window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

    const resize = () => {
      const rect =
        hero.getBoundingClientRect();

      // Deliberately render watercolor below native
      // display resolution. It keeps the effect soft
      // and substantially reduces GPU cost.
      const renderScale =
        Math.min(
          window.devicePixelRatio || 1,
          1.25
        ) * 0.72;

      const width = Math.max(
        1,
        Math.floor(
          rect.width * renderScale
        )
      );

      const height = Math.max(
        1,
        Math.floor(
          rect.height * renderScale
        )
      );

      if (
        canvas.width !== width ||
        canvas.height !== height
      ) {
        canvas.width = width;
        canvas.height = height;

        gl.viewport(
          0,
          0,
          width,
          height
        );
      }
    };

    const handlePointerMove = (
      event: PointerEvent
    ) => {
      const rect =
        hero.getBoundingClientRect();

      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!inside) {
        mouseActive = 0;
        return;
      }

      const x =
        event.clientX - rect.left;

      const y =
        rect.bottom - event.clientY;

      mouseX =
        x *
        (canvas.width / rect.width);

      mouseY =
        y *
        (canvas.height / rect.height);

      mouseActive = 1;
      lastPointerTime =
        performance.now();
    };

    const themeObserver =
      new MutationObserver(() => {
        theme =
          currentXrogaTheme();
      });

    themeObserver.observe(
      document.body,
      {
        attributes: true,
        attributeFilter: ['class'],
      }
    );

    const resizeObserver =
      new ResizeObserver(resize);

    resizeObserver.observe(hero);

    window.addEventListener(
      'pointermove',
      handlePointerMove,
      { passive: true }
    );

    resize();

    const startedAt =
      performance.now();

    const render = (now: number) => {
      if (destroyed) return;

      resize();

      const preset =
        THEME_PRESETS[theme];

      if (
        now - lastPointerTime >
        1200
      ) {
        mouseActive *= 0.96;
      }

      gl.useProgram(program);

      gl.uniform2f(
        uniforms.resolution,
        canvas.width,
        canvas.height
      );

      gl.uniform1f(
        uniforms.time,
        reducedMotion
          ? 0
          : (now - startedAt) / 1000
      );

      gl.uniform2f(
        uniforms.mouse,
        mouseX,
        mouseY
      );

      gl.uniform1f(
        uniforms.mouseActive,
        mouseActive
      );

      gl.uniform3fv(
        uniforms.color1,
        new Float32Array(
          preset.color1
        )
      );

      gl.uniform3fv(
        uniforms.color2,
        new Float32Array(
          preset.color2
        )
      );

      gl.uniform1f(
        uniforms.speed,
        preset.speed
      );

      gl.uniform1f(
        uniforms.scale,
        preset.scale
      );

      gl.uniform1f(
        uniforms.opacity,
        preset.opacity
      );

      gl.uniform1f(
        uniforms.cursorIntensity,
        preset.cursorIntensity
      );

      gl.uniform1f(
        uniforms.themeLightness,
        preset.lightness
      );

      gl.drawArrays(
        gl.TRIANGLES,
        0,
        6
      );

      animationFrame =
        requestAnimationFrame(
          render
        );
    };

    animationFrame =
      requestAnimationFrame(
        render
      );

    return () => {
      destroyed = true;

      cancelAnimationFrame(
        animationFrame
      );

      resizeObserver.disconnect();
      themeObserver.disconnect();

      window.removeEventListener(
        'pointermove',
        handlePointerMove
      );

      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
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
