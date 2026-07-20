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
  { id: 'website', category: 'Core AI', task: 'Website / landing build', example: 'Ship a marketing site', cost: 8 },
  { id: 'saas', category: 'Core AI', task: 'SaaS / dashboard build', example: 'Auth + API + deploy', cost: 20 },
  { id: 'mobile', category: 'Core AI', task: 'Expo mobile scaffold', example: 'Android/iOS Expo app', cost: 18 },
  { id: 'extension', category: 'Core AI', task: 'Chrome extension (MV3)', example: 'Popup + service worker', cost: 12 },
  { id: 'desktop', category: 'Core AI', task: 'Electron desktop scaffold', example: 'Desktop app + Releases', cost: 15 },
  { id: 'research', category: 'Core AI', task: 'Deep Research', example: 'Cited web + X report', cost: 100 },
  { id: 'script', category: 'Core AI', task: 'Creative script (text)', example: 'Outline or screenplay draft', cost: 5 },
];

export const AGENT_WORKFLOW_COSTS: ActionCostItem[] = [
  { id: 'architect', category: 'Agent', task: 'Architect / Converter', example: 'Plans folder structure & schema', cost: 5 },
  { id: 'builder', category: 'Agent', task: 'Builder', example: 'Writes frontend + backend', cost: 50 },
  { id: 'reviewer', category: 'Agent', task: 'Reviewer', example: 'Finds bugs & security issues', cost: 10 },
  { id: 'builder_fix', category: 'Agent', task: 'Builder (Round 2)', example: 'Fixes reviewer issues', cost: 20 },
  { id: 'qa', category: 'Agent', task: 'QA Tester', example: 'Checks + compile gate', cost: 15 },
  { id: 'builder_final', category: 'Agent', task: 'Builder (Final)', example: 'Fixes UI bugs', cost: 10 },
  { id: 'debugger', category: 'Agent', task: 'Debugger', example: 'Compile & run check', cost: 10 },
  { id: 'ship', category: 'Agent', task: 'Ship (GitHub → Vercel)', example: 'Push sticky repo + deploy', cost: 8 },
];

/** Creative writing only — not image/video generation studios */
export const MEDIA_ACTION_COSTS: ActionCostItem[] = [
  { id: 'logline', category: 'Creative', task: 'Script Outline / Logline', example: '5-beat sci-fi outline', cost: 2 },
  { id: 'character', category: 'Creative', task: 'Character Profile', example: 'Lead protagonist backstory', cost: 4 },
  { id: 'scene_short', category: 'Creative', task: 'Scene Script (2-3 pp)', example: 'Noir confrontation scene', cost: 5 },
  { id: 'episode', category: 'Creative', task: 'Full Episode draft (text)', example: 'Complete TV teleplay', cost: 30 },
  { id: 'movie_script', category: 'Creative', task: 'Full Movie Script (text)', example: '90-120 min screenplay', cost: 50 },
  { id: 'coverage', category: 'Creative', task: 'Script Analysis & Coverage', example: '110-page coverage report', cost: 15 },
];

export const ALL_ACTION_COSTS = [...CORE_ACTION_COSTS, ...AGENT_WORKFLOW_COSTS, ...MEDIA_ACTION_COSTS];

const ESTIMATE_RULES: { pattern: RegExp; id: string }[] = [
  { pattern: /\b(screenplay|movie script|full script|teleplay)\b/, id: 'movie_script' },
  { pattern: /\b(full episode|45.?min)\b/, id: 'episode' },
  { pattern: /\b(scene script|confrontation scene)\b/, id: 'scene_short' },
  { pattern: /\b(character profile|backstory|protagonist)\b/, id: 'character' },
  { pattern: /\b(logline|outline|5.?beat)\b/, id: 'logline' },
  { pattern: /\b(coverage|script analysis)\b/, id: 'coverage' },
  { pattern: /\b(research|200 source|deep research|cited report)\b/, id: 'research' },
  { pattern: /\b(chrome\s*extension|mv3|browser\s*extension)\b/, id: 'extension' },
  { pattern: /\b(electron|desktop\s*app|tauri)\b/, id: 'desktop' },
  { pattern: /\b(expo|android|ios|react\s*native|mobile\s*app)\b/, id: 'mobile' },
  { pattern: /\b(saas|dashboard|auth|stripe|supabase)\b/, id: 'saas' },
  { pattern: /\b(full.?stack|react app|build.*app|website|landing|portfolio|web\s*app)\b/, id: 'builder' },
  { pattern: /\b(github|vercel|deploy|ship)\b/, id: 'ship' },
  { pattern: /\b(debug|fix.*code|refactor|typescript|python|react|next)\b/, id: 'code' },
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
