/**
 * Build memory — recalls past website builds from swarm_runs for beginner-friendly suggestions.
 */

import { getSupabaseAdmin } from '../../config/supabase.js';

export interface PastBuild {
  projectName: string;
  summary: string;
  designTheme?: string;
  deployUrl?: string;
  createdAt: string;
}

function extractProjectName(prompt: string, output?: Record<string, unknown>): string {
  const fromOutput = output?.projectName;
  if (typeof fromOutput === 'string' && fromOutput.trim()) return fromOutput.trim();

  const briefMatch = prompt.match(/Project name[:\s]+([^\n,]+)/i);
  if (briefMatch?.[1]) return briefMatch[1].trim();

  const coffeeMatch = prompt.match(/\b(build|create|make)\s+(?:a\s+)?(.+?)\s+(website|site|shop|store)/i);
  if (coffeeMatch?.[2]) return coffeeMatch[2].trim();

  const nameFromAnswer = prompt.match(/\[Current message\]\n([^,\n]+)/)?.[1]?.trim();
  if (nameFromAnswer && nameFromAnswer.length >= 3 && nameFromAnswer.length < 60) {
    return nameFromAnswer;
  }

  return 'your last project';
}

function extractTheme(prompt: string, output?: Record<string, unknown>): string | undefined {
  const fromOutput = output?.designTheme;
  if (typeof fromOutput === 'string') return fromOutput;
  const colorMatch = prompt.match(/\b(warm\s+\w+\s*&\s*\w+|dark|light|minimalist|colorful)[^,\n]*/i);
  return colorMatch?.[0]?.trim();
}

/** Query recent completed landing-page builds for this user. */
export async function getPreviousBuilds(userId: string, limit = 5): Promise<PastBuild[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('swarm_runs')
      .select('prompt, output, created_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit * 3);

    if (error || !data?.length) return [];

    const builds: PastBuild[] = [];
    for (const row of data) {
      const output = row.output as Record<string, unknown> | null;
      const featureOutput =
        (output?.featureOutput as Record<string, unknown> | undefined) ??
        ((output?.output as Record<string, unknown> | undefined)?.featureOutput as
          | Record<string, unknown>
          | undefined);

      const isLanding =
        featureOutput?.type === 'landing_page' ||
        /\b(website|landing|coffee|shop|site)\b/i.test(String(row.prompt ?? ''));

      if (!isLanding && builds.length === 0) continue;

      const prompt = String(row.prompt ?? '');
      const projectName = extractProjectName(prompt, featureOutput);
      const designTheme = extractTheme(prompt, featureOutput);
      const deployUrl =
        typeof featureOutput?.deployUrl === 'string' ? featureOutput.deployUrl : undefined;

      builds.push({
        projectName,
        summary: typeof featureOutput?.summary === 'string' ? featureOutput.summary : projectName,
        designTheme,
        deployUrl,
        createdAt: String(row.created_at ?? new Date().toISOString()),
      });

      if (builds.length >= limit) break;
    }

    return builds;
  } catch {
    return [];
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return 'recently';
}

/** Friendly memory line shown before Phase 1 questions. */
export function formatMemorySuggestion(builds: PastBuild[]): string | undefined {
  if (!builds.length) return undefined;
  const latest = builds[0]!;
  const when = relativeTime(latest.createdAt);
  const theme = latest.designTheme ? ` (${latest.designTheme})` : '';
  return `Old chats remembered: You built "${latest.projectName}"${theme} ${when}. Want me to use the same theme for this project?`;
}
