'use client';
/*
 * GalaxyField: the faint star field behind the S01 deck.
 *
 * Derived from "Galaxy" by David Haz, React Bits (https://reactbits.dev/c/backgrounds/galaxy, JavaScript + CSS
 * variant, supplied by the founder on 2026-10-11). Used as part of the Xroga website only; the component is not
 * redistributed or sold on its own. React Bits components are licensed MIT + Commons Clause v1.0, the same terms as
 * XrogaSlats in S00; see that file for the full licence text.
 *
 * Xroga changes: the shader is unchanged except that the mouse, light-mode and repulsion paths are removed (this
 * layer never takes the pointer). Rendering is budgeted: half resolution, at most 30 frames per second, paused while
 * the stage is offscreen or the tab is hidden, a single static frame under reduced motion, and a frame-rate probe
 * that removes the canvas on devices that cannot keep up (the stage's CSS lighting remains). The WebGL context is
 * created once and released on unmount.
 */
import { useEffect, useRef } from 'react';
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl';

const vertex = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
varying vec2 vUv;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float tri(float x) { return abs(fract(x) * 2.0 - 1.0); }
float tris(float x) { float t = fract(x); return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0)); }
float trisn(float x) { float t = fract(x); return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0; }
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}
vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + offset;
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;
      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);
      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));
      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;
      float star = Star(gv - offset - pad, flareSize);
      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      star *= mix(1.0, twinkle, uTwinkleIntensity);
      col += star * size * base;
    }
  }
  return col;
}
void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;
  float a = uTime * uRotationSpeed;
  uv = mat2(cos(a), -sin(a), sin(a), cos(a)) * uv;
  vec3 col = vec3(0.0);
  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }
  float alpha = smoothstep(0.0, 0.3, length(col));
  gl_FragColor = vec4(col, min(alpha, 1.0));
}
`;

/** The approved restrained preset (brief section 8): felt rather than watched. */
export const GALAXY_PRESET = {
  density: 0.65,
  glowIntensity: 0.15,
  saturation: 0.12,
  hueShift: 225,
  starSpeed: 0.12,
  speed: 0.18,
  twinkleIntensity: 0.1,
  rotationSpeed: 0.008,
} as const;
/** Render budget. */
export const GALAXY_SCALE = 0.5;
export const GALAXY_FRAME_MS = 1000 / 30;
/** A device averaging slower than this over the probe window loses the canvas. */
export const GALAXY_PROBE_LIMIT_MS = 45;

export function GalaxyField({ className, reduced }: { className?: string; reduced: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: false, dpr: 1, antialias: false });
    } catch {
      return; // no WebGL: the stage's CSS lighting is the fallback
    }
    const gl = renderer.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    const P = GALAXY_PRESET;
    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Color(1, 1, 1) },
        uFocal: { value: new Float32Array([0.5, 0.55]) },
        uStarSpeed: { value: 0 },
        uDensity: { value: P.density },
        uHueShift: { value: P.hueShift },
        uSpeed: { value: P.speed },
        uGlowIntensity: { value: P.glowIntensity },
        uSaturation: { value: P.saturation },
        uTwinkleIntensity: { value: P.twinkleIntensity },
        uRotationSpeed: { value: P.rotationSpeed },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      const w = Math.max(1, Math.round(host.offsetWidth * GALAXY_SCALE));
      const h = Math.max(1, Math.round(host.offsetHeight * GALAXY_SCALE));
      renderer.setSize(w, h);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      program.uniforms.uResolution.value = new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const draw = (t: number) => {
      program.uniforms.uTime.value = t * 0.001;
      program.uniforms.uStarSpeed.value = (t * 0.001 * P.starSpeed) / 10;
      renderer.render({ scene: mesh });
    };

    let raf = 0;
    let visible = false;
    let last = 0;
    let probeFrames = 0;
    let probeStart = 0;
    let removed = false;
    const loop = (t: number) => {
      raf = 0;
      if (!visible || document.hidden || removed) return;
      raf = requestAnimationFrame(loop);
      if (t - last < GALAXY_FRAME_MS - 1) return;
      // probe the real frame cost over the first visible second; slow devices keep the CSS lighting only
      if (probeFrames === 0) probeStart = t;
      if (probeFrames < 30) {
        probeFrames++;
        if (probeFrames === 30 && (t - probeStart) / 29 > GALAXY_PROBE_LIMIT_MS) {
          removed = true;
          host.dataset.state = 'off';
          return;
        }
      }
      last = t;
      draw(t);
    };
    const start = () => {
      if (reduced) {
        draw(4000);
        host.dataset.state = 'static';
        return;
      }
      host.dataset.state = 'live';
      if (!raf && visible && !document.hidden && !removed) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(host);
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [reduced]);

  return <div ref={hostRef} className={className} aria-hidden />;
}
