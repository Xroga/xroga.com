/** Rotating live status lines — XROGA Black Hole branding (no provider names). */

export function buildLiveStatusMessage(
  elapsedSeconds: number,
  activePhase?: number | null,
  tick = 0
): string {
  const phase = activePhase ?? 1;

  const buildLines = [
    'XROGA AI Black Hole — writing your project…',
    'Absorbing multiverse data — generating styles & layout…',
    'BLACK HOLE V∞ — building pages, sections & features…',
    'Applying theme and responsive design…',
    'Polishing your niche-specific content…',
    'Still coding — your project is taking shape…',
  ];

  const verifyLines = [
    'XROGA Pulse — reviewing syntax…',
    'XROGA Visionary — checking page logic…',
    'AI Swarm Logic — running verification pass…',
  ];

  const deployLines = [
    'Pushing files to GitHub…',
    'Deploying live preview — Vercel / Netlify…',
    'Verifying hosted URL is live…',
  ];

  const pool =
    phase === 2 ? verifyLines : phase === 4 || phase === 5 ? deployLines : buildLines;

  const idx = tick % pool.length;
  const base = pool[idx] ?? buildLines[0]!;
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const time =
    mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return `${base} (${time})`;
}

export function buildHeartbeatActivity(
  elapsedSeconds: number,
  activePhase?: number | null,
  tick = 0
): string {
  return buildLiveStatusMessage(elapsedSeconds, activePhase, tick);
}
