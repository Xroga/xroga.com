import { groqChat } from '../lib/groq.js';
import { deepSeekChat } from '../lib/deepseek.js';
import { loadMasterPrompt } from './masterPrompt.js';
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

const DEFAULT_DAG = (prompt: string): ArchitectPlan => ({
  analysis: `You want help with: "${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}". I'll break this into clear steps.`,
  thinking: 'Starting with understanding your goal, then building the deliverable, then verifying quality.',
  dag: [
    { id: '1', description: 'Analyze intent and constraints', agent: 'architect', dependsOn: [], estimatedSeconds: 5 },
    { id: '2', description: 'Generate primary deliverable', agent: 'builder', dependsOn: ['1'], estimatedSeconds: 20 },
    { id: '3', description: 'Review, verify, and polish output', agent: 'reviewer', dependsOn: ['2'], estimatedSeconds: 10 },
  ],
  estimatedDurationSeconds: 35,
});

function parsePlanJson(raw: string, prompt: string): ArchitectPlan | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<ArchitectPlan>;
    if (!parsed.analysis || !Array.isArray(parsed.dag) || parsed.dag.length < 3) return null;
    return {
      analysis: parsed.analysis,
      thinking: parsed.thinking ?? 'Structured plan for reliable execution.',
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
  const master = await loadMasterPrompt();
  const system = `${master}

You are the XROGA Architect. ALWAYS output a detailed plan as JSON with minimum 3 DAG steps.
Required JSON shape:
{
  "analysis": "2-3 sentence interpretation of user intent",
  "thinking": "short reasoning behind the plan",
  "dag": [{"id":"1","description":"...","agent":"architect|builder|reviewer|qa|debugger|automation","dependsOn":[],"estimatedSeconds":10}],
  "estimatedDurationSeconds": 60,
  "featureId": "optional-feature-id"
}
Never truncate. Be specific to the user's request.`;

  opts?.onProgress?.({
    runId: crypto.randomUUID(),
    agent: 'architect',
    status: 'planning',
    message: 'Analyzing your request…',
    timestamp: new Date().toISOString(),
  });

  opts?.onProgress?.({
    runId: crypto.randomUUID(),
    agent: 'architect',
    status: 'planning',
    message: 'Breaking down into subtasks…',
    timestamp: new Date().toISOString(),
  });

  if (process.env.GROQ_API_KEY) {
    try {
      const raw = await groqChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: `Feature hint: ${opts?.featureId ?? 'auto'}\n\nRequest: ${prompt}` },
        ],
        { maxTokens: 1024 }
      );
      const plan = parsePlanJson(raw, prompt);
      if (plan) {
        opts?.onProgress?.({
          runId: crypto.randomUUID(),
          agent: 'architect',
          status: 'complete',
          message: 'Planning subtasks complete',
          timestamp: new Date().toISOString(),
        });
        return plan;
      }
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
  if (plan.estimatedDurationSeconds > 120) return true;
  const longPatterns = /\b(video|episode|45\s*min|3d|full\s*stack|deploy|research\s*report|movie)\b/i;
  return longPatterns.test(prompt) && plan.estimatedDurationSeconds > 60;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.ceil(seconds / 3600)}h`;
}
