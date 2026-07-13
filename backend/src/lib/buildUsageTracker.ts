import type { XrogaModelRole } from '../config/modelRegistry.js';
import { estimateUsdCost } from '../config/modelRegistry.js';

export interface ModelUsageLine {
  role: XrogaModelRole;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  estimatedUsd: number;
}

export class BuildUsageTracker {
  private lines = new Map<XrogaModelRole, ModelUsageLine>();
  private grok45Calls = 0;

  add(role: XrogaModelRole, inputTokens: number, outputTokens: number): void {
    const prev = this.lines.get(role) ?? {
      role,
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
      estimatedUsd: 0,
    };
    prev.inputTokens += inputTokens;
    prev.outputTokens += outputTokens;
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

  get estimatedUsd(): number {
    let n = 0;
    for (const l of this.lines.values()) n += l.estimatedUsd;
    return n;
  }

  snapshot(): ModelUsageLine[] {
    return [...this.lines.values()].sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
  }
}
