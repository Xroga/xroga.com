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
