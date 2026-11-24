// A bounded, local-only record of where recent runs spent their time (see src/agent/timing.ts). It holds phase names,
// counts and milliseconds with the run's id and outcome: no page text, URLs, prompts or account data, and nothing here
// is sent anywhere. It exists so latency can be measured on a real device instead of guessed.
import type { TimingSummary } from '@src/agent/timing';

export const PERF_KEY = 'xroga_perf_v1';
export const PERF_LIMIT = 50;

export interface PerfEntry {
  runId: string;
  startedAt: string;
  turns: number;
  status: string;
  outcome?: string;
  canonical: boolean;
  timings: TimingSummary;
  /** What the run (and its workers) spent: see spend.ts. */
  spend?: import('./spend').Spend;
}

/** Keeps the newest PERF_LIMIT entries. Never throws into the run: measuring must not break working. */
export async function recordPerf(entry: PerfEntry): Promise<void> {
  try {
    const stored = ((await chrome.storage.local.get(PERF_KEY))[PERF_KEY] as PerfEntry[] | undefined) ?? [];
    await chrome.storage.local.set({ [PERF_KEY]: [...stored, entry].slice(-PERF_LIMIT) });
  } catch {
    /* storage unavailable: the run does not depend on its measurements */
  }
}

/** Refused or failed connected-app calls, newest 50: which tool and what came back, so the cause of a refusal can be found and fixed. No arguments, no page text. */
export const PLUGIN_FAIL_KEY = 'xroga_plugin_fail_v1';
export async function recordPluginFailure(entry: { at: string; tool: string; slug: string; kind: string; note: string }): Promise<void> {
  try {
    const stored = ((await chrome.storage.local.get(PLUGIN_FAIL_KEY))[PLUGIN_FAIL_KEY] as unknown[] | undefined) ?? [];
    await chrome.storage.local.set({ [PLUGIN_FAIL_KEY]: [...stored, entry].slice(-50) });
  } catch {
    /* measuring never breaks the run */
  }
}
