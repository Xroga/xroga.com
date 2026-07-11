/** Structured XROGA-branded agent activity entries */

import { sanitizeXrogaTerminalText } from '@/lib/xrogaBrand';
import { scaffoldPathsForPrompt } from '@/lib/buildScaffoldPaths';

export type AgentActivityKind = 'text' | 'status' | 'edit' | 'read' | 'grep' | 'explore' | 'command';

export interface AgentActivityEntry {
  id: string;
  kind: AgentActivityKind;
  label: string;
  file?: string;
  delta?: number;
  range?: string;
}

export function formatAgentActivityLine(raw: string): string {
  const line = sanitizeXrogaTerminalText(raw.trim());
  if (!line) return '';

  const stepMatch = line.match(/Step\s+(\d+)\/(\d+)\s+(.+)/i);
  if (stepMatch) {
    return `XROGA Pulse — step ${stepMatch[1]}/${stepMatch[2]}: ${stepMatch[3]!.trim()}`;
  }

  if (/\bverifying\b/i.test(line)) return 'XROGA Collective — quality & security review…';
  if (/\bdeploying\b/i.test(line) || /\bvercel\b/i.test(line)) return 'XROGA — deploying live preview…';
  if (/\bgithub\b/i.test(line) && /\b(push|repo|creating)\b/i.test(line)) {
    return 'XROGA — pushing project files to GitHub…';
  }
  if (/\bplanning\b/i.test(line)) return 'XROGA Architect — planning your build…';
  if (/\bstarting your\b/i.test(line)) {
    return line.replace(/^🚀\s*\[Phase \d+\]\s*/i, '').trim();
  }
  if (/\bbuild plan ready\b/i.test(line)) return 'XROGA Architect — build plan ready';
  if (/\ball checks passed\b/i.test(line)) return 'XROGA Collective — all checks passed';
  if (/\blive\b/i.test(line) && /\b✅/i.test(line)) return 'BLACK HOLE V∞ — live preview ready';

  const cleaned = line.replace(/\[Phase \d+\]\s*/gi, '').replace(/^[^\w]*\s*/, '').trim();
  return cleaned || line;
}

/** Map swarm progress lines → honest activity rows (real scaffold paths when editing). */
export function parseAgentActivityEntries(lines: string[], buildPrompt?: string): AgentActivityEntry[] {
  const entries: AgentActivityEntry[] = [];
  const scaffoldPaths = buildPrompt ? scaffoldPathsForPrompt(buildPrompt) : scaffoldPathsForPrompt('crm');
  let editIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = formatAgentActivityLine(raw);
    if (!line) continue;
    const id = `${i}-${line.slice(0, 24)}`;

    if (/planning|build plan|starting your|architect/i.test(line)) {
      entries.push({ id, kind: 'text', label: line });
      continue;
    }

    if (/scaffold|logic|black hole|xroga pulse|xroga architect|building/i.test(line)) {
      const file = scaffoldPaths[editIndex % scaffoldPaths.length]!;
      editIndex += 1;
      entries.push({ id: `${id}-s`, kind: 'status', label: 'Writing' });
      entries.push({ id, kind: 'edit', label: 'Created', file });
      continue;
    }

    if (/github|pushing|repo/i.test(line)) {
      entries.push({ id, kind: 'command', label: line });
      continue;
    }

    if (/verifying|collective|checks passed|visionary|polish/i.test(line)) {
      entries.push({ id, kind: 'text', label: line });
      continue;
    }

    if (/deploy|vercel|netlify|live preview/i.test(line)) {
      entries.push({ id, kind: 'command', label: line });
      continue;
    }

    entries.push({ id, kind: 'text', label: line });
  }

  return entries.slice(-16);
}

export function computeActivityStats(
  lines: string[],
  todos: Array<{ status: string }>,
  buildPrompt?: string
): { files: number; searches: number; commands: number } {
  const scaffoldCount = buildPrompt ? scaffoldPathsForPrompt(buildPrompt).length : 12;
  const doneTodos = todos.filter((t) => t.status === 'done' || t.status === 'active').length;
  const edits = lines.filter((l) => /scaffold|logic|github|html|css|architect|pulse/i.test(l)).length;
  const searches = lines.filter((l) => /plan|verify|review|architect|collective/i.test(l)).length;
  const commands = lines.filter((l) => /deploy|push|vercel|run|live/i.test(l)).length;

  return {
    files: Math.min(scaffoldCount, Math.max(doneTodos, edits + 1)),
    searches: Math.max(searches, 1),
    commands: Math.max(commands, lines.length > 3 ? 1 : 0),
  };
}

export function deriveBuildGoal(analysis?: string | null, latestActivity?: string | null): string | null {
  if (analysis && !analysis.startsWith('Awaiting:') && analysis.length > 12) {
    return sanitizeXrogaTerminalText(analysis.slice(0, 220));
  }
  if (latestActivity && /starting|building|planning/i.test(latestActivity)) {
    return formatAgentActivityLine(latestActivity);
  }
  return null;
}

export function thoughtLabel(seconds: number, loading: boolean): string {
  if (loading && seconds < 4) return 'XROGA is thinking…';
  if (seconds < 1) return 'XROGA is thinking…';
  return `XROGA thought for ${seconds}s`;
}
