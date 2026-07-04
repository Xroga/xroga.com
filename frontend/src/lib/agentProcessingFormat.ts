/** Format swarm/build progress lines into Cursor-style agent activity text */

export function formatAgentActivityLine(raw: string): string {
  const line = raw.trim();
  if (!line) return '';

  const stepMatch = line.match(/Step\s+(\d+)\/(\d+)\s+(.+)/i);
  if (stepMatch) {
    return `Building step ${stepMatch[1]}/${stepMatch[2]} — ${stepMatch[3]!.trim()}`;
  }

  if (/\bverifying\b/i.test(line)) return 'Verifying — Groq + Gemini code review…';
  if (/\bdeploying\b/i.test(line) || /\bvercel\b/i.test(line)) return 'Deploying live preview to Vercel…';
  if (/\bgithub\b/i.test(line) && /\b(push|repo|creating)\b/i.test(line)) {
    return 'Creating GitHub repo and pushing files…';
  }
  if (/\bplanning\b/i.test(line)) return 'Planning your build steps…';
  if (/\bstarting your\b/i.test(line)) {
    return line.replace(/^🚀\s*\[Phase \d+\]\s*/i, '').trim();
  }
  if (/\bbuild plan ready\b/i.test(line)) return 'Build plan ready — starting execution';
  if (/\ball checks passed\b/i.test(line)) return 'All verification checks passed';
  if (/\blive\b/i.test(line) && /\b✅/i.test(line)) return 'Live preview ready';

  const cleaned = line.replace(/\[Phase \d+\]\s*/gi, '').trim();
  return cleaned || line;
}

export function deriveBuildGoal(analysis?: string | null, latestActivity?: string | null): string | null {
  if (analysis && !analysis.startsWith('Awaiting:') && analysis.length > 12) {
    return analysis.slice(0, 220);
  }
  if (latestActivity && /starting|building|planning/i.test(latestActivity)) {
    return formatAgentActivityLine(latestActivity);
  }
  return null;
}
