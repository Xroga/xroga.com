/** Structured XROGA-branded agent activity entries */

import { sanitizeXrogaTerminalText } from '@/lib/xrogaBrand';

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

/** Map swarm progress lines → honest activity rows (never invent file paths). */
export function parseAgentActivityEntries(lines: string[], buildPrompt?: string): AgentActivityEntry[] {
  const entries: AgentActivityEntry[] = [];
  void buildPrompt;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = formatAgentActivityLine(raw);
    if (!line) continue;
    const id = `${i}-${line.slice(0, 24)}`;

    if (/planning|build plan|starting your|architect/i.test(line)) {
      entries.push({ id, kind: 'text', label: line });
      continue;
    }

    // Only claim file writes when a real filename is present — never invent scaffold paths.
    if (/\b(created|wrote|writing|saved)\b/i.test(line) && /\.(html|css|js|tsx?|json|md)\b/i.test(line)) {
      const fileMatch = line.match(/[\w./-]+\.(html|css|js|tsx?|json|md)\b/i);
      if (!fileMatch?.[0]) {
        entries.push({ id, kind: 'text', label: line });
        continue;
      }
      entries.push({ id: `${id}-s`, kind: 'status', label: 'Writing' });
      entries.push({ id, kind: 'edit', label: 'Created', file: fileMatch[0] });
      continue;
    }

    if (/waiting on ai model|shipping best result|scaffold|logic|black hole|xroga pulse|xroga architect|building/i.test(line)) {
      entries.push({ id, kind: 'text', label: line });
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
  todos?: Array<{ status: string }>,
  buildPrompt?: string
): { files: number; searches: number; commands: number } {
  void todos;
  void buildPrompt;
  // Count only lines that name a real file — keyword "writing" alone is not a file update
  const edits = lines.filter(
    (l) => /\b(created|wrote|writing|saved)\b/i.test(l) && /\.(html|css|js|tsx?|json|md)\b/i.test(l)
  ).length;
  const searches = 0;
  const commands = lines.filter((l) => /\b(deploy|push|vercel|github)\b/i.test(l)).length;

  return { files: edits, searches, commands };
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
