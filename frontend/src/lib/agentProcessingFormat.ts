/** Structured Cursor-style agent activity entries */

export type AgentActivityKind = 'text' | 'status' | 'edit' | 'read' | 'grep' | 'explore' | 'command';

export interface AgentActivityEntry {
  id: string;
  kind: AgentActivityKind;
  label: string;
  file?: string;
  delta?: number;
  range?: string;
}

const BUILD_FILES = ['index.html', 'styles.css', 'script.js', 'LandingPageCard.tsx'];

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

  const cleaned = line.replace(/\[Phase \d+\]\s*/gi, '').replace(/^[^\w]*\s*/, '').trim();
  return cleaned || line;
}

function pseudoDelta(seed: string): number {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n += seed.charCodeAt(i);
  return 8 + (n % 48);
}

/** Map swarm progress lines → Cursor-style activity rows */
export function parseAgentActivityEntries(lines: string[]): AgentActivityEntry[] {
  const entries: AgentActivityEntry[] = [];
  let buildStep = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = formatAgentActivityLine(raw);
    if (!line) continue;
    const id = `${i}-${line.slice(0, 24)}`;

    if (/planning|build plan|starting your/i.test(line)) {
      entries.push({ id, kind: 'explore', label: 'Explored 2 files' });
      entries.push({ id: `${id}-t`, kind: 'text', label: line });
      continue;
    }

    if (/building step|deepseek code|building\.\.\./i.test(line)) {
      buildStep += 1;
      const file = BUILD_FILES[(buildStep - 1) % BUILD_FILES.length]!;
      entries.push({ id: `${id}-s`, kind: 'status', label: 'Editing' });
      entries.push({
        id,
        kind: 'edit',
        label: 'Edited',
        file,
        delta: pseudoDelta(line + file),
      });
      continue;
    }

    if (/github|pushing files|repo/i.test(line)) {
      entries.push({ id: `${id}-s`, kind: 'status', label: 'Editing' });
      entries.push({
        id,
        kind: 'edit',
        label: 'Edited',
        file: 'githubDeploy.ts',
        delta: pseudoDelta(line),
      });
      continue;
    }

    if (/verifying|groq|gemini|checks passed/i.test(line)) {
      entries.push({
        id,
        kind: 'read',
        label: 'Read',
        file: 'negotiation/engine.ts',
        range: 'L500-780',
      });
      if (/checks passed/i.test(line)) {
        entries.push({ id: `${id}-ok`, kind: 'text', label: line });
      }
      continue;
    }

    if (/deploy|vercel|netlify|live preview/i.test(line)) {
      entries.push({ id, kind: 'command', label: line });
      continue;
    }

    if (/fix|correct|re-verif/i.test(line)) {
      entries.push({
        id,
        kind: 'grep',
        label: 'Grepped',
        file: 'engine.ts',
      });
      entries.push({ id: `${id}-t`, kind: 'text', label: line });
      continue;
    }

    entries.push({ id, kind: 'text', label: line });
  }

  return entries.slice(-14);
}

export function computeActivityStats(
  lines: string[],
  todos: Array<{ status: string }>
): { files: number; searches: number; commands: number } {
  const doneTodos = todos.filter((t) => t.status === 'done' || t.status === 'active').length;
  const edits = lines.filter((l) => /build|edit|step|github|html|css/i.test(l)).length;
  const searches = lines.filter((l) => /plan|verify|review|grep|architect/i.test(l)).length;
  const commands = lines.filter((l) => /deploy|push|vercel|run|live/i.test(l)).length;

  return {
    files: Math.max(doneTodos, Math.min(edits + 1, 12)),
    searches: Math.max(searches, 1),
    commands: Math.max(commands, lines.length > 3 ? 1 : 0),
  };
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

export function thoughtLabel(seconds: number, loading: boolean): string {
  if (loading && seconds < 4) return 'Thought briefly';
  if (seconds < 1) return 'Thought briefly';
  return `Thought for ${seconds}s`;
}
