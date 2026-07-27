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
