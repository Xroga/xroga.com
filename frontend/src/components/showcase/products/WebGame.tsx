'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { productReset, readLocal, writeLocal } from './shared';

const W = 960;
const H = 540;
const BEST_KEY = 'xroga_showcase_game_best_v1';
const PROGRESS_KEY = 'xroga_rift_progress_v1';

type Screen = 'menu' | 'playing' | 'paused' | 'complete' | 'failed';
type RiftPhase = 'cyan' | 'magenta';
type Point = { x: number; y: number };
type Enemy = Point & { hp: number; kind: 'sentinel' | 'guardian'; cooldown: number };
type Bullet = Point & { vx: number; vy: number; hostile: boolean };
type Core = Point & { collected: boolean };

const LEVELS = [
  { name: 'Vault Breach', objective: 'Recover 3 Rift Cores', cores: 3, enemies: 2, phase: false, boss: false },
  { name: 'Laser Grid', objective: 'Recover 4 cores through the security grid', cores: 4, enemies: 3, phase: false, boss: false },
  { name: 'Sentinel Forge', objective: 'Destroy 6 sentinels', cores: 0, enemies: 6, phase: false, boss: false },
  { name: 'Split Reality', objective: 'Phase-shift and recover 3 cores', cores: 3, enemies: 4, phase: true, boss: false },
  { name: 'The Guardian', objective: 'Defeat the Neon Guardian', cores: 0, enemies: 0, phase: true, boss: true },
] as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function makeLevel(level: number) {
  const config = LEVELS[level];
  const cores: Core[] = Array.from({ length: config.cores }, (_, i) => ({
    x: 190 + ((i * 211 + level * 73) % 610),
    y: 120 + ((i * 137 + level * 91) % 300),
    collected: false,
  }));
  const enemies: Enemy[] = Array.from({ length: config.enemies }, (_, i) => ({
    x: 300 + ((i * 173 + level * 47) % 540),
    y: 100 + ((i * 109 + level * 61) % 330),
    hp: 2,
    kind: 'sentinel' as const,
    cooldown: 0.7 + i * 0.12,
  }));
  if (config.boss) enemies.push({ x: 760, y: 270, hp: 18, kind: 'guardian', cooldown: 0.4 });
  return { player: { x: 90, y: H / 2 }, cores, enemies, bullets: [] as Bullet[], hp: 100, elapsed: 0, dash: 1 };
}

export function WebGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [level, setLevel] = useState(0);
  const [riftPhase, setRiftPhase] = useState<RiftPhase>('cyan');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [unlocked, setUnlocked] = useState(1);
  const [hud, setHud] = useState({ hp: 100, current: 0, target: 3, dash: 100 });
  const game = useRef(makeLevel(0));
  const keys = useRef(new Set<string>());
  const screenRef = useRef<Screen>('menu');
  const levelRef = useRef(0);
  const phaseRef = useRef<RiftPhase>('cyan');
  const scoreRef = useRef(0);
  const lastHud = useRef(0);

  useEffect(() => {
    setBest(Number(readLocal(BEST_KEY, '0')) || 0);
    setUnlocked(clamp(Number(readLocal(PROGRESS_KEY, '1')) || 1, 1, LEVELS.length));
  }, []);

  const setGameScreen = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreen(next);
  }, []);

  const beginLevel = useCallback((nextLevel: number) => {
    levelRef.current = nextLevel;
    setLevel(nextLevel);
    game.current = makeLevel(nextLevel);
    scoreRef.current = nextLevel === 0 ? 0 : scoreRef.current;
    if (nextLevel === 0) setScore(0);
    phaseRef.current = 'cyan';
    setRiftPhase('cyan');
    const config = LEVELS[nextLevel];
    setHud({ hp: 100, current: 0, target: config.cores || (config.boss ? 1 : config.enemies), dash: 100 });
    setGameScreen('playing');
  }, [setGameScreen]);

  const togglePhase = useCallback(() => {
    if (!LEVELS[levelRef.current].phase || screenRef.current !== 'playing') return;
    const next = phaseRef.current === 'cyan' ? 'magenta' : 'cyan';
    phaseRef.current = next;
    setRiftPhase(next);
  }, []);

  const dash = useCallback(() => {
    const state = game.current;
    if (screenRef.current !== 'playing' || state.dash < 1) return;
    const dx = (keys.current.has('d') || keys.current.has('arrowright') ? 1 : 0) - (keys.current.has('a') || keys.current.has('arrowleft') ? 1 : 0);
    const dy = (keys.current.has('s') || keys.current.has('arrowdown') ? 1 : 0) - (keys.current.has('w') || keys.current.has('arrowup') ? 1 : 0);
    state.player.x = clamp(state.player.x + (dx || 1) * 105, 34, W - 34);
    state.player.y = clamp(state.player.y + dy * 105, 34, H - 34);
    state.dash = 0;
  }, []);

  const fire = useCallback(() => {
    const state = game.current;
    if (screenRef.current !== 'playing') return;
    const target = [...state.enemies].sort((a, b) => distance(state.player, a) - distance(state.player, b))[0];
    const angle = target ? Math.atan2(target.y - state.player.y, target.x - state.player.x) : 0;
    state.bullets.push({ x: state.player.x, y: state.player.y, vx: Math.cos(angle) * 560, vy: Math.sin(angle) * 560, hostile: false });
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(key)) event.preventDefault();
      keys.current.add(key);
      if (key === 'f') fire();
      if (key === 'q') togglePhase();
      if (key === ' ' || key === 'shift') dash();
      if (key === 'escape' && screenRef.current === 'playing') setGameScreen('paused');
      else if (key === 'escape' && screenRef.current === 'paused') setGameScreen('playing');
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [dash, fire, setGameScreen, togglePhase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let previous = performance.now();

    const render = () => {
      const state = game.current;
      const currentLevel = LEVELS[levelRef.current];
      ctx.fillStyle = '#03070d'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(46,242,255,.075)'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      const glow = ctx.createRadialGradient(state.player.x, state.player.y, 0, state.player.x, state.player.y, 170);
      glow.addColorStop(0, phaseRef.current === 'cyan' ? 'rgba(25,228,255,.13)' : 'rgba(255,48,212,.13)'); glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

      if (currentLevel.phase) {
        ctx.save(); ctx.setLineDash([14, 10]); ctx.lineWidth = 5;
        ctx.strokeStyle = phaseRef.current === 'cyan' ? 'rgba(255,48,212,.32)' : 'rgba(25,228,255,.32)';
        ctx.strokeRect(390, 55, 115, 430); ctx.restore();
      }
      if (levelRef.current === 1) {
        ctx.strokeStyle = 'rgba(255,65,92,.6)'; ctx.lineWidth = 3;
        const laserY = 80 + ((state.elapsed * 90) % 380);
        ctx.beginPath(); ctx.moveTo(250, laserY); ctx.lineTo(700, laserY); ctx.stroke();
      }
      for (const core of state.cores) if (!core.collected) {
        ctx.save(); ctx.translate(core.x, core.y); ctx.rotate(state.elapsed * 1.8); ctx.shadowBlur = 18; ctx.shadowColor = '#ffd84d';
        ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 4; ctx.strokeRect(-10, -10, 20, 20); ctx.restore();
      }
      for (const enemy of state.enemies) {
        ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.shadowBlur = enemy.kind === 'guardian' ? 28 : 15; ctx.shadowColor = '#ff305f';
        ctx.strokeStyle = enemy.kind === 'guardian' ? '#ffcf47' : '#ff305f'; ctx.lineWidth = enemy.kind === 'guardian' ? 7 : 4;
        const size = enemy.kind === 'guardian' ? 38 : 18; ctx.rotate(state.elapsed * (enemy.kind === 'guardian' ? -.35 : .8));
        ctx.strokeRect(-size, -size, size * 2, size * 2); ctx.restore();
      }
      for (const bullet of state.bullets) {
        ctx.fillStyle = bullet.hostile ? '#ff305f' : '#eaffff'; ctx.shadowBlur = 12; ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.hostile ? 5 : 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      }
      ctx.save(); ctx.translate(state.player.x, state.player.y); ctx.shadowBlur = 24; ctx.shadowColor = phaseRef.current === 'cyan' ? '#19e4ff' : '#ff30d4';
      ctx.fillStyle = phaseRef.current === 'cyan' ? '#19e4ff' : '#ff30d4';
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-15, -13); ctx.lineTo(-8, 0); ctx.lineTo(-15, 13); ctx.closePath(); ctx.fill(); ctx.restore();
    };

    const finishLevel = () => {
      const nextUnlocked = clamp(Math.max(unlocked, levelRef.current + 2), 1, LEVELS.length);
      setUnlocked(nextUnlocked); writeLocal(PROGRESS_KEY, String(nextUnlocked));
      const finalScore = Math.round(scoreRef.current);
      if (finalScore > Number(readLocal(BEST_KEY, '0'))) { writeLocal(BEST_KEY, String(finalScore)); setBest(finalScore); }
      setGameScreen('complete');
    };

    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.035); previous = now;
      const state = game.current;
      if (screenRef.current === 'playing') {
        state.elapsed += dt; state.dash = Math.min(1, state.dash + dt * 0.42);
        let dx = 0, dy = 0;
        if (keys.current.has('a') || keys.current.has('arrowleft')) dx--;
        if (keys.current.has('d') || keys.current.has('arrowright')) dx++;
        if (keys.current.has('w') || keys.current.has('arrowup')) dy--;
        if (keys.current.has('s') || keys.current.has('arrowdown')) dy++;
        const magnitude = Math.hypot(dx, dy) || 1;
        state.player.x = clamp(state.player.x + dx / magnitude * 230 * dt, 25, W - 25);
        state.player.y = clamp(state.player.y + dy / magnitude * 230 * dt, 25, H - 25);
        scoreRef.current += dt * 10;

        for (const core of state.cores) if (!core.collected && distance(state.player, core) < 28) {
          core.collected = true; scoreRef.current += 250;
        }
        for (const enemy of state.enemies) {
          const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
          if (enemy.kind === 'sentinel') { enemy.x += Math.cos(angle) * 23 * dt; enemy.y += Math.sin(angle) * 23 * dt; }
          enemy.cooldown -= dt;
          if (enemy.cooldown <= 0) {
            state.bullets.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 155, vy: Math.sin(angle) * 155, hostile: true });
            enemy.cooldown = enemy.kind === 'guardian' ? .38 : 1.35;
          }
        }
        for (const bullet of state.bullets) {
          bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt;
          if (bullet.hostile && distance(bullet, state.player) < 17) { bullet.x = -99; state.hp -= 12; }
          if (!bullet.hostile) for (const enemy of state.enemies) if (distance(bullet, enemy) < (enemy.kind === 'guardian' ? 45 : 24)) {
            bullet.x = -99; enemy.hp--; if (enemy.hp <= 0) scoreRef.current += enemy.kind === 'guardian' ? 2000 : 300;
          }
        }
        state.bullets = state.bullets.filter(b => b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
        state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
        const config = LEVELS[levelRef.current];
        const current = config.cores ? state.cores.filter(core => core.collected).length : (config.boss ? (state.enemies.length ? 0 : 1) : config.enemies - state.enemies.length);
        if (state.hp <= 0) setGameScreen('failed');
        else if (current >= (config.cores || (config.boss ? 1 : config.enemies))) finishLevel();
        if (now - lastHud.current > 120) {
          lastHud.current = now; setScore(Math.round(scoreRef.current));
          setHud({ hp: Math.max(0, state.hp), current, target: config.cores || (config.boss ? 1 : config.enemies), dash: Math.round(state.dash * 100) });
        }
      }
      render(); frame = requestAnimationFrame(tick);
    };
    render(); frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [setGameScreen, unlocked]);

  const hold = (key: string, active: boolean) => active ? keys.current.add(key) : keys.current.delete(key);
  const continueMission = () => level < LEVELS.length - 1 ? beginLevel(level + 1) : setGameScreen('menu');

  return (
    <div className="nr-root" style={{ minHeight: '100svh' }}>
      <style>{CSS}</style>
      <main className="nr-shell">
        <header className="nr-topbar">
          <div className="nr-brand"><span className="nr-brand-mark">NR</span><span>NEON RIFT // VAULT PROTOCOL</span></div>
          <div className="nr-status"><span className="nr-live" /> SYSTEM ONLINE <b>BEST {best.toLocaleString()}</b></div>
        </header>

        <section className="nr-stage" aria-label="Riftbreaker game">
          <canvas ref={canvasRef} className="nr-canvas" width={W} height={H} aria-label="Neon Vault game field" />
          {screen !== 'menu' && <div className="nr-hud" aria-live="polite">
            <span>LVL <b>{String(level + 1).padStart(2, '0')}</b></span><span>PHASE <b className={`nr-${riftPhase}`}>{riftPhase}</b></span>
            <span>HP <b>{Math.round(hud.hp)}%</b></span><span>SCORE <b className="nr-score">{score.toLocaleString()}</b></span>
            <span>OBJECTIVE <b>{hud.current}/{hud.target}</b></span>
          </div>}

          {screen === 'menu' && <div className="nr-overlay nr-menu">
            <p className="nr-kicker">A NEON VAULT OPERATIVE SIMULATION</p>
            <h1><span>RIFT</span>BREAKER</h1>
            <p className="nr-subtitle">Breach the vault. Recover unstable cores. Shift between realities and survive the Guardian.</p>
            <div className="nr-actions"><button type="button" className="nr-primary" onClick={() => beginLevel(0)}>Start mission</button>{unlocked > 1 && <button type="button" onClick={() => beginLevel(unlocked - 1)}>Continue · Level {unlocked}</button>}</div>
            <div className="nr-instructions"><article><b>01 // RECOVER</b><span>Collect every Rift Core</span></article><article><b>02 // FIGHT</b><span>Fire at sentinels and evade</span></article><article><b>03 // PHASE</b><span>Switch realities to pass walls</span></article></div>
            <div className="nr-missions">{LEVELS.map((mission, index) => <button key={mission.name} type="button" disabled={index + 1 > unlocked} onClick={() => beginLevel(index)}><small>0{index + 1}</small><span>{mission.name}</span>{index + 1 > unlocked ? 'LOCKED' : 'READY'}</button>)}</div>
          </div>}
          {screen === 'paused' && <div className="nr-overlay nr-dialog"><p className="nr-kicker">SIMULATION SUSPENDED</p><h2>PAUSED</h2><button className="nr-primary" type="button" onClick={() => setGameScreen('playing')}>Resume</button><button type="button" onClick={() => setGameScreen('menu')}>Return to missions</button></div>}
          {(screen === 'complete' || screen === 'failed') && <div className="nr-overlay nr-dialog"><p className="nr-kicker">{screen === 'complete' ? 'OBJECTIVE SECURED' : 'SIGNAL LOST'}</p><h2>{screen === 'complete' ? 'MISSION COMPLETE' : 'OPERATIVE DOWN'}</h2><p>Score <strong>{score.toLocaleString()}</strong></p><button className="nr-primary" type="button" onClick={screen === 'complete' ? continueMission : () => beginLevel(level)}>{screen === 'complete' && level < LEVELS.length - 1 ? 'Next mission' : screen === 'failed' ? 'Retry mission' : 'Mission select'}</button><button type="button" onClick={() => setGameScreen('menu')}>Mission select</button></div>}
        </section>

        <div className="nr-objective"><span>MISSION {level + 1}</span><b>{LEVELS[level].name}</b><p>{LEVELS[level].objective}</p><div><i style={{ width: `${hud.dash}%` }} /></div></div>
        <div className="nr-controls" aria-label="Game controls">
          <div className="nr-dpad"><button aria-label="Move left" onPointerDown={() => hold('a', true)} onPointerUp={() => hold('a', false)} onPointerLeave={() => hold('a', false)}>←</button><button aria-label="Move up" onPointerDown={() => hold('w', true)} onPointerUp={() => hold('w', false)} onPointerLeave={() => hold('w', false)}>↑</button><button aria-label="Move down" onPointerDown={() => hold('s', true)} onPointerUp={() => hold('s', false)} onPointerLeave={() => hold('s', false)}>↓</button><button aria-label="Move right" onPointerDown={() => hold('d', true)} onPointerUp={() => hold('d', false)} onPointerLeave={() => hold('d', false)}>→</button></div>
          <button type="button" onClick={fire}>FIRE <kbd>F</kbd></button><button type="button" onClick={togglePhase} disabled={!LEVELS[level].phase}>PHASE <kbd>Q</kbd></button><button type="button" onClick={dash}>DASH <kbd>⇧</kbd></button><button type="button" onClick={() => setGameScreen(screen === 'paused' ? 'playing' : 'paused')} disabled={screen !== 'playing' && screen !== 'paused'}>{screen === 'paused' ? 'Resume' : 'Pause'}</button>
        </div>
        <p className="nr-help">WASD / ARROWS TO MOVE · MOUSE OR F TO FIRE · Q TO PHASE · SHIFT / SPACE TO DASH · ESC TO PAUSE</p>
      </main>
    </div>
  );
}

const CSS = `
${productReset('.nr-root')}
.nr-root{--cyan:#19e4ff;--mag:#ff30d4;--gold:#ffd84d;--red:#ff305f;min-height:100%;background:#03070d;color:#e9fbff;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.4;-webkit-font-smoothing:antialiased}.nr-root *{box-sizing:border-box}.nr-root button{font:inherit}.nr-root :focus-visible{outline:2px solid var(--cyan);outline-offset:3px}.nr-shell{width:min(1180px,100%);margin:auto;padding:18px}.nr-topbar{display:flex;justify-content:space-between;align-items:center;padding:12px 15px;border:1px solid #14303a;border-bottom:0;background:#071016;font-size:11px;letter-spacing:.08em}.nr-brand{display:flex;align-items:center;gap:10px;font-weight:800}.nr-brand-mark{display:grid;place-items:center;width:30px;height:24px;border:1px solid var(--cyan);color:var(--cyan);box-shadow:inset 0 0 14px #19e4ff33}.nr-status{display:flex;align-items:center;gap:9px;color:#7d9ba3}.nr-status b{color:var(--gold);margin-left:8px}.nr-live{width:7px;height:7px;border-radius:50%;background:#4cff88;box-shadow:0 0 12px #4cff88}.nr-stage{position:relative;overflow:hidden;border:1px solid #14303a;background:#03070d;box-shadow:0 30px 80px #000}.nr-canvas{display:block;width:100%;aspect-ratio:16/9}.nr-hud{position:absolute;inset:12px 14px auto;z-index:3;display:flex;gap:8px;pointer-events:none}.nr-hud span{padding:6px 9px;border:1px solid #173945;background:#041016dc;color:#648b95;font-size:9px;letter-spacing:.08em}.nr-hud b{color:#e9fbff}.nr-hud .nr-cyan{color:var(--cyan)}.nr-hud .nr-magenta{color:var(--mag)}.nr-overlay{position:absolute;inset:0;z-index:4;display:grid;place-content:center;text-align:center;padding:38px;background:radial-gradient(circle at center,#071a22e8,#02060bfa)}.nr-kicker{margin:0 0 10px;color:var(--cyan);font-size:10px;letter-spacing:.24em}.nr-menu h1{margin:0;font:900 clamp(48px,9vw,105px)/.8 Impact,Haettenschweiler,'Arial Narrow Bold',sans-serif;letter-spacing:-.04em;text-shadow:5px 0 0 #ff30d455}.nr-menu h1 span{display:block;color:transparent;-webkit-text-stroke:1px var(--cyan);font-size:.52em;letter-spacing:.35em}.nr-subtitle{max-width:600px;margin:22px auto;color:#87a6ae;font-size:12px}.nr-actions{display:flex;justify-content:center;gap:10px}.nr-root button{border:1px solid #23434c;background:#08151c;color:#bcd3d8;padding:10px 15px;cursor:pointer;text-transform:uppercase;font-size:10px;letter-spacing:.08em}.nr-root button:hover{border-color:var(--cyan);color:#fff}.nr-root button:disabled{opacity:.35;cursor:not-allowed}.nr-root .nr-primary{background:var(--cyan);border-color:var(--cyan);color:#001015;font-weight:900;box-shadow:0 0 24px #19e4ff33}.nr-instructions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:min(660px,100%);margin:22px auto 10px}.nr-instructions article{display:grid;gap:4px;padding:10px;border:1px solid #132d35;background:#07101699;text-align:left}.nr-instructions b{color:var(--cyan);font-size:9px}.nr-instructions span{font-size:9px;color:#718d94}.nr-missions{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;width:min(780px,100%);margin:auto}.nr-missions button{display:grid;gap:2px;padding:8px}.nr-missions small{color:var(--cyan)}.nr-missions span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff}.nr-dialog{gap:12px}.nr-dialog h2{margin:0;font:900 clamp(32px,6vw,68px)/1 Impact,sans-serif;letter-spacing:.04em}.nr-dialog p{margin:0;color:#7f9ba2}.nr-dialog strong{color:var(--gold)}.nr-dialog button{justify-self:center;min-width:190px}.nr-objective{display:grid;grid-template-columns:auto auto 1fr 150px;align-items:center;gap:14px;padding:11px 14px;border:1px solid #14303a;border-top:0;background:#071016;font-size:10px}.nr-objective>span{color:var(--cyan)}.nr-objective>b{color:#fff}.nr-objective>p{margin:0;color:#76939a}.nr-objective>div{height:4px;background:#10252c}.nr-objective i{display:block;height:100%;background:var(--cyan);box-shadow:0 0 10px var(--cyan)}.nr-controls{display:flex;justify-content:center;align-items:center;gap:8px;padding:13px}.nr-controls kbd{margin-left:8px;color:var(--cyan)}.nr-dpad{display:flex;gap:3px}.nr-dpad button{padding:10px 12px}.nr-help{text-align:center;margin:0;color:#4f6b73;font-size:9px;letter-spacing:.08em}.nr-controls button:last-child{min-width:78px}
@media(max-width:720px){.nr-shell{padding:0}.nr-topbar{font-size:8px}.nr-status{font-size:0}.nr-status b{font-size:8px}.nr-hud{inset:6px;gap:3px;flex-wrap:wrap}.nr-hud span{font-size:7px;padding:4px 5px}.nr-overlay{padding:18px}.nr-menu h1{font-size:52px}.nr-subtitle{font-size:9px;margin:12px auto}.nr-instructions{display:none}.nr-missions{grid-template-columns:repeat(5,1fr);margin-top:13px}.nr-missions button{font-size:0;padding:7px 3px}.nr-missions small{font-size:9px}.nr-missions span{display:none}.nr-objective{grid-template-columns:auto 1fr auto;padding:8px;font-size:8px}.nr-objective>p{display:none}.nr-objective>div{width:70px}.nr-controls{flex-wrap:wrap;padding:8px 4px}.nr-controls button{padding:9px 10px;font-size:8px}.nr-dpad{order:2;width:100%;justify-content:center}.nr-help{display:none}}
@media(prefers-reduced-motion:reduce){.nr-root *{scroll-behavior:auto!important;transition:none!important}}
`;
