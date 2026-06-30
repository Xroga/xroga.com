/** Omni-Reality SSE / progress event types */

export type OmniVideoPhase =
  | 'trinity_scripting'
  | 'storyboard_ready'
  | 'characters'
  | 'scene_render'
  | 'qc_inspect'
  | 'groq_patch'
  | 'tool_swap'
  | 'deepseek_simplify'
  | 'parallax_fallback'
  | 'audio_compose'
  | 'stitch_assemble'
  | 'postproduction'
  | 'complete';

export interface OmniVideoEvent {
  phase: OmniVideoPhase;
  message: string;
  detail?: string;
  sceneIndex?: number;
  sceneTotal?: number;
  provider?: string;
  healingStep?: string;
}

/** Map omni phase → legacy videoStep for existing frontend */
export function omniPhaseToVideoStep(phase: OmniVideoPhase): string {
  switch (phase) {
    case 'trinity_scripting':
    case 'storyboard_ready':
      return 'scripting';
    case 'characters':
      return 'characters';
    case 'scene_render':
    case 'groq_patch':
    case 'tool_swap':
    case 'deepseek_simplify':
    case 'parallax_fallback':
      return 'rendering';
    case 'qc_inspect':
      return 'rendering';
    case 'audio_compose':
      return 'audio';
    case 'stitch_assemble':
    case 'postproduction':
      return 'assembling';
    case 'complete':
      return 'complete';
    default:
      return 'rendering';
  }
}

export const OMNI_PHASE_LABELS: Record<OmniVideoPhase, string> = {
  trinity_scripting: 'DeepSeek writing storyboard…',
  storyboard_ready: 'Storyboard locked — continuity set',
  characters: 'Designing characters & keyframes',
  scene_render: 'Rendering cinematic scene',
  qc_inspect: 'QC shield — inspecting frames',
  groq_patch: 'Groq reflex patch — fixing defects',
  tool_swap: 'Swapping render engine (80/20)',
  deepseek_simplify: 'DeepSeek simplifying shot complexity',
  parallax_fallback: '2.5D parallax cinematic transition',
  audio_compose: 'ElevenLabs voiceover & score',
  stitch_assemble: 'FFmpeg assembling final cut',
  postproduction: 'Hollywood polish pass',
  complete: 'Your film is ready',
};
