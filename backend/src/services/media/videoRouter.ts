import { callWithLlmFallback } from '../../lib/llmFallback.js';
import { MOVIE_SCRIPTWRITER_PROMPT } from '../../orchestrator/moviePrompts.js';
import { parseVideoDuration, parseVideoFormat, stripVideoFormatTag, videoAspectSuffix } from './videoUtils.js';

/** Prefer free/cheap LLMs for planning & scripting */
const FREE_LLM_CHAIN = ['groq', 'deepseek', 'gemini', 'ollama', 'openai', 'anthropic'] as const;

export type VideoRouteMode = 'single_scene' | 'multi_scene';

export interface VideoScenePlan {
  sceneId: string;
  location: string;
  action: string;
  dialogue: string;
  renderPrompt: string;
  durationSeconds: number;
  priority: 'critical' | 'low' | string;
}

export interface VideoProductionPlan {
  mode: VideoRouteMode;
  title: string;
  mood: string;
  durationSeconds: number;
  renderPrompt: string;
  scenes: VideoScenePlan[];
  scriptProvider?: string;
  characters: Array<{ name: string; description: string }>;
}

function extractVideoPrompt(userPrompt: string): string {
  const patterns = [
    /generate\s+(?:an?\s+)?(?:\d+\s*(?:second|sec|s)\s+)?(?:video|clip)\s+(?:of\s+)?(.+)/i,
    /create\s+(?:an?\s+)?video\s+of\s+(.+)/i,
    /make\s+(?:an?\s+)?video\s+(?:of\s+)?(.+)/i,
    /film\s+(.+)/i,
    /video:\s*(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = userPrompt.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return userPrompt.replace(/\b(generate|create|make|produce|video)\b/gi, '').trim();
}

function computeSceneCount(durationSeconds: number): number {
  if (durationSeconds <= 8) return 1;
  if (durationSeconds <= 15) return 3;
  if (durationSeconds <= 30) return 5;
  return Math.min(8, Math.ceil(durationSeconds / 5));
}

function isMultiSceneRequest(prompt: string, durationSeconds: number): boolean {
  return (
    (/\b(full movie|feature film|multi.?scene|episode\s+\d|series|trailer)\b/i.test(prompt) &&
      durationSeconds > 15) ||
    durationSeconds > 20
  );
}

function buildRenderPrompt(parts: {
  title: string;
  location: string;
  action: string;
  dialogue: string;
  mood: string;
  aspectSuffix: string;
}): string {
  return [
    parts.title,
    parts.location,
    parts.action,
    parts.dialogue ? `Mood dialogue: ${parts.dialogue.slice(0, 100)}` : '',
    `Cinematic ${parts.mood}, realistic physics, smooth motion, ${parts.aspectSuffix}`,
  ]
    .filter(Boolean)
    .join('. ');
}

function heuristicPlan(userPrompt: string, durationSeconds: number): VideoProductionPlan {
  const subject = extractVideoPrompt(stripVideoFormatTag(userPrompt));
  const format = parseVideoFormat(userPrompt);
  const aspectSuffix = videoAspectSuffix(format);
  const sceneCount = computeSceneCount(durationSeconds);
  const sceneDur = Math.max(3, Math.floor(durationSeconds / sceneCount));
  const mode: VideoRouteMode = sceneCount > 1 ? 'multi_scene' : 'single_scene';

  const scenes: VideoScenePlan[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const action =
      i === 0
        ? `${subject} — opening shot`
        : i === sceneCount - 1
          ? `${subject} — finale`
          : `${subject} — scene ${i + 1}`;
    scenes.push({
      sceneId: String(i + 1),
      location: i === 0 ? 'EXT. OPENING' : 'INT. SCENE',
      action,
      dialogue: i === 0 ? subject.slice(0, 120) : '',
      renderPrompt: buildRenderPrompt({
        title: subject.slice(0, 60),
        location: 'Cinematic',
        action,
        dialogue: '',
        mood: 'cinematic',
        aspectSuffix,
      }),
      durationSeconds: sceneDur,
      priority: i === 0 || i === sceneCount - 1 ? 'critical' : 'low',
    });
  }

  return {
    mode,
    title: subject.slice(0, 80) || 'Xroga Video',
    mood: 'cinematic',
    durationSeconds,
    renderPrompt: scenes[0]!.renderPrompt,
    scenes,
    scriptProvider: 'heuristic',
    characters: [{ name: 'Protagonist', description: subject.slice(0, 200) }],
  };
}

function parseLlmScreenplay(
  raw: string,
  userPrompt: string,
  durationSeconds: number
): VideoProductionPlan | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      mood?: string;
      characters?: Array<{ name: string; description?: string }>;
      scenes?: Array<{
        scene_id?: string;
        location?: string;
        action?: string;
        dialogue?: string;
        durationSeconds?: number;
        priority?: string;
        characters?: string[];
      }>;
    };

    if (!parsed.scenes?.length) return null;

    const title = parsed.title ?? extractVideoPrompt(userPrompt).slice(0, 80);
    const mood = parsed.mood ?? 'cinematic';
    const characters = (parsed.characters ?? []).map((c) => ({
      name: c.name,
      description: c.description ?? c.name,
    }));

    const scenes: VideoScenePlan[] = parsed.scenes.map((s, i) => {
      const action = s.action ?? s.location ?? userPrompt;
      const dialogue = s.dialogue ?? '';
      return {
        sceneId: s.scene_id ?? String(i + 1),
        location: s.location ?? 'INT. SCENE',
        action,
        dialogue,
        renderPrompt: buildRenderPrompt({
          title,
          location: s.location ?? '',
          action,
          dialogue,
          mood,
          aspectSuffix: videoAspectSuffix(parseVideoFormat(userPrompt)),
        }),
        durationSeconds: s.durationSeconds ?? Math.max(3, Math.floor(durationSeconds / parsed.scenes!.length)),
        priority: s.priority ?? (i === 0 ? 'critical' : 'low'),
      };
    });

    return {
      mode: scenes.length > 1 ? 'multi_scene' : 'single_scene',
      title,
      mood,
      durationSeconds,
      renderPrompt: scenes[0]!.renderPrompt,
      scenes,
      characters: characters.length ? characters : [{ name: 'Protagonist', description: title }],
    };
  } catch {
    return null;
  }
}

export type VideoProgressStep = 'planning' | 'scripting' | 'storyboard';

export async function planVideoProduction(
  userPrompt: string,
  options?: {
    userId?: string;
    runId?: string;
    onProgress?: (step: VideoProgressStep, message: string) => void;
  }
): Promise<VideoProductionPlan> {
  const durationSeconds = Math.min(Math.max(parseVideoDuration(userPrompt), 3), 60);
  const multi = isMultiSceneRequest(userPrompt, durationSeconds);

  options?.onProgress?.('planning', 'Analyzing your video request…');

  options?.onProgress?.('scripting', '📝 Writing screenplay…');

  const sceneHint = computeSceneCount(durationSeconds);
  const { text: scriptRaw, provider: scriptProvider } = await callWithLlmFallback(
    MOVIE_SCRIPTWRITER_PROMPT,
    `Write a ${multi ? 'multi-scene' : 'single-scene'} screenplay for: ${userPrompt}. Total duration ~${durationSeconds}s. Scene count: ${sceneHint}. Return valid JSON only.`,
    {
      chain: [...FREE_LLM_CHAIN],
      maxTokens: multi ? 4096 : 2048,
      userId: options?.userId,
      runId: options?.runId,
      apiType: 'video_script',
    }
  );

  const parsed = parseLlmScreenplay(scriptRaw, userPrompt, durationSeconds);
  const plan = parsed ?? heuristicPlan(userPrompt, durationSeconds);
  plan.scriptProvider = scriptProvider;
  plan.durationSeconds = durationSeconds;

  if (plan.mode === 'single_scene' && plan.scenes.length > 1) {
    plan.scenes = [plan.scenes[0]!];
    plan.mode = 'single_scene';
  }

  options?.onProgress?.('storyboard', '🎬 Storyboard ready…');

  return plan;
}
