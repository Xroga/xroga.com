import type { XrogaModelRole } from '../config/modelRegistry.js';
import { estimateUsdCost } from '../config/modelRegistry.js';

export interface ModelUsageLine {
  role: XrogaModelRole;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  estimatedUsd: number;
}

/**
 * Per-build usage accumulator.
 * Supports incremental billing so Fly crashes / Escape Pod handoff
 * still persist tokens already spent on real API calls.
 */
export class BuildUsageTracker {
  private lines = new Map<XrogaModelRole, ModelUsageLine>();
  /** Tokens already written to user_token_usage for this build */
  private billed = new Map<XrogaModelRole, { inputTokens: number; outputTokens: number }>();
  private grok45Calls = 0;

  add(role: XrogaModelRole, inputTokens: number, outputTokens: number): void {
    const inTok = Math.max(0, Math.round(inputTokens));
    const outTok = Math.max(0, Math.round(outputTokens));
    if (inTok + outTok <= 0) return;

    const prev = this.lines.get(role) ?? {
      role,
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
      estimatedUsd: 0,
    };
    prev.inputTokens += inTok;
    prev.outputTokens += outTok;
    prev.calls += 1;
    prev.estimatedUsd = estimateUsdCost(prev.inputTokens, prev.outputTokens, role);
    this.lines.set(role, prev);
    if (role === 'grok_fast') this.grok45Calls += 1;
  }

  /** How many Grok 4.5 calls this build has made so far */
  get grok45CallCount(): number {
    return this.grok45Calls;
  }

  /** True if another Grok 4.5 call stays under the hard cap */
  canUseGrok45(maxCalls: number): boolean {
    return this.grok45Calls < Math.max(0, maxCalls);
  }

  get totalInput(): number {
    let n = 0;
    for (const l of this.lines.values()) n += l.inputTokens;
    return n;
  }

  get totalOutput(): number {
    let n = 0;
    for (const l of this.lines.values()) n += l.outputTokens;
    return n;
  }

  get totalTokens(): number {
    return this.totalInput + this.totalOutput;
  }

  /** Sum of per-model API call counts for this build */
  get totalCalls(): number {
    let n = 0;
    for (const l of this.lines.values()) n += l.calls;
    return n;
  }

  get estimatedUsd(): number {
    let n = 0;
    for (const l of this.lines.values()) n += l.estimatedUsd;
    return n;
  }

  snapshot(): ModelUsageLine[] {
    return [...this.lines.values()].sort(
      (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)
    );
  }

  /** Unbilled delta since last markBilled — for honest incremental DB writes. */
  unbilledDelta(): Array<{ role: XrogaModelRole; inputTokens: number; outputTokens: number }> {
    const out: Array<{ role: XrogaModelRole; inputTokens: number; outputTokens: number }> = [];
    for (const line of this.lines.values()) {
      const done = this.billed.get(line.role) ?? { inputTokens: 0, outputTokens: 0 };
      const inputTokens = line.inputTokens - done.inputTokens;
      const outputTokens = line.outputTokens - done.outputTokens;
      if (inputTokens + outputTokens > 0) {
        out.push({ role: line.role, inputTokens, outputTokens });
      }
    }
    return out;
  }

  markBilled(delta: Array<{ role: XrogaModelRole; inputTokens: number; outputTokens: number }>): void {
    for (const d of delta) {
      const prev = this.billed.get(d.role) ?? { inputTokens: 0, outputTokens: 0 };
      this.billed.set(d.role, {
        inputTokens: prev.inputTokens + d.inputTokens,
        outputTokens: prev.outputTokens + d.outputTokens,
      });
    }
  }
}
