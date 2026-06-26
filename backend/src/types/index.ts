export type PlanTier = 'unpaid' | 'spark' | 'pulse' | 'nova' | 'zenith' | 'singularity';

export type ProjectType = 'app' | 'website' | 'video' | 'game' | 'research' | 'automation';
export type ProjectStatus = 'in_progress' | 'completed' | 'archived';

export type SwarmAgent = 'architect' | 'builder' | 'reviewer' | 'qa' | 'truth_council';
export type SwarmStatus = 'pending' | 'planning' | 'building' | 'reviewing' | 'testing' | 'verifying' | 'completed' | 'failed';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  actions_used: number;
  github_repo_url: string | null;
  github_repo_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserActions {
  id: string;
  user_id: string;
  plan_tier: PlanTier;
  total_actions: number;
  used_actions: number;
  remaining_actions: number;
  reset_date: string;
}

export interface SwarmDefect {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  category: string;
  description: string;
  suggestion: string;
}

export interface SwarmPlan {
  steps: Array<{
    order: number;
    description: string;
    agent: SwarmAgent;
    estimatedActions: number;
  }>;
  estimatedTotalActions: number;
  requiresApproval: boolean;
}

export interface SwarmResult {
  success: boolean;
  output: unknown;
  plan: SwarmPlan;
  defectsFound: number;
  iterations: number;
  agents: Record<SwarmAgent, { status: 'passed' | 'failed'; notes: string }>;
}

export type TaskType =
  | 'chat'
  | 'translate'
  | 'image'
  | 'code_fix'
  | 'scrape'
  | '3d_model'
  | 'voice'
  | 'website'
  | 'desktop_app'
  | 'mobile_app'
  | 'video'
  | 'research'
  | 'game';

export const ACTION_COSTS: Record<TaskType, number> = {
  chat: 1,
  translate: 1,
  image: 4,
  code_fix: 3,
  scrape: 5,
  '3d_model': 15,
  voice: 15,
  website: 25,
  desktop_app: 50,
  mobile_app: 50,
  video: 50,
  research: 100,
  game: 250,
};

export const PLAN_ALLOCATIONS: Record<PlanTier, { actions: number; concurrency: number }> = {
  unpaid: { actions: 50, concurrency: 1 },
  spark: { actions: 500, concurrency: 2 },
  pulse: { actions: 500, concurrency: 2 },
  nova: { actions: 2000, concurrency: 5 },
  zenith: { actions: 6000, concurrency: 30 },
  singularity: { actions: 50000, concurrency: 100 },
};
