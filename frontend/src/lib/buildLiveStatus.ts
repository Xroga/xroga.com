/** Rotating live status lines so users see progress during long silent API calls */

export function buildLiveStatusMessage(
  elapsedSeconds: number,
  activePhase?: number | null,
  tick = 0
): string {
  const phase = activePhase ?? 1;

  const buildLines = [
    'DeepSeek Code writing index.html…',
    'Generating styles.css & layout…',
    'Building menu, gallery & contact pages…',
    'Applying colors and responsive design…',
    'Polishing coffee shop sections…',
    'Still coding — your site is taking shape…',
  ];

  const verifyLines = [
    'Groq reviewing syntax…',
    'Gemini checking page logic…',
    'Running verification pass…',
  ];

  const deployLines = [
    'Pushing files to GitHub…',
    'Deploying live preview to Vercel…',
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
