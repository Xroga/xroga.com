export const COMPANION_MOODS = ['professional', 'happy', 'sad', 'angry', 'curious'] as const;
export type CompanionMood = (typeof COMPANION_MOODS)[number];

export const COMPANION_OPERATIONS = [
  'idle',
  'greeting',
  'listening',
  'reading',
  'thinking',
  'planning',
  'inspecting_repository',
  'coding',
  'building',
  'testing',
  'repairing',
  'deploying',
  'connecting_integration',
  'waiting_for_approval',
  'success',
  'warning',
  'failure',
  'interrupted',
  'offline',
  'resting',
  'low_energy',
] as const;
export type CompanionOperation = (typeof COMPANION_OPERATIONS)[number];

/**
 * The four companion skins, all drawn from the costume artwork under /brand/costumes.
 *
 * Changing this list is a contract change: the backend's `companionPreferencesSchema`
 * enum and the persisted-store migration must move with it, or a saved preference
 * becomes unreadable.
 */
export const COMPANION_COSTUMES = [
  'techwear',
  'mystic-robe',
  'circuit',
  'ninja-neon',
] as const;
export type CompanionCostume = (typeof COMPANION_COSTUMES)[number];

/**
 * Skins that were removed but may still be sitting in a saved preference.
 *
 * `coder` was the original default, so it is the value stored for every account
 * that never opened the wardrobe — by far the most common one in the wild. Its
 * artwork is deleted, so anything that reaches the renderer still holding it
 * would request a file that no longer exists and draw a broken image.
 *
 * Retired names are kept here rather than simply dropped so both ends can
 * recognise them: `resolveCostume` turns them back into something wearable, and
 * the API accepts them from an older bundle instead of rejecting the whole save.
 */
export const RETIRED_COMPANION_COSTUMES = ['coder'] as const;

/**
 * The costume to actually wear, given whatever a store or a profile row holds.
 *
 * Every path into companion state runs through this: local storage, the server
 * profile, and the API. A value that is retired, misspelled, or absent lands on
 * the default rather than being trusted through to an `<img>` src.
 */
export function resolveCostume(value: unknown): CompanionCostume {
  return COMPANION_COSTUMES.includes(value as CompanionCostume)
    ? (value as CompanionCostume)
    : DEFAULT_COMPANION_PREFERENCES.costume;
}
export type CompanionAccent = 'blue' | 'violet' | 'cyan' | 'emerald';
export type CompanionSize = 'compact' | 'standard' | 'large';
export type CompanionDock = 'composer' | 'corner';
export type CompanionEventSource = 'deterministic' | 'runtime' | 'ai';

export interface CompanionPreferences {
  name: string;
  costume: CompanionCostume;
  accent: CompanionAccent;
  size: CompanionSize;
  dock: CompanionDock;
  visible: boolean;
  voiceEnabled: boolean;
  careEnabled: boolean;
  reducedGamification: boolean;
  mantleEnabled: boolean;
  lastFedAt: string | null;
}
export interface CompanionRuntimeEvent {
  type:
    | 'composer_focused'
    | 'voice_listening'
    | 'prompt_submitted'
    | 'runtime_progress'
    | 'assistant_response'
    | 'task_success'
    | 'task_warning'
    | 'task_failure'
    | 'task_interrupted'
    | 'integration_connecting'
    | 'waiting_for_approval'
    | 'online'
    | 'offline';
  operation?: CompanionOperation;
  message?: string;
  assistantText?: string;
  source?: CompanionEventSource;
  evidenceAt?: string;
}

export const DEFAULT_COMPANION_PREFERENCES: CompanionPreferences = {
  name: 'Smoky',
  costume: 'techwear',
  accent: 'blue',
  size: 'standard',
  dock: 'composer',
  visible: true,
  voiceEnabled: false,
  careEnabled: false,
  reducedGamification: true,
  mantleEnabled: true,
  lastFedAt: null,
};

export const OPERATION_LABELS: Record<CompanionOperation, string> = {
  idle: 'Ready when you are',
  greeting: 'Welcome to Xroga',
  listening: 'Listening for your direction',
  reading: 'Reading relevant context',
  thinking: 'Reasoning through the request',
  planning: 'Preparing executable steps',
  inspecting_repository: 'Inspecting the connected repository',
  coding: 'Applying focused code changes',
  building: 'Running the real build',
  testing: 'Validating the result',
  repairing: 'Repairing the diagnosed failure',
  deploying: 'Publishing through your connected provider',
  connecting_integration: 'Connecting an authorised integration',
  waiting_for_approval: 'Waiting for your approval',
  success: 'Verified work completed',
  warning: 'Action needs attention',
  failure: 'The operation failed',
  interrupted: 'The operation was stopped',
  offline: 'Network unavailable',
  resting: 'Resting between tasks',
  low_energy: 'A weekly recharge is available',
};

export function validateCompanionName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return DEFAULT_COMPANION_PREFERENCES.name;
  return trimmed.slice(0, 24);
}

export function operationFromProgress(agent?: string | null, message?: string | null): CompanionOperation {
  const value = `${agent ?? ''} ${message ?? ''}`.toLowerCase();
  if (/approval|authori[sz]ation/.test(value)) return 'waiting_for_approval';
  if (/deploy|publish|vercel|fly/.test(value)) return 'deploying';
  if (/repair|recover|fixing/.test(value)) return 'repairing';
  if (/test|validat|review|qa|compile|lint|typecheck/.test(value)) return 'testing';
  if (/build|implement|writ|patch|coding|builder/.test(value)) return 'coding';
  if (/repo|inspect|retriev|file|context/.test(value)) return 'inspecting_repository';
  if (/plan|architect|task graph/.test(value)) return 'planning';
  if (/read|research/.test(value)) return 'reading';
  return 'thinking';
}

export function moodForOperation(operation: CompanionOperation): CompanionMood {
  if (operation === 'success' || operation === 'greeting') return 'happy';
  if (operation === 'failure' || operation === 'offline') return 'sad';
  if (operation === 'warning' || operation === 'interrupted') return 'angry';
  if (operation === 'reading' || operation === 'thinking' || operation === 'planning') return 'curious';
  return 'professional';
}

export type CompanionEnergy = 'charged' | 'steady' | 'low';

export function companionEnergy(preferences: CompanionPreferences, now = Date.now()): CompanionEnergy {
  if (!preferences.careEnabled || preferences.reducedGamification) return 'steady';
  if (!preferences.lastFedAt) return 'low';
  const elapsed = now - new Date(preferences.lastFedAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'steady';
  if (elapsed > 7 * 24 * 60 * 60 * 1000) return 'low';
  if (elapsed > 4 * 24 * 60 * 60 * 1000) return 'steady';
  return 'charged';
}

export function safeCompanionSpeech(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' Code output is available in the workspace. ')
    .replace(/https?:\/\/\S+/g, ' a linked result ')
    .replace(/[`*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 520);
}

export function dispatchCompanionEvent(event: CompanionRuntimeEvent): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CompanionRuntimeEvent>('xroga:companion-event', { detail: event }));
}
