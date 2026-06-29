import type {
  SwarmAgent,
  SwarmDefect,
  SwarmPlan,
  SwarmResult,
  SwarmStatus,
} from '../types/index.js';
import type { FeatureCategory, SwarmProgressEvent } from '../types/features.js';

export interface SwarmContext {
  userId: string;
  projectId?: string;
  prompt: string;
  runId: string;
  iteration: number;
  featureCategory?: FeatureCategory;
  extras?: Record<string, unknown>;
  plan?: SwarmPlan;
  draft?: unknown;
  defects?: SwarmDefect[];
  qaResults?: { passed: boolean; errors: string[] };
  truthCouncilVerdict?: { approved: boolean; reasons: string[] };
}

export interface AgentResult<T = unknown> {
  agent: SwarmAgent;
  success: boolean;
  output: T;
  notes: string;
  durationMs: number;
}

export abstract class BaseSwarm {
  protected maxIterations = 5;

  abstract executeArchitect(context: SwarmContext): Promise<AgentResult<SwarmPlan>>;
  abstract executeBuilder(context: SwarmContext): Promise<AgentResult<unknown>>;
  abstract executeReviewer(context: SwarmContext): Promise<AgentResult<SwarmDefect[]>>;
  abstract executeQA(context: SwarmContext): Promise<AgentResult<{ passed: boolean; errors: string[] }>>;
  abstract executeTruthCouncil(
    context: SwarmContext
  ): Promise<AgentResult<{ approved: boolean; reasons: string[] }>>;

  protected onStatusChange?: (runId: string, status: SwarmStatus, agent: SwarmAgent) => void;
  protected onProgress?: (event: SwarmProgressEvent) => void;

  setStatusCallback(cb: (runId: string, status: SwarmStatus, agent: SwarmAgent) => void) {
    this.onStatusChange = cb;
  }

  setProgressCallback(cb: (event: SwarmProgressEvent) => void) {
    this.onProgress = cb;
  }

  private notify(runId: string, status: SwarmStatus, agent: SwarmAgent, iteration?: number) {
    this.onStatusChange?.(runId, status, agent);
    this.onProgress?.({
      runId,
      agent,
      status,
      message: `${agent} is ${status}`,
      iteration,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * The Negotiation Loop:
   * 1. Architect → Plan
   * 2. Builder → Draft
   * 3. Reviewer → Finds defects
   * 4. Builder → Fixes defects
   * 5. QA → Simulates execution
   * 6. Builder → Fixes runtime errors
   * 7. Truth Council → Final verification
   * 8. Loop repeats if any agent finds flaws
   * 9. Release only when ALL agents say "Zero Defects"
   */
  async execute(userId: string, prompt: string, projectId?: string, runId?: string, featureCategory?: FeatureCategory, extras?: Record<string, unknown>): Promise<SwarmResult> {
    const context: SwarmContext = {
      userId,
      projectId,
      prompt,
      runId: runId ?? crypto.randomUUID(),
      iteration: 0,
      featureCategory,
      extras,
    };

    const agentResults: SwarmResult['agents'] = {
      architect: { status: 'failed', notes: '' },
      builder: { status: 'failed', notes: '' },
      reviewer: { status: 'failed', notes: '' },
      qa: { status: 'failed', notes: '' },
      truth_council: { status: 'failed', notes: '' },
    };

    let totalDefects = 0;
    let output: unknown = null;

    // Step 1: Architect plans
    this.notify(context.runId, 'planning', 'architect');
    const planResult = await this.executeArchitect(context);
    context.plan = planResult.output;
    agentResults.architect = {
      status: planResult.success ? 'passed' : 'failed',
      notes: planResult.notes,
    };

    if (!planResult.success) {
      return this.buildResult(false, output, context, totalDefects, agentResults);
    }

    for (let i = 0; i < this.maxIterations; i++) {
      context.iteration = i + 1;

      // Step 2: Builder creates draft
      this.notify(context.runId, 'building', 'builder', context.iteration);
      const buildResult = await this.executeBuilder(context);
      context.draft = buildResult.output;
      output = buildResult.output;
      agentResults.builder = {
        status: buildResult.success ? 'passed' : 'failed',
        notes: buildResult.notes,
      };

      if (!buildResult.success) continue;

      // Fast path: simple chat skips heavy review loop
      if (context.featureCategory === 'chat') {
        agentResults.reviewer = { status: 'passed', notes: 'Fast chat path' };
        agentResults.qa = { status: 'passed', notes: 'Fast chat path' };
        agentResults.truth_council = { status: 'passed', notes: 'Fast chat path' };
        this.notify(context.runId, 'completed', 'builder', context.iteration);
        return this.buildResult(true, output, context, 0, agentResults);
      }

      // Step 3: Reviewer finds defects
      this.notify(context.runId, 'reviewing', 'reviewer');
      const reviewResult = await this.executeReviewer(context);
      context.defects = reviewResult.output;
      totalDefects += reviewResult.output.length;
      agentResults.reviewer = {
        status: reviewResult.output.length === 0 ? 'passed' : 'failed',
        notes: `${reviewResult.output.length} defects found`,
      };

      // Step 4: Debugger fixes defects (if any)
      if (reviewResult.output.length > 0) {
        this.notify(context.runId, 'building', 'debugger');
        const fixResult = await this.executeBuilder({ ...context, prompt: this.buildFixPrompt(context) });
        context.draft = fixResult.output;
        output = fixResult.output;
      }

      // Step 5: QA tests
      this.notify(context.runId, 'testing', 'qa');
      const qaResult = await this.executeQA(context);
      context.qaResults = qaResult.output;
      agentResults.qa = {
        status: qaResult.output.passed ? 'passed' : 'failed',
        notes: qaResult.output.errors.join('; ') || 'All tests passed',
      };

      // Step 6: Debugger fixes runtime errors (if any)
      if (!qaResult.output.passed) {
        this.notify(context.runId, 'building', 'debugger');
        const runtimeFix = await this.executeBuilder({
          ...context,
          prompt: `Fix these runtime errors:\n${qaResult.output.errors.join('\n')}`,
        });
        context.draft = runtimeFix.output;
        output = runtimeFix.output;
      }

      // Step 7: Automation Runtime + Truth Council verifies
      const deployCategories = new Set(['landing_page', 'browser_automation', 'key_creation']);
      this.notify(
        context.runId,
        'verifying',
        deployCategories.has(context.featureCategory ?? '') ? 'automation' : 'truth_council'
      );
      const truthResult = await this.executeTruthCouncil(context);
      context.truthCouncilVerdict = truthResult.output;
      agentResults.truth_council = {
        status: truthResult.output.approved ? 'passed' : 'failed',
        notes: truthResult.output.reasons.join('; '),
      };

      // Step 8-9: Zero Defects check
      if (this.isZeroDefects(context, reviewResult.output, qaResult.output, truthResult.output)) {
        this.notify(context.runId, 'completed', 'truth_council');
        return this.buildResult(true, output, context, totalDefects, agentResults);
      }
    }

    this.notify(context.runId, 'failed', 'truth_council');
    return this.buildResult(false, output, context, totalDefects, agentResults);
  }

  private isZeroDefects(
    _context: SwarmContext,
    defects: SwarmDefect[],
    qa: { passed: boolean; errors: string[] },
    truth: { approved: boolean; reasons: string[] }
  ): boolean {
    const criticalDefects = defects.filter((d) => d.severity === 'critical');
    return criticalDefects.length === 0 && qa.passed && truth.approved;
  }

  private buildFixPrompt(context: SwarmContext): string {
    const defectList = (context.defects ?? [])
      .map((d, i) => `${i + 1}. [${d.severity}] ${d.description} → Fix: ${d.suggestion}`)
      .join('\n');
    return `Fix all defects in the current draft:\n${defectList}\n\nOriginal request: ${context.prompt}`;
  }

  private buildResult(
    success: boolean,
    output: unknown,
    context: SwarmContext,
    defectsFound: number,
    agents: SwarmResult['agents']
  ): SwarmResult {
    return {
      success,
      output,
      plan: context.plan!,
      defectsFound,
      iterations: context.iteration,
      agents,
    };
  }
}
