export interface Command3BRequirement {
  id: string;
  mandatory: boolean;
  status: 'verified' | 'external_only' | 'blocked' | 'failed';
  evidence: string[];
}

export function deriveCommand3BStatus(requirements: Command3BRequirement[]): 'command_3b_verified' | 'command_3b_blocked' {
  if (!requirements.length) return 'command_3b_blocked';
  const mandatoryComplete = requirements.filter((item) => item.mandatory).every((item) => item.status === 'verified' && item.evidence.length > 0);
  const dishonestOptional = requirements.filter((item) => !item.mandatory).some((item) => item.status === 'verified' && item.evidence.length === 0);
  return mandatoryComplete && !dishonestOptional ? 'command_3b_verified' : 'command_3b_blocked';
}

export interface Command3FinalStatus {
  command3b: 'command_3b_verified' | 'command_3b_blocked';
  command3c: 'command_3c_verified' | 'command_3c_blocked';
  complete: 'production_operations_growth_verified' | 'production_operations_growth_blocked';
}

function evidenced(requirements: Command3BRequirement[]): boolean {
  return requirements.length > 0
    && requirements.filter((item) => item.mandatory).every((item) => item.status === 'verified' && item.evidence.length > 0)
    && !requirements.some((item) => item.status === 'verified' && item.evidence.length === 0);
}

export function deriveCommand3FinalStatus(command3b: Command3BRequirement[], command3c: Command3BRequirement[]): Command3FinalStatus {
  const bVerified = deriveCommand3BStatus(command3b) === 'command_3b_verified';
  const cVerified = evidenced(command3c);
  return {
    command3b: bVerified ? 'command_3b_verified' : 'command_3b_blocked',
    command3c: cVerified ? 'command_3c_verified' : 'command_3c_blocked',
    complete: bVerified && cVerified ? 'production_operations_growth_verified' : 'production_operations_growth_blocked',
  };
}

/**
 * Agent Intelligence completion, derived rather than declared.
 *
 * The Command 3 status model requires the new Agent Intelligence work to have its own
 * evidence-derived state, and forbids inventing a success string outside this system. So
 * `agent_intelligence_verified` is not assignable: it is computed from the same eight
 * conditions the work is actually gated on, and a caller cannot pass it in.
 *
 * The distinction from `production_operations_growth_verified` matters. That status covers
 * historical Operations and Growth, which were verified separately and remain verified on
 * their own evidence. Collapsing the two would let a passing Operations suite imply that
 * the canonical runtime implements — a claim nothing has established.
 */
export interface AgentIntelligenceEvidence {
  /** Every engineering task carries an explicit role with a bounded tool set. */
  rolesEnforced: boolean;
  /** Coding and research providers are separated, with transports fixed per family. */
  providerIsolationEnforced: boolean;
  /** Engineering tasks execute through the canonical scheduler with earned evidence. */
  canonicalTasksExecute: boolean;
  /** Normal implementation is incremental rather than one whole-project completion. */
  incrementalImplementation: boolean;
  /** Measured benchmark evidence reaches routing rather than accumulating unused. */
  measuredRoutingEvidence: boolean;
  /** Capability maturity is derived from gates, never asserted. */
  capabilityMaturityDerived: boolean;
  /** A real universal run produced a commit through the atomic writer. */
  liveRunProducedCommit: boolean;
  /** Rollout was returned to a safe mode after the live proof. */
  rolloutReturnedToSafeMode: boolean;
}

export const AGENT_INTELLIGENCE_CONDITIONS: readonly (keyof AgentIntelligenceEvidence)[] = [
  'rolesEnforced',
  'providerIsolationEnforced',
  'canonicalTasksExecute',
  'incrementalImplementation',
  'measuredRoutingEvidence',
  'capabilityMaturityDerived',
  'liveRunProducedCommit',
  'rolloutReturnedToSafeMode',
];

export interface AgentIntelligenceStatus {
  status: 'agent_intelligence_verified' | 'agent_intelligence_incomplete';
  /** Conditions not yet met, so the remaining work is nameable rather than a summary. */
  outstanding: (keyof AgentIntelligenceEvidence)[];
}

export function deriveAgentIntelligenceStatus(
  evidence: Partial<AgentIntelligenceEvidence>,
): AgentIntelligenceStatus {
  const outstanding = AGENT_INTELLIGENCE_CONDITIONS.filter((key) => evidence[key] !== true);
  return {
    status: outstanding.length === 0 ? 'agent_intelligence_verified' : 'agent_intelligence_incomplete',
    outstanding,
  };
}

/**
 * The whole Command 3 picture.
 *
 * Reported as separate statuses rather than one, because they are earned separately and
 * one being blocked must not silently downgrade the other. Full completion requires both.
 */
export interface Command3OverallStatus extends Command3FinalStatus {
  agentIntelligence: AgentIntelligenceStatus['status'];
  agentIntelligenceOutstanding: (keyof AgentIntelligenceEvidence)[];
  overall: 'command_3_verified' | 'command_3_incomplete';
}

export function deriveCommand3OverallStatus(input: {
  command3b: Command3BRequirement[];
  command3c: Command3BRequirement[];
  agentIntelligence: Partial<AgentIntelligenceEvidence>;
}): Command3OverallStatus {
  const historical = deriveCommand3FinalStatus(input.command3b, input.command3c);
  const agent = deriveAgentIntelligenceStatus(input.agentIntelligence);
  return {
    ...historical,
    agentIntelligence: agent.status,
    agentIntelligenceOutstanding: agent.outstanding,
    overall:
      historical.complete === 'production_operations_growth_verified' &&
      agent.status === 'agent_intelligence_verified'
        ? 'command_3_verified'
        : 'command_3_incomplete',
  };
}
