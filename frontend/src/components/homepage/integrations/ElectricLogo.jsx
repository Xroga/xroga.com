'use client';

import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';

import './ElectricLogo.css';

const hexToRgb = hex => {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.replace(/./g, c => c + c);
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isNaN(n)
    ? [1, 1, 1]
    : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const vertex = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `
precision highp float;

uniform sampler2D tMap;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform vec3 uColor;
uniform vec3 uGlowColor;
uniform float uIntensity;
uniform float uGlow;
uniform float uThickness;
uniform float uFlicker;
uniform float uStrands;
uniform float uBend;
uniform float uCrackle;
uniform float uArcs;
uniform float uFill;
uniform vec3 uCursor;
uniform float uCursorRadius;

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.7;
    a *= 0.5;
  }
  return v;
}

float alphaAt(vec2 uv) {
  vec2 q = (uv - 0.5) / max(uScale, 0.001) + 0.5;
  float bounds =
    step(0.0, q.x) * step(q.x, 1.0) *
    step(0.0, q.y) * step(q.y, 1.0);
  return texture2D(tMap, clamp(q, 0.0, 1.0)).a * bounds;
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / max(uResolution, vec2(1.0));
  float a = alphaAt(uv);

  float r1 = max(1.0, uThickness * 1.2);
  float r2 = max(2.0, uThickness * 3.4);
  float n1 = 0.0;
  float n2 = 0.0;

  for (int i = 0; i < 8; i++) {
    float ang = 6.2831853 * float(i) / 8.0;
    vec2 dir = vec2(cos(ang), sin(ang));
    n1 = max(n1, alphaAt(uv + dir * px * r1));
    n2 = max(n2, alphaAt(uv + dir * px * r2));
  }

  float edge = clamp(n1 - a * 0.45, 0.0, 1.0);
  float aura = clamp(n2 - a * 0.22, 0.0, 1.0);

  vec2 centered = (uv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float t = uTime;
  float f = fbm(centered * (8.0 + uCrackle * 4.0) + vec2(t * 0.55, -t * 0.35));
  float fine = fbm(centered * (20.0 + uCrackle * 8.0) + vec2(-t * 1.15, t * 0.85));
  float pulse = 0.55 + 0.45 * sin(t * 5.0 + f * 9.0);
  float spark = smoothstep(0.48, 0.92, f * 0.72 + fine * 0.62 + pulse * 0.16);
  float strand = mix(0.55, 1.5, spark) * (0.72 + 0.28 * sin(t * 9.0 + fine * 15.0));

  float angle = atan(centered.y, centered.x);
  float radius = length(centered);
  float arcBand = sin(angle * (4.0 + uStrands) + t * 3.2 + fbm(centered * 6.0) * 8.0);
  float arcMask = smoothstep(0.86, 0.995, arcBand) * smoothstep(0.06, 0.32, radius) * (0.25 + uArcs * 0.22);

  vec2 cursorUv = uCursor.xy / max(uResolution, vec2(1.0));
  float cursorDist = distance(uv, cursorUv);
  float cursorGlow = exp(-cursorDist * cursorDist / max(0.0001, pow(uCursorRadius / max(uResolution.x, uResolution.y), 2.0))) * uCursor.z;

  float flick = mix(1.0, 0.72 + 0.28 * sin(t * 17.0 + fine * 19.0), clamp(uFlicker, 0.0, 1.0));
  float electric = edge * strand * flick * (1.0 + cursorGlow * 1.25);
  float soft = aura * (0.28 + uGlow * 0.72) * (0.8 + spark * 0.55);
  float arc = edge * arcMask * (0.65 + cursorGlow);

  vec3 col = uGlowColor * soft + uColor * electric * 1.22 + mix(uColor, vec3(1.0), 0.55) * arc;
  col += uGlowColor * cursorGlow * aura * 0.55;
  col += uGlowColor * a * uFill * 0.08;

  float alpha = clamp((soft + electric + arc) * uIntensity + a * uFill * 0.1, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const ElectricLogo = ({
  src,
  color = '#ecc7ff',
  glowColor = '#ad6dff',
  scale = 0.7,
  strands = 4,
  bend = 0.6,
  crackle = 1.5,
  arcs = 1,
  speed = 2.5,
  interactive = true,
  intensity = 1,
  glow = 1,
  thickness = 1.5,
  flicker = 0.6,
  fill = 0,
  cursorIntensity = 0.75,
  cursorRadius = 100,
  className = '',
  style,
}) => {
  const containerRef = useRef(null);
  const propsRef = useRef({});

  useEffect(() => {
    propsRef.current = {
      color,
      glowColor,
      scale,
      strands,
      bend,
      crackle,
      arcs,
      speed,
      interactive,
      intensity,
      glow,
      thickness,
      flicker,
      fill,
      cursorIntensity,
      cursorRadius,
    };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) return undefined;

    const renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    });

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const canvas = gl.canvas;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const texture = new Texture(gl, {
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      generateMipmaps: false,
      flipY: true,
    });

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      texture.image = image;
      texture.needsUpdate = true;
    };
    image.src = src;

    const uniforms = {
      tMap: { value: texture },
      uResolution: { value: [1, 1] },
      uTime: { value: 0 },
      uScale: { value: scale },
      uColor: { value: hexToRgb(color) },
      uGlowColor: { value: hexToRgb(glowColor) },
      uIntensity: { value: intensity },
      uGlow: { value: glow },
      uThickness: { value: thickness },
      uFlicker: { value: flicker },
      uStrands: { value: strands },
      uBend: { value: bend },
      uCrackle: { value: crackle },
      uArcs: { value: arcs },
      uFill: { value: fill },
      uCursor: { value: [0, 0, 0] },
      uCursorRadius: { value: cursorRadius },
    };

    const mesh = new Mesh(gl, {
      geometry: new Triangle(gl),
      program: new Program(gl, {
        vertex,
        fragment,
        uniforms,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    });

    let width = 1;
    let height = 1;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let time = 0;
    const pointer = { x: 0, y: 0, over: false, power: 0 };

    const resize = () => {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height);
      uniforms.uResolution.value = [width, height];
    };

    const move = event => {
      const rect = container.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = rect.height - (event.clientY - rect.top);
      pointer.over = true;
    };

    const leave = () => {
      pointer.over = false;
    };

    const frame = now => {
      raf = 0;
      if (!visible) return;

      const p = propsRef.current;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      time += dt * (p.speed ?? 2.5);

      const target = p.interactive && pointer.over ? (p.cursorIntensity ?? 0.75) : 0;
      pointer.power += (target - pointer.power) * (1 - Math.exp(-dt / 0.16));

      uniforms.uTime.value = time;
      uniforms.uScale.value = p.scale ?? 0.7;
      uniforms.uColor.value = hexToRgb(p.color);
      uniforms.uGlowColor.value = hexToRgb(p.glowColor);
      uniforms.uIntensity.value = p.intensity ?? 1;
      uniforms.uGlow.value = p.glow ?? 1;
      uniforms.uThickness.value = p.thickness ?? 1.5;
      uniforms.uFlicker.value = p.flicker ?? 0.6;
      uniforms.uStrands.value = p.strands ?? 4;
      uniforms.uBend.value = p.bend ?? 0.6;
      uniforms.uCrackle.value = p.crackle ?? 1.5;
      uniforms.uArcs.value = p.arcs ?? 1;
      uniforms.uFill.value = p.fill ?? 0;
      uniforms.uCursor.value = [pointer.x, pointer.y, pointer.power];
      uniforms.uCursorRadius.value = p.cursorRadius ?? 100;

      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(frame);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!visible && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    intersectionObserver.observe(container);

    container.addEventListener('pointermove', move);
    container.addEventListener('pointerdown', move);
    container.addEventListener('pointerleave', leave);
    container.addEventListener('pointercancel', leave);

    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      visible = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener('pointermove', move);
      container.removeEventListener('pointerdown', move);
      container.removeEventListener('pointerleave', leave);
      container.removeEventListener('pointercancel', leave);
      image.onload = null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [src]);

  return <div ref={containerRef} className={`electric-logo ${className}`.trim()} style={style} />;
};

export default ElectricLogo;
