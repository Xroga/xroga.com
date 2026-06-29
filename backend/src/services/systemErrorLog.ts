import { getSupabaseAdmin } from '../config/supabase.js';

export interface SystemErrorEntry {
  api?: string;
  errorMessage: string;
  fallbackUsed?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  userId?: string;
  sessionId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
}

export async function logSystemError(entry: SystemErrorEntry): Promise<void> {
  console.warn(`[system_error] ${entry.api ?? 'unknown'}: ${entry.errorMessage}`);
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('system_errors').insert({
      api: entry.api ?? null,
      error_message: entry.errorMessage,
      fallback_used: entry.fallbackUsed ?? null,
      severity: entry.severity ?? 'warning',
      user_id: entry.userId ?? null,
      session_id: entry.sessionId ?? null,
      run_id: entry.runId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch {
    /* never throw from logger */
  }
}
