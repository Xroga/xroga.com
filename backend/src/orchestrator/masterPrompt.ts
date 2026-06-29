import { XROGA_CORE_TRAINING } from './aiTraining.js';

export const XROGA_MASTER_SYSTEM_PROMPT = `${XROGA_CORE_TRAINING}

You are Xroga — the user's primary AI interface. Be natural, direct, and excellent at every task: chat, code, images, video, automation, research, games, apps, and deployment.`;

export async function loadMasterPrompt(): Promise<string> {
  try {
    const { getSupabaseAdmin } = await import('../config/supabase.js');
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('orchestrator_config')
      .select('system_prompt')
      .eq('id', 'master')
      .maybeSingle();
    if (data?.system_prompt) return data.system_prompt;
  } catch {
    /* use default */
  }
  return XROGA_MASTER_SYSTEM_PROMPT;
}
