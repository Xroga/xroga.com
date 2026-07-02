/**
 * XROGA V∞ — Sealed API Role Manifesto (TypeScript DNA for the Router).
 */

export type XrogaIntent =
  | 'greeting'
  | 'quick_fact'
  | 'small_talk'
  | 'yes_no'
  | 'simple_math'
  | 'name_reminder'
  | 'time_query'
  | 'history'
  | 'cultural'
  | 'geopolitical'
  | 'multimodal_upload'
  | 'long_document'
  | 'image_analysis'
  | 'current_events'
  | 'coding'
  | 'stem'
  | 'complex_math'
  | 'build_website'
  | 'build_game'
  | 'build_app'
  | 'build_software'
  | 'automation'
  | 'debug'
  | '3d_model'
  | 'video_script'
  | 'decision'
  | 'philosophical_debate'
  | 'what_if_scenario'
  | 'general'
  | 'creation';

export type ApiRoleId = 'groq' | 'gemini' | 'deepseek' | 'swarm' | 'blackhole';

export interface ApiRoleDefinition {
  id: ApiRoleId;
  codename: string;
  primaryRole: string;
  intentsHandled: XrogaIntent[];
  maxOutputTokens: number;
  temperature: number;
  minimalPromptTemplate: string;
  fallbackModel: string;
  isOptional?: boolean;
}

export const API_ROLES: Record<ApiRoleId, ApiRoleDefinition> = {
  groq: {
    id: 'groq',
    codename: 'The Sprinter',
    primaryRole: 'Ultra-low latency. Greetings, quick facts, small talk, yes/no.',
    intentsHandled: [
      'greeting', 'quick_fact', 'small_talk', 'yes_no', 'simple_math', 'name_reminder', 'time_query',
      'decision', 'philosophical_debate', 'what_if_scenario',
    ],
    maxOutputTokens: 50,
    temperature: 0.3,
    minimalPromptTemplate: '{user_input}',
    fallbackModel: 'phi3',
  },
  gemini: {
    id: 'gemini',
    codename: 'The Polymath',
    primaryRole: '2M context, multimodal, culture/history/geopolitics, PDF/image analysis.',
    intentsHandled: [
      'history', 'cultural', 'geopolitical', 'multimodal_upload', 'long_document',
      'image_analysis', 'current_events',
    ],
    maxOutputTokens: 2048,
    temperature: 0.7,
    minimalPromptTemplate: '{user_input}',
    fallbackModel: 'llama3_70b_via_groq',
  },
  deepseek: {
    id: 'deepseek',
    codename: 'The Architect',
    primaryRole: 'STEM, code, math, automation scripts, video scripts, architecture.',
    intentsHandled: [
      'coding', 'stem', 'complex_math', 'build_website', 'automation', 'debug',
      '3d_model', 'video_script', 'build_website',
    ],
    maxOutputTokens: 4096,
    temperature: 0.2,
    minimalPromptTemplate: '{user_input}',
    fallbackModel: 'mixtral_8x7b_via_ollama',
  },
  swarm: {
    id: 'swarm',
    codename: 'The Reserve Army',
    primaryRole: 'Classifier, mediator, validator, Phi-3 polish — fallback when Council fails.',
    intentsHandled: ['general'],
    maxOutputTokens: 1536,
    temperature: 0.5,
    minimalPromptTemplate: '{user_input}',
    fallbackModel: 'heuristic',
  },
  blackhole: {
    id: 'blackhole',
    codename: 'The Emitter',
    primaryRole: 'De-AI-fy, markdown structure, decision matrix — post-process only.',
    intentsHandled: [],
    maxOutputTokens: 0,
    temperature: 0,
    minimalPromptTemplate: '',
    fallbackModel: 'regex',
  },
};

/** Intents that return Coming Soon cards (full native build not ready) */
export const COMING_SOON_INTENTS: XrogaIntent[] = [
  'build_game',
  'build_app',
  'build_software',
];

export function formatMinimalPrompt(template: string, userInput: string): string {
  return template.replace(/\{user_input\}/g, userInput).replace(/\{user_query\}/g, userInput);
}

export function primaryApiForIntent(intent: XrogaIntent): ApiRoleId {
  if (API_ROLES.groq.intentsHandled.includes(intent)) return 'groq';
  if (API_ROLES.gemini.intentsHandled.includes(intent)) return 'gemini';
  if (API_ROLES.deepseek.intentsHandled.includes(intent)) return 'deepseek';
  if (intent === 'decision' || intent === 'philosophical_debate' || intent === 'what_if_scenario') {
    return 'deepseek';
  }
  return 'deepseek';
}
