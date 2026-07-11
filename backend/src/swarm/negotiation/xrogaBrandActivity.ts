/** User-facing build activity — XROGA branding only (no external model names). */

export function xrogaArchitectureLine(action: string): string {
  return `XROGA Architect — ${action}`;
}

export function xrogaPulseLine(action: string): string {
  return `XROGA Pulse — ${action}`;
}

export function xrogaVisionaryLine(action: string): string {
  return `XROGA Visionary — ${action}`;
}

export function xrogaCollectiveLine(action: string): string {
  return `XROGA Collective — ${action}`;
}

export function xrogaBlackHoleLine(action: string): string {
  return `BLACK HOLE V∞ — ${action}`;
}

export function xrogaGitHubLine(repo: string, branch: string): string {
  return `XROGA — pushing ${repo} (${branch})`;
}

/** Strip external provider names from legacy log lines. */
export function sanitizeBuildActivityLine(line: string): string {
  return line
    .replace(/\[(DeepSeek|Claude|Groq|Gemini|Mistral)[^\]]*\]\s*/gi, '')
    .replace(/DeepSeek Flash|DeepSeek Pro|Claude Sonnet|Claude Opus/gi, 'XROGA AI')
    .replace(/\s+/g, ' ')
    .trim();
}
