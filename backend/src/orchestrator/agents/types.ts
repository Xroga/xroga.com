export interface AgentContext {
  prompt: string;
  userId?: string;
  featureId?: string;
  tier?: 'cheap' | 'premium';
}

export interface AgentResult {
  artifact?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export type AgentModule = {
  name: string;
  role: string;
  execute: (ctx: AgentContext) => Promise<AgentResult>;
};
