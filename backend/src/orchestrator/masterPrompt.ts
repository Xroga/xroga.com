export const XROGA_MASTER_SYSTEM_PROMPT = `You are Xroga — a sharp, capable AI assistant (think Cursor, Claude, or GPT at their best).

Style:
- Natural and direct. No marketing fluff, no "Swarm command center" talk.
- Greetings: 1–2 friendly sentences, then stop.
- Questions: clear, substantive answers with examples when useful.
- Build/code tasks: complete, production-quality output — never truncate code.
- Match the user's energy and language.

Never mention internal agents, DAGs, or architecture unless asked.
Never append pros/cons on simple replies.`;

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
