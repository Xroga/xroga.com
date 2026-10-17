import { getGlobalSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { normalizeProviderError } from '../ai/providerRuntime.js';

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

const knownProviders = new Set(['elevenlabs', 'cartesia', 'fish-audio', 'suno', 'openai', 'anthropic', 'google', 'deepseek', 'groq', 'openrouter', 'voice']);
const knownFallbacks = new Set(['trying next voice provider', 'trying next provider', 'heuristic/cache fallback']);

/** Platform diagnostics only. Unverified IDs and free-form payloads are not audit evidence. */
export function systemErrorRecord(entry: SystemErrorEntry) {
  return {
    api: knownProviders.has(entry.api ?? '') ? entry.api! : 'unknown',
    error_message: entry.errorMessage === 'All providers exhausted'
      ? 'All providers exhausted' : normalizeProviderError({ message: typeof entry.errorMessage === 'string' ? entry.errorMessage.slice(0, 4096) : '' }).safeMessage,
    fallback_used: knownFallbacks.has(entry.fallbackUsed ?? '') ? entry.fallbackUsed! : null,
    severity: ['info', 'warning', 'error', 'critical'].includes(entry.severity ?? '') ? entry.severity! : 'warning',
    user_id: null, session_id: null, run_id: null,
    metadata: entry.metadata?.apiType === 'voice' ? { apiType: 'voice' } : {},
  };
}

export async function logSystemError(entry: SystemErrorEntry): Promise<void> {
  try {
    const record = systemErrorRecord(entry);
    console.warn(`[system_error] ${record.api}: ${record.error_message}`);
    const supabase = getGlobalSupabaseAdmin('platform_error_diagnostic');
    const { error } = await supabase.from('system_errors').insert(record);
    if (error) console.warn('[system_error] diagnostic persistence unavailable');
  } catch {
    /* never throw from logger */
  }
}
