'use client';

/**
 * Showcase product: Playable Web Game.
 *
 * An original arcade game — the player pilots a craft down a narrowing corridor,
 * collecting cells and avoiding drifting blocks. Everything is original geometry
 * drawn to a canvas: no copyrighted characters, artwork, music, or game titles, and
 * no third-party assets of any kind.
 *
 * The loop is real: requestAnimationFrame with delta timing, AABB collision, rising
 * difficulty, pause/resume, and a best score persisted on the device.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { productReset, readLocal, writeLocal } from './shared';

const BRAND = {
  name: 'Driftline',
  ink: '#07070f',
  panel: '#12121f',
  border: '#26263c',
  muted: '#9a9ab8',
  accent: '#22d3ee',
  accentWarm: '#f472b6',
} as const;

const BEST_KEY = 'xroga_showcase_game_best_v1';
const SOUND_KEY = 'xroga_showcase_game_sound_v1';

/**
 * Tones are synthesised with WebAudio rather than shipped as audio files, so the
 * template carries no third-party or licensed sound assets.
 *
 * The context is created lazily on the first deliberate sound, because browsers
 * refuse to start audio before a user gesture.
 */
class TonePlayer {
  private ctx: AudioContext | null = null;

  play(frequency: number, seconds: number, type: OscillatorType = 'sine') {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      const ctx = this.ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      // Short envelope so repeated tones never click or stack into noise.
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + seconds);
    } catch {
      /* Audio is optional; a blocked context must never break the game loop. */
    }
  }

  close() {
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}

/** Logical play field; the canvas is scaled to fit its container. */
const WORLD = { width: 480, height: 720 };
const CRAFT = { width: 26, height: 30 };

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
}

interface Cell {
  x: number;
  y: number;
  taken: boolean;
}

type Phase = 'ready' | 'playing' | 'paused' | 'over';

function overlaps(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function WebGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [collected, setCollected] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const tones = useRef<TonePlayer | null>(null);
  const soundRef = useRef(false);

  // Mutable game state lives in a ref so the animation loop never re-subscribes.
  const game = useRef({
    craftX: WORLD.width / 2 - CRAFT.width / 2,
    targetX: WORLD.width / 2 - CRAFT.width / 2,
    blocks: [] as Block[],
    cells: [] as Cell[],
    elapsed: 0,
    spawnTimer: 0,
    cellTimer: 0,
    speed: 190,
    score: 0,
    collected: 0,
    left: false,
    right: false,
  });

  useEffect(() => {
    setBest(readLocal<number>(BEST_KEY, 0));
    const saved = readLocal<boolean>(SOUND_KEY, false);
    setSoundOn(saved);
    soundRef.current = saved;
    tones.current = new TonePlayer();
    return () => tones.current?.close();
  }, []);

  /** Read through a ref so the game loop never restarts when sound is toggled. */
  const beep = useCallback((frequency: number, seconds: number, type: OscillatorType = 'sine') => {
    if (!soundRef.current) return;
    tones.current?.play(frequency, seconds, type);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      soundRef.current = next;
      writeLocal(SOUND_KEY, next);
      // Confirm the change audibly, so enabling sound gives immediate feedback.
      if (next) tones.current?.play(660, 0.08);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const state = game.current;
    state.craftX = WORLD.width / 2 - CRAFT.width / 2;
    state.targetX = state.craftX;
    state.blocks = [];
    state.cells = [];
    state.elapsed = 0;
    state.spawnTimer = 0;
    state.cellTimer = 0;
    state.speed = 190;
    state.score = 0;
    state.collected = 0;
    setScore(0);
    setCollected(0);
  }, []);

  const start = useCallback(() => {
    reset();
    setPhase('playing');
  }, [reset]);

  const endRun = useCallback(() => {
    const finalScore = Math.floor(game.current.score);
    setPhase('over');
    beep(150, 0.35, 'sawtooth');
    setBest((prev) => {
      if (finalScore <= prev) return prev;
      writeLocal(BEST_KEY, finalScore);
      return finalScore;
    });
  }, [beep]);

  /* ------------------------------------------------------------- controls */

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key;
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        game.current.left = true;
        event.preventDefault();
      } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        game.current.right = true;
        event.preventDefault();
      } else if (key === ' ' || key === 'Enter') {
        event.preventDefault();
        setPhase((current) => {
          if (current === 'playing') return 'paused';
          if (current === 'paused') return 'playing';
          return current;
        });
        if (phase === 'ready' || phase === 'over') start();
      } else if (key === 'p' || key === 'P') {
        setPhase((current) => (current === 'playing' ? 'paused' : current === 'paused' ? 'playing' : current));
      }
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key;
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') game.current.left = false;
      if (key === 'ArrowRight' || key === 'd' || key === 'D') game.current.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [phase, start]);

  /** Pointer and touch steering: the craft eases toward where you press. */
  const steerTo = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    game.current.targetX = Math.max(0, Math.min(WORLD.width - CRAFT.width, ratio * WORLD.width - CRAFT.width / 2));
  }, []);

  /* ------------------------------------------------------------- the loop */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let stopped = false;

    const draw = () => {
      const state = game.current;
      const { width: W, height: H } = WORLD;

      // Backdrop with a moving starfield-style rule set (original, procedural).
      ctx.fillStyle = BRAND.ink;
      ctx.fillRect(0, 0, W, H);

      const laneInset = Math.min(120, state.elapsed * 6);
      ctx.strokeStyle = 'rgba(34,211,238,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(laneInset, 0);
      ctx.lineTo(laneInset, H);
      ctx.moveTo(W - laneInset, 0);
      ctx.lineTo(W - laneInset, H);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      for (let i = 0; i < 26; i += 1) {
        const y = (i * 137 + state.elapsed * 60) % H;
        const x = (i * 79) % W;
        ctx.fillRect(x, y, 2, 8);
      }

      // Cells
      for (const cell of state.cells) {
        if (cell.taken) continue;
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = BRAND.accentWarm;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(244,114,182,0.38)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Blocks
      for (const block of state.blocks) {
        ctx.fillStyle = '#2b2b45';
        ctx.fillRect(block.x, block.y, block.w, block.h);
        ctx.strokeStyle = 'rgba(148,163,184,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(block.x + 0.75, block.y + 0.75, block.w - 1.5, block.h - 1.5);
      }

      // Craft: a simple original triangle-and-fins shape.
      const cx = state.craftX;
      const cy = H - 92;
      ctx.fillStyle = BRAND.accent;
      ctx.beginPath();
      ctx.moveTo(cx + CRAFT.width / 2, cy);
      ctx.lineTo(cx + CRAFT.width, cy + CRAFT.height);
      ctx.lineTo(cx + CRAFT.width / 2, cy + CRAFT.height - 7);
      ctx.lineTo(cx, cy + CRAFT.height);
      ctx.closePath();
      ctx.fill();

      // Thrust flicker, only while actually moving forward.
      if (phase === 'playing') {
        ctx.fillStyle = 'rgba(34,211,238,0.5)';
        const flame = 6 + Math.random() * 7;
        ctx.beginPath();
        ctx.moveTo(cx + CRAFT.width / 2 - 4, cy + CRAFT.height - 6);
        ctx.lineTo(cx + CRAFT.width / 2, cy + CRAFT.height - 6 + flame);
        ctx.lineTo(cx + CRAFT.width / 2 + 4, cy + CRAFT.height - 6);
        ctx.closePath();
        ctx.fill();
      }
    };

    const step = (now: number) => {
      if (stopped) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const state = game.current;

      if (phase === 'playing') {
        state.elapsed += dt;
        state.speed = 190 + state.elapsed * 11;

        // Steering: keys nudge the target, pointer sets it directly.
        if (state.left) state.targetX -= 420 * dt;
        if (state.right) state.targetX += 420 * dt;
        state.targetX = Math.max(0, Math.min(WORLD.width - CRAFT.width, state.targetX));
        state.craftX += (state.targetX - state.craftX) * Math.min(1, dt * 14);

        // Spawn blocks, faster over time.
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          state.spawnTimer = Math.max(0.34, 0.95 - state.elapsed * 0.02);
          const w = 44 + Math.random() * 92;
          state.blocks.push({
            x: Math.random() * (WORLD.width - w),
            y: -40,
            w,
            h: 20 + Math.random() * 16,
            vx: (Math.random() - 0.5) * 60,
          });
        }

        // Spawn collectables.
        state.cellTimer -= dt;
        if (state.cellTimer <= 0) {
          state.cellTimer = 1.5 + Math.random();
          state.cells.push({ x: 24 + Math.random() * (WORLD.width - 48), y: -20, taken: false });
        }

        // Advance and cull.
        for (const block of state.blocks) {
          block.y += state.speed * dt;
          block.x += block.vx * dt;
          if (block.x < 0 || block.x + block.w > WORLD.width) block.vx *= -1;
        }
        for (const cell of state.cells) cell.y += state.speed * dt;
        state.blocks = state.blocks.filter((b) => b.y < WORLD.height + 60);
        state.cells = state.cells.filter((c) => c.y < WORLD.height + 40 && !c.taken);

        // Distance score.
        state.score += dt * 14;

        const craftY = WORLD.height - 92;

        // Collect
        for (const cell of state.cells) {
          if (cell.taken) continue;
          if (overlaps(state.craftX, craftY, CRAFT.width, CRAFT.height, cell.x - 8, cell.y - 8, 16, 16)) {
            cell.taken = true;
            state.score += 25;
            state.collected += 1;
            setCollected(state.collected);
            beep(880, 0.09, 'triangle');
          }
        }

        // Collide
        for (const block of state.blocks) {
          if (overlaps(state.craftX, craftY, CRAFT.width, CRAFT.height, block.x, block.y, block.w, block.h)) {
            endRun();
            break;
          }
        }

        setScore(Math.floor(state.score));
      }

      draw();
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [phase, endRun, beep]);

  return (
    <div className="dl-root">
      <style>{CSS}</style>

      <header className="dl-header">
        <span className="dl-brand">
          <span className="dl-brand-mark" aria-hidden>
            ◆
          </span>
          {BRAND.name}
        </span>
        <p className="dl-tagline">An original arcade game built for the Xroga AI Showcase.</p>
      </header>

      <main className="dl-main">
        <div className="dl-stage">
          <div className="dl-hud">
            <div className="dl-hud-item">
              <span className="dl-hud-label">Score</span>
              <span className="dl-hud-value" role="status" aria-live="off">
                {score}
              </span>
            </div>
            <div className="dl-hud-item">
              <span className="dl-hud-label">Cells</span>
              <span className="dl-hud-value">{collected}</span>
            </div>
            <div className="dl-hud-item">
              <span className="dl-hud-label">Best</span>
              <span className="dl-hud-value dl-hud-value--best">{best}</span>
            </div>
          </div>

          <div
            className="dl-canvas-wrap"
            onPointerDown={(event) => {
              if (phase === 'ready' || phase === 'over') start();
              steerTo(event.clientX);
            }}
            onPointerMove={(event) => {
              if (event.buttons > 0) steerTo(event.clientX);
            }}
            onTouchStart={(event) => {
              if (phase === 'ready' || phase === 'over') start();
              if (event.touches[0]) steerTo(event.touches[0].clientX);
            }}
            onTouchMove={(event) => {
              if (event.touches[0]) steerTo(event.touches[0].clientX);
            }}
          >
            <canvas ref={canvasRef} width={WORLD.width} height={WORLD.height} className="dl-canvas" aria-label="Game field" role="img" />

            {phase !== 'playing' && (
              <div className="dl-overlay">
                {phase === 'ready' && (
                  <>
                    <h1 className="dl-overlay-title">{BRAND.name}</h1>
                    <p className="dl-overlay-body">
                      Steer down the corridor, gather cells, and avoid the blocks. The corridor narrows and everything
                      speeds up the longer you survive.
                    </p>
                    <button type="button" className="dl-btn" onClick={start}>
                      Start game
                    </button>
                  </>
                )}
                {phase === 'paused' && (
                  <>
                    <h2 className="dl-overlay-title">Paused</h2>
                    <button type="button" className="dl-btn" onClick={() => setPhase('playing')}>
                      Resume
                    </button>
                  </>
                )}
                {phase === 'over' && (
                  <>
                    <h2 className="dl-overlay-title">Run over</h2>
                    <p className="dl-overlay-score">
                      {score} <span>points</span>
                    </p>
                    <p className="dl-overlay-body">
                      {score >= best && score > 0 ? 'A new personal best on this device.' : `Your best on this device is ${best}.`}
                    </p>
                    <button type="button" className="dl-btn" onClick={start}>
                      Play again
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="dl-controls">
            <button
              type="button"
              className="dl-pad"
              aria-label="Steer left"
              onPointerDown={() => {
                game.current.left = true;
              }}
              onPointerUp={() => {
                game.current.left = false;
              }}
              onPointerLeave={() => {
                game.current.left = false;
              }}
            >
              ←
            </button>
            <button
              type="button"
              className="dl-btn dl-btn--ghost"
              onClick={() => setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p))}
              disabled={phase === 'ready' || phase === 'over'}
            >
              {phase === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={soundOn}
              aria-label="Sound"
              title={soundOn ? 'Sound on' : 'Sound off'}
              className={`dl-pad dl-pad--sound${soundOn ? ' dl-pad--on' : ''}`}
              onClick={toggleSound}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 9h3l4-3.5v13L7 15H4z" fill="currentColor" />
                {soundOn ? (
                  <path d="M15.5 8.5a4.5 4.5 0 0 1 0 7M18 6a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                ) : (
                  <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                )}
              </svg>
            </button>
            <button
              type="button"
              className="dl-pad"
              aria-label="Steer right"
              onPointerDown={() => {
                game.current.right = true;
              }}
              onPointerUp={() => {
                game.current.right = false;
              }}
              onPointerLeave={() => {
                game.current.right = false;
              }}
            >
              →
            </button>
          </div>

          <p className="dl-help">
            Arrow keys or <kbd>A</kbd>/<kbd>D</kbd> to steer · <kbd>P</kbd> to pause · or drag anywhere on the field.
            Sound is off by default and synthesised, not sampled. Your best score is saved on this device only.
          </p>
        </div>
      </main>
    </div>
  );
}

const CSS = `
${productReset('.dl-root')}
.dl-root {
  --ink: ${BRAND.ink};
  --panel: ${BRAND.panel};
  --border: ${BRAND.border};
  --muted: ${BRAND.muted};
  --accent: ${BRAND.accent};
  --accent-warm: ${BRAND.accentWarm};
  min-height: 100%; background: radial-gradient(120% 80% at 50% 0%, #16162a 0%, var(--ink) 62%);
  color: #f2f2fa; line-height: 1.5;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.dl-root *, .dl-root *::before, .dl-root *::after { box-sizing: border-box; }
.dl-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.dl-header { padding: 22px 20px 6px; text-align: center; }
.dl-brand { display: inline-flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 750; letter-spacing: 0.01em; }
.dl-brand-mark { color: var(--accent); font-size: 13px; }
.dl-tagline { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); }

.dl-main { display: grid; place-items: center; padding: 14px 16px 34px; }
.dl-stage { width: 100%; max-width: 480px; }

.dl-hud { display: flex; gap: 10px; margin-bottom: 12px; }
.dl-hud-item {
  flex: 1; display: grid; gap: 2px; padding: 9px 12px;
  border: 1px solid var(--border); border-radius: 11px; background: var(--panel);
}
.dl-hud-label { font-size: 10px; font-weight: 750; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.dl-hud-value { font-size: 21px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.dl-hud-value--best { color: var(--accent-warm); }

.dl-canvas-wrap {
  position: relative; overflow: hidden; border: 1px solid var(--border); border-radius: 16px;
  background: var(--ink); touch-action: none; cursor: crosshair;
  box-shadow: 0 30px 60px -30px rgba(0,0,0,0.8);
}
.dl-canvas { display: block; width: 100%; height: auto; }

.dl-overlay {
  position: absolute; inset: 0; display: grid; place-content: center; gap: 12px;
  padding: 28px; text-align: center; background: rgba(7,7,15,0.86); backdrop-filter: blur(3px);
}
.dl-overlay-title { margin: 0; font-size: clamp(24px, 6vw, 34px); font-weight: 800; letter-spacing: -0.03em; }
.dl-overlay-body { margin: 0 auto; max-width: 32ch; font-size: 13.5px; line-height: 1.6; color: var(--muted); }
.dl-overlay-score { margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -0.04em; color: var(--accent); }
.dl-overlay-score span { font-size: 14px; font-weight: 600; color: var(--muted); letter-spacing: 0; }

.dl-btn {
  justify-self: center; padding: 11px 24px; border: 0; border-radius: 999px;
  background: var(--accent); color: #04121a; font-size: 14px; font-weight: 750; cursor: pointer; font-family: inherit;
  transition: transform 140ms ease, filter 140ms ease;
}
.dl-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }
.dl-btn--ghost { background: var(--panel); color: #f2f2fa; border: 1px solid var(--border); }
.dl-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

.dl-controls { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 14px; }
.dl-pad {
  display: grid; place-items: center; width: 62px; height: 44px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--panel);
  color: #f2f2fa; font-size: 19px; cursor: pointer; font-family: inherit; touch-action: none;
}
.dl-pad:active { background: #1d1d31; }
.dl-pad--sound { width: 46px; color: var(--muted); }
.dl-pad--on { color: var(--accent); border-color: rgba(34,211,238,0.45); }

.dl-help { margin: 14px 0 0; text-align: center; font-size: 11.5px; line-height: 1.6; color: var(--muted); }
.dl-help kbd {
  padding: 1px 5px; border: 1px solid var(--border); border-radius: 5px;
  background: var(--panel); font-size: 10.5px; font-family: ui-monospace, monospace;
}

@media (prefers-reduced-motion: reduce) {
  .dl-root *, .dl-root *::before, .dl-root *::after { transition-duration: 0.001ms !important; }
  .dl-btn:hover { transform: none; }
}
`;
