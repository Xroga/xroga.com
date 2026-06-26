/** Master action cost reference — synced with backend ACTION_COSTS */

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
  { id: 'video_short', category: 'Core AI', task: 'AI Video (5s clip)', example: '5-second promo clip', cost: 50 },
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
];

export const MEDIA_ACTION_COSTS: ActionCostItem[] = [
  { id: 'logline', category: 'Media', task: 'Script Outline', example: '5-beat sci-fi outline', cost: 2 },
  { id: 'character', category: 'Media', task: 'Character Profile', example: 'Lead protagonist backstory', cost: 4 },
  { id: 'scene_short', category: 'Media', task: 'Scene Script (2-3 pp)', example: 'Noir confrontation scene', cost: 5 },
  { id: 'episode', category: 'Media', task: 'Full Episode (45 min)', example: 'Complete TV teleplay', cost: 30 },
  { id: 'movie_script', category: 'Media', task: 'Full Movie Script', example: '90-120 min screenplay', cost: 50 },
  { id: 'coverage', category: 'Media', task: 'Script Analysis', example: '110-page coverage report', cost: 15 },
  { id: 'video_1min', category: 'Media', task: 'AI Video 1-min Scene', example: 'Cinematic rendered scene', cost: 110 },
  { id: 'video_30min', category: 'Media', task: 'AI Video 30-min Episode', example: 'Full drama episode', cost: 400 },
  { id: 'video_movie', category: 'Media', task: 'Full Movie (90 min)', example: 'Feature film generation', cost: 1200 },
];

export const ALL_ACTION_COSTS = [...CORE_ACTION_COSTS, ...AGENT_WORKFLOW_COSTS, ...MEDIA_ACTION_COSTS];

/** Estimate cost from user prompt (mirrors backend classifyTaskType) */
export function estimateActionCost(prompt: string): { cost: number; label: string; breakdown?: string[] } {
  const p = prompt.toLowerCase();

  if (/\b(full movie|90.?min|feature film|120.?min)\b/.test(p)) {
    return { cost: 1200, label: 'Full Movie AI Generation', breakdown: ['Script + render pipeline'] };
  }
  if (/\b(30.?min|episode|drama series)\b/.test(p)) {
    return { cost: 400, label: 'AI Video 30-min Episode' };
  }
  if (/\b(1.?min|one minute|cinematic scene)\b/.test(p)) {
    return { cost: 110, label: 'AI Video 1-min Scene' };
  }
  if (/\b(screenplay|movie script|full script)\b/.test(p)) {
    return { cost: 50, label: 'Full Movie Script' };
  }
  if (/\b(research|200 source|deep research|cited report)\b/.test(p)) {
    return { cost: 100, label: 'Deep Research' };
  }
  if (/\b(video|promo clip|trailer)\b/.test(p)) {
    return { cost: 50, label: 'AI Video Generation' };
  }
  if (/\b(social|twitter|linkedin|instagram|post to)\b/.test(p)) {
    return { cost: 20, label: 'Social Media Posting' };
  }
  if (/\b(voice|tts|clone|narrat|audio)\b/.test(p)) {
    return { cost: 15, label: 'Voice / Audio' };
  }
  if (/\b(3d model|3d character|avatar)\b/.test(p)) {
    return { cost: 15, label: '3D Model Generation' };
  }
  if (/\b(scrape|crawl|automat|browser)\b/.test(p)) {
    return { cost: 5, label: 'Browser Automation' };
  }
  if (/\b(image|logo|generate.*picture|flux)\b/.test(p)) {
    return { cost: 4, label: 'Image Generation' };
  }
  if (/\b(full.?stack|react app|build.*app|website|mobile app|code)\b/.test(p)) {
    return {
      cost: 120,
      label: 'Full App Build (Swarm)',
      breakdown: ['Architect 5', 'Builder 50', 'Reviewer 10', 'QA 15', 'Builder fix 20', 'Debug 10', 'Chat 10'],
    };
  }
  if (/\b(debug|fix.*code|refactor)\b/.test(p)) {
    return { cost: 5, label: 'Code Fix / Debug' };
  }

  return { cost: 1, label: 'Chat / Text AI' };
}
