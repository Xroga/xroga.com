/**
 * Relative complexity units for UI estimates.
 * Billing is tokens (Spark ~6.17M/mo) — these are not a separate “actions” meter.
 */

export interface ActionCostItem {
  id: string;
  category: string;
  task: string;
  example: string;
  cost: number;
}

export const CORE_ACTION_COSTS: ActionCostItem[] = [
  { id: 'chat', category: 'Core AI', task: 'Chat / Text AI', example: 'Summarize a PDF, write a tweet', cost: 1 },
  { id: 'code', category: 'Core AI', task: 'Code Generation', example: 'Build a React login page', cost: 3 },
  { id: 'image', category: 'Core AI', task: 'Image Generation', example: 'Generate a startup logo', cost: 4 },
  { id: 'scrape', category: 'Core AI', task: 'Browser Automation', example: 'Scrape 100 Amazon prices', cost: 5 },
  { id: 'voice', category: 'Core AI', task: 'Voice / Audio', example: 'Clone voice & narrate script', cost: 15 },
  { id: '3d_model', category: 'Core AI', task: '3D Model Generation', example: '3D game character', cost: 15 },
  { id: 'social', category: 'Core AI', task: 'Social Media Posting', example: 'Post to X, LinkedIn, Instagram', cost: 20 },
  { id: 'video_short', category: 'Core AI', task: 'AI Video Generation', example: '5-second promo clip', cost: 50 },
  { id: 'research', category: 'Core AI', task: 'Deep Research', example: '200-source cited report', cost: 100 },
];

export const AGENT_WORKFLOW_COSTS: ActionCostItem[] = [
  { id: 'architect', category: 'Agent', task: 'Architect', example: 'Plans folder structure & schema', cost: 5 },
  { id: 'builder', category: 'Agent', task: 'Builder', example: 'Writes frontend + backend', cost: 50 },
  { id: 'reviewer', category: 'Agent', task: 'Reviewer', example: 'Finds bugs & security issues', cost: 10 },
  { id: 'builder_fix', category: 'Agent', task: 'Builder (Round 2)', example: 'Fixes reviewer issues', cost: 20 },
  { id: 'qa', category: 'Agent', task: 'QA Tester', example: 'Headless browser simulation', cost: 15 },
  { id: 'builder_final', category: 'Agent', task: 'Builder (Final)', example: 'Fixes UI bugs', cost: 10 },
  { id: 'debugger', category: 'Agent', task: 'Debugger', example: 'Compile & run check', cost: 10 },
  { id: 'automation_runtime', category: 'Agent', task: 'Automation Runtime', example: '10 actions per 10 min per browser tab', cost: 10 },
];

export const MEDIA_ACTION_COSTS: ActionCostItem[] = [
  { id: 'logline', category: 'Media', task: 'Script Outline / Logline', example: '5-beat sci-fi outline', cost: 2 },
  { id: 'character', category: 'Media', task: 'Character Profile', example: 'Lead protagonist backstory', cost: 4 },
  { id: 'scene_short', category: 'Media', task: 'Scene Script (2-3 pp)', example: 'Noir confrontation scene', cost: 5 },
  { id: 'episode', category: 'Media', task: 'Full Episode (45 min)', example: 'Complete TV teleplay', cost: 30 },
  { id: 'movie_script', category: 'Media', task: 'Full Movie Script', example: '90-120 min screenplay', cost: 50 },
  { id: 'coverage', category: 'Media', task: 'Script Analysis & Coverage', example: '110-page coverage report', cost: 15 },
  { id: 'dialogue_polish', category: 'Media', task: 'Dialogue Polish / Localization', example: 'British teen drama rewrite', cost: 6 },
  { id: 'transcription', category: 'Media', task: 'Transcription (1-hour)', example: '45-min episode dialogue', cost: 20 },
  { id: 'season_summary', category: 'Media', task: 'Episode Summarization', example: '10-episode season recap', cost: 30 },
  { id: 'continuity', category: 'Media', task: 'Continuity & Canon Check', example: '8-episode timeline audit', cost: 50 },
  { id: 'storyboard', category: 'Media', task: 'Storyboard (5 key frames)', example: 'Climactic action sequence', cost: 25 },
  { id: 'video_1min', category: 'Media', task: 'AI Video 1-min Scene', example: 'Cinematic rendered scene', cost: 110 },
  { id: 'video_30min', category: 'Media', task: 'AI Video 30-min Episode', example: 'Full drama episode', cost: 400 },
  { id: 'video_movie', category: 'Media', task: 'Full Movie (90 min)', example: 'Feature film generation', cost: 1200 },
  { id: 'dubbing', category: 'Media', task: 'Voice Dubbing (Full Episode)', example: 'Clone 3 voices, dub to Spanish', cost: 100 },
  { id: 'soundtrack', category: 'Media', task: 'Soundtrack / Score Generation', example: '30-min orchestral score', cost: 60 },
];

export const ALL_ACTION_COSTS = [...CORE_ACTION_COSTS, ...AGENT_WORKFLOW_COSTS, ...MEDIA_ACTION_COSTS];

const ESTIMATE_RULES: { pattern: RegExp; id: string }[] = [
  { pattern: /\b(full movie|90.?min|feature film|120.?min)\b/, id: 'video_movie' },
  { pattern: /\b(30.?min episode|animated episode|drama episode)\b/, id: 'video_30min' },
  { pattern: /\b(1.?min scene|one minute|cinematic scene)\b/, id: 'video_1min' },
  { pattern: /\b(storyboard|key frames)\b/, id: 'storyboard' },
  { pattern: /\b(continuity|canon check|timeline)\b/, id: 'continuity' },
  { pattern: /\b(season summary|binge.?mode|episode recap)\b/, id: 'season_summary' },
  { pattern: /\b(transcri|subtitle)\b/, id: 'transcription' },
  { pattern: /\b(dialogue polish|localization)\b/, id: 'dialogue_polish' },
  { pattern: /\b(coverage|script analysis)\b/, id: 'coverage' },
  { pattern: /\b(screenplay|movie script|full script|teleplay)\b/, id: 'movie_script' },
  { pattern: /\b(full episode|45.?min)\b/, id: 'episode' },
  { pattern: /\b(scene script|confrontation scene)\b/, id: 'scene_short' },
  { pattern: /\b(character profile|backstory|protagonist)\b/, id: 'character' },
  { pattern: /\b(logline|outline|5.?beat)\b/, id: 'logline' },
  { pattern: /\b(soundtrack|orchestral score)\b/, id: 'soundtrack' },
  { pattern: /\b(dubbing|voice dub)\b/, id: 'dubbing' },
  { pattern: /\b(research|200 source|deep research|cited report)\b/, id: 'research' },
  { pattern: /\b(5.?second|promo clip|trailer|ai video)\b/, id: 'video_short' },
  { pattern: /\b(social|twitter|linkedin|instagram|post to)\b/, id: 'social' },
  { pattern: /\b(voice|tts|clone|narrat|audio)\b/, id: 'voice' },
  { pattern: /\b(3d model|3d character|avatar)\b/, id: '3d_model' },
  { pattern: /\b(scrape|crawl|automat|browser)\b/, id: 'scrape' },
  { pattern: /\b(image|logo|generate.*picture|flux)\b/, id: 'image' },
  { pattern: /\b(full.?stack|react app|build.*app|website|mobile app)\b/, id: 'builder' },
  { pattern: /\b(debug|fix.*code|refactor)\b/, id: 'code' },
];

function findCostItem(id: string): ActionCostItem | undefined {
  return ALL_ACTION_COSTS.find((c) => c.id === id);
}

/** Estimate cost from user prompt (mirrors backend classifyTaskType) */
export function estimateActionCost(prompt: string): { cost: number; label: string; breakdown?: string[] } {
  const p = prompt.toLowerCase();

  for (const { pattern, id } of ESTIMATE_RULES) {
    if (pattern.test(p)) {
      const item = findCostItem(id);
      if (item) {
        if (id === 'builder') {
          return {
            cost: 120,
            label: 'Full App Build (Swarm)',
            breakdown: ['Architect 5', 'Builder 50', 'Reviewer 10', 'QA 15', 'Builder fix 20', 'Debug 10', 'Chat 10'],
          };
        }
        return { cost: item.cost, label: item.task };
      }
    }
  }

  const chat = findCostItem('chat')!;
  return { cost: chat.cost, label: chat.task };
}

/** All tasks for a budget — affordable first (cheapest→expensive), then unaffordable with honest labels */
export function tasksForActionBudget(actions: number): ActionCostItem[] {
  const affordable = ALL_ACTION_COSTS.filter((item) => item.cost <= actions).sort(
    (a, b) => a.cost - b.cost
  );
  const unaffordable = ALL_ACTION_COSTS.filter((item) => item.cost > actions).sort(
    (a, b) => a.cost - b.cost
  );
  return [...affordable, ...unaffordable];
}

export function budgetTaskLine(item: ActionCostItem, actions: number): string {
  if (actions <= 0) return `needs ${item.cost} actions`;
  const count = Math.floor(actions / item.cost);
  if (count > 0) return `${count}× (${item.cost} each)`;
  return `needs ${item.cost} — you have ${actions}`;
}

/** How many times a task fits in a budget */
export function taskCountForBudget(taskId: string, actions: number): number {
  const item = findCostItem(taskId);
  if (!item || item.cost <= 0) return 0;
  return Math.floor(actions / item.cost);
}
