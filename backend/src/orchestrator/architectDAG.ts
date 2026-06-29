import { groqChat } from '../lib/groq.js';
import { deepSeekChat } from '../lib/deepseek.js';
import { loadMasterPrompt } from './masterPrompt.js';
import { buildFullSystemPrompt } from './aiTraining.js';
import { isTrivialPrompt, isSimpleChat } from '../lib/promptClassifier.js';
import type { SwarmProgressEvent } from '../types/features.js';

export interface DagSubtask {
  id: string;
  description: string;
  agent: string;
  dependsOn: string[];
  estimatedSeconds: number;
}

export interface ArchitectPlan {
  analysis: string;
  thinking: string;
  dag: DagSubtask[];
  estimatedDurationSeconds: number;
  featureId?: string;
}

const INSTANT_PLAN: ArchitectPlan = {
  analysis: '',
  thinking: '',
  dag: [],
  estimatedDurationSeconds: 3,
};

const DEFAULT_DAG = (prompt: string): ArchitectPlan => ({
  analysis: '',
  thinking: 'Plan → build → verify.',
  dag: [
    { id: '1', description: 'Understand requirements', agent: 'architect', dependsOn: [], estimatedSeconds: 5 },
    { id: '2', description: 'Produce deliverable', agent: 'builder', dependsOn: ['1'], estimatedSeconds: 25 },
    { id: '3', description: 'Review and polish', agent: 'reviewer', dependsOn: ['2'], estimatedSeconds: 10 },
  ],
  estimatedDurationSeconds: 40,
});

function parsePlanJson(raw: string, prompt: string): ArchitectPlan | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<ArchitectPlan>;
    if (!Array.isArray(parsed.dag) || parsed.dag.length < 3) return null;
    return {
      analysis: parsed.analysis ?? '',
      thinking: parsed.thinking ?? '',
      dag: parsed.dag.map((d, i) => ({
        id: d.id ?? String(i + 1),
        description: d.description ?? 'Subtask',
        agent: d.agent ?? 'builder',
        dependsOn: d.dependsOn ?? [],
        estimatedSeconds: d.estimatedSeconds ?? 10,
      })),
      estimatedDurationSeconds:
        parsed.estimatedDurationSeconds ??
        parsed.dag.reduce((s, d) => s + (d.estimatedSeconds ?? 10), 0),
      featureId: parsed.featureId,
    };
  } catch {
    return DEFAULT_DAG(prompt);
  }
}

export async function buildArchitectDAG(
  prompt: string,
  opts?: {
    featureId?: string;
    onProgress?: (event: SwarmProgressEvent) => void;
  }
): Promise<ArchitectPlan> {
  // Skip heavy planning for greetings and simple chat
  if (isTrivialPrompt(prompt) || isSimpleChat(prompt)) {
    return INSTANT_PLAN;
  }

  const master = await loadMasterPrompt();
  const training = buildFullSystemPrompt(opts?.featureId ?? 'chat', prompt);
  const system = `${master}\n\n${training}

You are the XROGA Architect (internal only — analysis never shown to user). Output JSON:
{"analysis":"internal notes","thinking":"brief internal reasoning","dag":[{"id":"1","description":"...","agent":"builder","dependsOn":[],"estimatedSeconds":10}],"estimatedDurationSeconds":60}
Minimum 3 DAG steps. Be specific to the request.`;

  if (process.env.GROQ_API_KEY) {
    try {
      const raw = await groqChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: `Feature: ${opts?.featureId ?? 'auto'}\n\n${prompt}` },
        ],
        { maxTokens: 1024 }
      );
      const plan = parsePlanJson(raw, prompt);
      if (plan) return plan;
    } catch {
      /* fallback */
    }
  }

  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const raw = await deepSeekChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        { model: 'deepseek-chat', maxTokens: 1024 }
      );
      const plan = parsePlanJson(raw, prompt);
      if (plan) return plan;
    } catch {
      /* fallback */
    }
  }

  return DEFAULT_DAG(prompt);
}

export function isLongRunningTask(plan: ArchitectPlan, prompt: string): boolean {
  if (isTrivialPrompt(prompt) || isSimpleChat(prompt)) return false;
  if (plan.estimatedDurationSeconds > 120) return true;
  const longPatterns = /\b(video|episode|45\s*min|3d|full\s*stack|deploy|research\s*report|movie)\b/i;
  return longPatterns.test(prompt) && plan.estimatedDurationSeconds > 60;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.ceil(seconds / 3600)}h`;
}
