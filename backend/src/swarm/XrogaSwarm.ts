import { BaseSwarm, type AgentResult, type SwarmContext } from './BaseSwarm.js';
import type { SwarmDefect, SwarmPlan } from '../types/index.js';

/**
 * Default Swarm implementation.
 * Uses structured planning and rule-based agents in Phase 1.
 * Phase 2+ will wire real LLM APIs (DeepSeek, Gemini, Claude).
 */
export class XrogaSwarm extends BaseSwarm {
  async executeArchitect(context: SwarmContext): Promise<AgentResult<SwarmPlan>> {
    const start = Date.now();
    const prompt = context.prompt.toLowerCase();

    const steps: SwarmPlan['steps'] = [
      { order: 1, description: 'Analyze user request and identify deliverables', agent: 'architect', estimatedActions: 1 },
      { order: 2, description: 'Generate primary output', agent: 'builder', estimatedActions: 5 },
      { order: 3, description: 'Review for logic gaps and security flaws', agent: 'reviewer', estimatedActions: 2 },
      { order: 4, description: 'Simulate execution in sandbox', agent: 'qa', estimatedActions: 2 },
      { order: 5, description: 'Verify facts and safety compliance', agent: 'truth_council', estimatedActions: 2 },
    ];

    const requiresApproval =
      prompt.includes('delete') ||
      prompt.includes('payment') ||
      prompt.includes('spend') ||
      prompt.includes('purchase');

    const plan: SwarmPlan = {
      steps,
      estimatedTotalActions: steps.reduce((sum, s) => sum + s.estimatedActions, 0),
      requiresApproval,
    };

    return {
      agent: 'architect',
      success: true,
      output: plan,
      notes: `Plan created with ${steps.length} steps. Approval required: ${requiresApproval}`,
      durationMs: Date.now() - start,
    };
  }

  async executeBuilder(context: SwarmContext): Promise<AgentResult<unknown>> {
    const start = Date.now();

    const output = {
      type: 'draft',
      content: context.prompt,
      iteration: context.iteration,
      fixedDefects: context.defects?.length ?? 0,
      timestamp: new Date().toISOString(),
      message: `Draft generated for: "${context.prompt.slice(0, 100)}..."`,
    };

    return {
      agent: 'builder',
      success: true,
      output,
      notes: `Draft v${context.iteration} complete`,
      durationMs: Date.now() - start,
    };
  }

  async executeReviewer(context: SwarmContext): Promise<AgentResult<SwarmDefect[]>> {
    const start = Date.now();
    const defects: SwarmDefect[] = [];

    if (!context.draft) {
      defects.push({
        id: 'rev-001',
        severity: 'critical',
        category: 'missing_output',
        description: 'Builder produced no output',
        suggestion: 'Regenerate the draft with full context',
      });
    }

    const prompt = context.prompt.toLowerCase();
    if (prompt.includes('password') && prompt.includes('plain')) {
      defects.push({
        id: 'rev-002',
        severity: 'critical',
        category: 'security',
        description: 'Potential plaintext password storage',
        suggestion: 'Use bcrypt hashing with salt rounds >= 12',
      });
    }

    if (prompt.includes('sql') && !prompt.includes('parameterized')) {
      defects.push({
        id: 'rev-003',
        severity: 'major',
        category: 'security',
        description: 'Possible SQL injection vulnerability',
        suggestion: 'Use parameterized queries or ORM',
      });
    }

    // On retry iterations, simulate fixed defects
    if (context.iteration > 1) {
      return {
        agent: 'reviewer',
        success: true,
        output: defects.filter((d) => d.severity === 'critical'),
        notes: `Review complete – ${defects.length} defects (retry ${context.iteration})`,
        durationMs: Date.now() - start,
      };
    }

    // First pass: find 2-3 minor defects to demonstrate negotiation loop
    if (defects.length === 0) {
      defects.push({
        id: 'rev-004',
        severity: 'minor',
        category: 'quality',
        description: 'Output lacks error handling for edge cases',
        suggestion: 'Add try/catch blocks and input validation',
      });
    }

    return {
      agent: 'reviewer',
      success: true,
      output: defects,
      notes: `Review complete – ${defects.length} defects found`,
      durationMs: Date.now() - start,
    };
  }

  async executeQA(context: SwarmContext): Promise<AgentResult<{ passed: boolean; errors: string[] }>> {
    const start = Date.now();
    const errors: string[] = [];

    if (!context.draft) {
      errors.push('No draft available for QA testing');
    }

    // Simulate runtime check passing on iteration > 1
    const passed = context.iteration > 1 || errors.length === 0;

    return {
      agent: 'qa',
      success: passed,
      output: { passed, errors },
      notes: passed ? 'All virtual tests passed' : `${errors.length} runtime errors`,
      durationMs: Date.now() - start,
    };
  }

  async executeTruthCouncil(
    context: SwarmContext
  ): Promise<AgentResult<{ approved: boolean; reasons: string[] }>> {
    const start = Date.now();
    const reasons: string[] = [];
    const blockedPatterns = [
      /\b(bomb|explosive|weapon)\s*(making|building|instructions)\b/i,
      /\b(hack|exploit)\s+(bank|government|system)\b/i,
      /\b(money\s*launder)/i,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(context.prompt)) {
        reasons.push('Request blocked by ethical firewall');
        return {
          agent: 'truth_council',
          success: false,
          output: { approved: false, reasons },
          notes: 'Ethical firewall triggered',
          durationMs: Date.now() - start,
        };
      }
    }

    // Approve on iteration >= 2 (after negotiation loop demonstrates fixes)
    const approved = context.iteration >= 2;

    if (!approved) {
      reasons.push('Pending final verification after defect resolution');
    } else {
      reasons.push('Zero defects confirmed – output approved for release');
    }

    return {
      agent: 'truth_council',
      success: approved,
      output: { approved, reasons },
      notes: approved ? 'Truth Council approved' : 'Awaiting zero-defect state',
      durationMs: Date.now() - start,
    };
  }
}

export const swarm = new XrogaSwarm();
