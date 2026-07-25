import type { ProjectFile } from './patches.js';
import type { ModelId } from './models.js';
import {
  getRuntimeModelRegistry,
  type ModelCapability,
  type RuntimeModelCapability,
} from './modelCapabilityRegistry.js';
import { getRouterAdminConfig, type RoutingMode } from './routerConfig.js';
import { classifyTaskRequest, type TaskClassification } from '../lib/taskClassifier.js';
import type { FailureCategory } from '../lib/recoveryPlanner.js';
import { historicalModelQuality } from './routingOutcomes.js';

export type RouterTaskClass =
  | 'request_understanding'
  | 'requirement_inference'
  | 'architecture'
  | 'repository_analysis'
  | 'dependency_analysis'
  | 'large_context_comprehension'
  | 'web_research'
  | 'x_research'
  | 'crypto_research'
  | 'documentation_lookup'
  | 'api_discovery'
  | 'ui_generation'
  | 'backend_generation'
  | 'code_generation'
  | 'multi_file_implementation'
  | 'integration_implementation'
  | 'database_design'
  | 'storage_selection'
  | 'authentication_implementation'
  | 'blockchain_integration'
  | 'bug_fixing'
  | 'runtime_debugging'
  | 'build_debugging'
  | 'refactoring'
  | 'code_review'
  | 'security_review'
  | 'test_generation'
  | 'validation_repair'
  | 'performance_optimization'
  | 'deployment_troubleshooting'
  | 'github_operations'
  | 'vercel_operations'
  | 'recovery'
  | 'removal_cleanup'
  | 'migration'
  | 'unknown';

export interface ComplexityInput {
  prompt: string;
  repositoryFileCount?: number;
  affectedFileCount?: number;
  previousFailures?: number;
}

export interface ComplexityAssessment {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  signals: string[];
}

export interface RouterBudget {
  remainingTokens?: number;
  remainingUsd?: number;
  maximumTaskTokens?: number;
}

export interface RoutedSubtask {
  id: string;
  taskClass: RouterTaskClass;
  objective: string;
  requiredContext: string[];
  expectedOutput: string;
  allowedFiles: string[];
  dependsOn: string[];
  canRunConcurrently: boolean;
  risk: 'low' | 'medium' | 'high' | 'critical';
  selectedModel: ModelId | null;
  fallbackModels: ModelId[];
  validation: string[];
  tokenBudget: number;
  timeoutMs: number;
  blocker?: string;
}

export interface IntelligentRoutePlan {
  mode: RoutingMode;
  classification: TaskClassification;
  complexity: ComplexityAssessment;
  subtasks: RoutedSubtask[];
  reviewRequired: boolean;
  contextStrategy: {
    useRepositoryIndex: boolean;
    includeFullRepository: false;
    maximumContextTokens: number;
    rules: string[];
  };
  blockers: string[];
}

const CLASS_TO_CAPABILITY: Record<RouterTaskClass, ModelCapability> = {
  request_understanding: 'architecture',
  requirement_inference: 'architecture',
  architecture: 'architecture',
  repository_analysis: 'repository_analysis',
  dependency_analysis: 'repository_analysis',
  large_context_comprehension: 'repository_analysis',
  web_research: 'research',
  x_research: 'research',
  crypto_research: 'research',
  documentation_lookup: 'research',
  api_discovery: 'research',
  ui_generation: 'ui_generation',
  backend_generation: 'coding',
  code_generation: 'coding',
  multi_file_implementation: 'coding',
  integration_implementation: 'coding',
  database_design: 'architecture',
  storage_selection: 'architecture',
  authentication_implementation: 'security_review',
  blockchain_integration: 'security_review',
  bug_fixing: 'debugging',
  runtime_debugging: 'debugging',
  build_debugging: 'debugging',
  refactoring: 'coding',
  code_review: 'review',
  security_review: 'security_review',
  test_generation: 'coding',
  validation_repair: 'debugging',
  performance_optimization: 'debugging',
  deployment_troubleshooting: 'debugging',
  github_operations: 'coding',
  vercel_operations: 'debugging',
  recovery: 'debugging',
  removal_cleanup: 'repository_analysis',
  migration: 'architecture',
  unknown: 'architecture',
};

const HIGH_RISK_CAPABILITIES = new Set([
  'authentication_integration',
  'payment_integration',
  'blockchain_integration',
  'security_review',
  'deployment',
]);

export function assessComplexity(input: ComplexityInput): ComplexityAssessment {
  const text = input.prompt;
  let score = 10;
  const signals: string[] = [];
  const add = (points: number, signal: string) => {
    score += points;
    signals.push(signal);
  };
  const features = text.split(/\b(?:and|plus|also|with)\b/i).filter((part) => part.trim()).length;
  if (features >= 4) add(Math.min(15, features * 2), 'multiple requested features');
  if ((input.repositoryFileCount ?? 0) > 200) add(18, 'large repository');
  else if ((input.repositoryFileCount ?? 0) > 50) add(10, 'medium repository');
  if ((input.affectedFileCount ?? 0) > 10) add(12, 'many affected files');
  if (/\b(auth|oauth|permission|rls|secret|security)\b/i.test(text)) add(15, 'security boundary');
  if (/\b(payment|checkout|wallet|transaction|smart contract)\b/i.test(text)) add(18, 'financial or blockchain logic');
  if (/\b(migration|schema|database)\b/i.test(text)) add(10, 'data migration or schema');
  if (/\b(deploy|infrastructure|vercel|github actions)\b/i.test(text)) add(8, 'deployment infrastructure');
  if (/\b(latest|current|research|official docs|x\.com)\b/i.test(text)) add(8, 'current research required');
  if (/\b(frontend|ui)\b/i.test(text) && /\b(backend|api|database)\b/i.test(text)) add(12, 'cross-stack work');
  if (text.length > 5000) add(15, 'long request context');
  else if (text.length > 1500) add(8, 'substantial request context');
  if ((input.previousFailures ?? 0) > 0) add(Math.min(15, (input.previousFailures ?? 0) * 5), 'previous failed attempts');
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    level: score >= 80 ? 'critical' : score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low',
    signals,
  };
}

export function inferTaskClasses(prompt: string, classification = classifyTaskRequest(prompt)): RouterTaskClass[] {
  const classes: RouterTaskClass[] = ['request_understanding'];
  const add = (value: RouterTaskClass) => {
    if (!classes.includes(value)) classes.push(value);
  };
  if (/\b(repo|repository|codebase|existing project)\b/i.test(prompt)) add('repository_analysis');
  if (/\b(architect|design system|system design|schema)\b/i.test(prompt)) add('architecture');
  if (classification.requiresResearch) add(/\b(x\.com|twitter)\b/i.test(prompt) ? 'x_research' : 'web_research');
  if (/\b(crypto|blockchain|wallet|smart contract)\b/i.test(prompt)) add('crypto_research');
  if (classification.intents.includes('build')) add('multi_file_implementation');
  if (classification.intents.includes('change')) add('code_generation');
  if (classification.intents.includes('repair')) add('bug_fixing');
  if (classification.intents.includes('recover')) add('recovery');
  if (classification.intents.includes('remove')) add('removal_cleanup');
  if (classification.intents.includes('migrate')) add('migration');
  if (classification.intents.includes('test')) add('test_generation');
  if (classification.intents.includes('review')) add('code_review');
  if (classification.requiredCapabilities.includes('security_review')) add('security_review');
  if (classification.requiredCapabilities.includes('authentication_integration')) add('authentication_implementation');
  if (classification.requiredCapabilities.includes('database_integration')) add('database_design');
  if (classification.requiredCapabilities.includes('github_operations')) add('github_operations');
  if (classification.requiredCapabilities.includes('vercel_operations')) add('vercel_operations');
  if (classification.intents.some((intent) => ['deploy', 'redeploy', 'rollback'].includes(intent))) add('deployment_troubleshooting');
  return classes.length === 1 && classification.primaryIntent === 'chat'
    ? [...classes, 'unknown']
    : classes;
}

function effectiveMode(requested: RoutingMode | undefined, complexity: ComplexityAssessment, highRisk: boolean): RoutingMode {
  if (requested) return requested;
  if (highRisk || complexity.level === 'critical') return 'intelligence';
  return getRouterAdminConfig().defaultMode;
}

function modelScore(
  model: RuntimeModelCapability,
  taskClass: RouterTaskClass,
  mode: RoutingMode,
  complexity: ComplexityAssessment,
  requiredTokens: number,
  framework?: string,
): number {
  if (!model.enabled || !model.configured || model.health.status === 'circuit_open') return -Infinity;
  if (model.configuredMonthlyBudgetUsd <= 0) return -Infinity;
  if (requiredTokens > model.maximumSafeRequestTokens) return -Infinity;
  const capability = CLASS_TO_CAPABILITY[taskClass];
  let score = model.strengths[capability] * 10;
  score += model.health.validationSuccessRate * 15;
  score -= model.health.recentFailureRate * 30;
  if (model.health.status === 'healthy') score += 8;
  if (model.health.status === 'degraded') score -= 15;
  const blendedCost = model.inputUsdPer1M + model.outputUsdPer1M;
  if (mode === 'cost') {
    score -= blendedCost * 6;
    score += model.typicalLatency === 'fast' ? 10 : model.typicalLatency === 'medium' ? 3 : 0;
  }
  if (mode === 'balanced') score -= blendedCost;
  if (mode === 'intelligence') score += model.strengths.architecture + model.strengths.review;
  if (complexity.level === 'high' || complexity.level === 'critical') {
    score += model.strengths.repository_analysis * 2;
  }
  if (model.credentialSource === 'user') score += 3;
  const historical = historicalModelQuality({ modelId: model.id, taskClass, framework });
  if (historical !== null) score += (historical - 0.5) * 20;
  return score;
}

export function rankModelsForSubtask(
  taskClass: RouterTaskClass,
  opts: {
    mode: RoutingMode;
    complexity: ComplexityAssessment;
    requiredTokens: number;
    registry?: RuntimeModelCapability[];
    budget?: RouterBudget;
    exclude?: ModelId[];
    framework?: string;
  },
): ModelId[] {
  const excluded = new Set(opts.exclude ?? []);
  const budgetCap = Math.min(
    opts.budget?.maximumTaskTokens ?? Number.POSITIVE_INFINITY,
    opts.budget?.remainingTokens ?? Number.POSITIVE_INFINITY,
  );
  if (budgetCap < opts.requiredTokens) return [];
  return (opts.registry ?? getRuntimeModelRegistry())
    .filter((model) => !excluded.has(model.id))
    .map((model) => ({
      id: model.id,
      score: modelScore(model, taskClass, opts.mode, opts.complexity, opts.requiredTokens, opts.framework),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.id);
}

function taskRisk(taskClass: RouterTaskClass, highRisk: boolean): RoutedSubtask['risk'] {
  if (highRisk && ['security_review', 'authentication_implementation', 'blockchain_integration'].includes(taskClass)) return 'critical';
  if (highRisk || ['architecture', 'migration', 'deployment_troubleshooting'].includes(taskClass)) return 'high';
  if (['multi_file_implementation', 'repository_analysis', 'bug_fixing'].includes(taskClass)) return 'medium';
  return 'low';
}

export function createIntelligentRoutePlan(input: {
  prompt: string;
  mode?: RoutingMode;
  repositoryFiles?: ProjectFile[];
  repositoryFileCount?: number;
  affectedFiles?: string[];
  affectedFileCount?: number;
  previousFailures?: number;
  budget?: RouterBudget;
  registry?: RuntimeModelCapability[];
}): IntelligentRoutePlan {
  const classification = classifyTaskRequest(input.prompt);
  const complexity = assessComplexity({
    prompt: input.prompt,
    repositoryFileCount: input.repositoryFileCount ?? input.repositoryFiles?.length,
    affectedFileCount: input.affectedFileCount ?? input.affectedFiles?.length,
    previousFailures: input.previousFailures,
  });
  const highRisk =
    classification.requiredCapabilities.some((id) => HIGH_RISK_CAPABILITIES.has(id)) ||
    /\b(auth(?:entication|orisation|orization)?|rls|row level security|payment|webhook|secret|encryption|wallet|smart contract|deployment infrastructure|irreversible)\b/i.test(input.prompt);
  const mode = effectiveMode(input.mode, complexity, highRisk);
  const taskClasses = inferTaskClasses(input.prompt, classification);
  const admin = getRouterAdminConfig();
  if (
    taskClasses.some((taskClass) => admin.forcedResearchTaskClasses.includes(taskClass)) &&
    !taskClasses.some((taskClass) => taskClass.includes('research') || taskClass === 'documentation_lookup')
  ) {
    taskClasses.splice(1, 0, 'documentation_lookup');
  }
  const totalCap = Math.min(admin.perTaskTokenCap, input.budget?.maximumTaskTokens ?? admin.perTaskTokenCap);
  const perTask = Math.max(1024, Math.floor(totalCap / Math.max(1, taskClasses.length)));
  const blockers: string[] = [];

  const subtasks = taskClasses.map<RoutedSubtask>((taskClass, index) => {
    const requiredTokens =
      ['repository_analysis', 'large_context_comprehension', 'architecture'].includes(taskClass)
        ? Math.min(perTask, 16_384)
        : Math.min(perTask, 8_192);
    const ranked = rankModelsForSubtask(taskClass, {
      mode,
      complexity,
      requiredTokens,
      registry: input.registry,
      budget: input.budget,
    });
    if (!ranked.length) blockers.push(`No healthy configured model can execute ${taskClass} within the current budget and context limits.`);
    return {
      id: `task-${index + 1}`,
      taskClass,
      objective: taskClass.replaceAll('_', ' '),
      requiredContext:
        taskClass === 'repository_analysis'
          ? ['repository instructions', 'project manifest', 'targeted file index']
          : taskClass.includes('research')
            ? ['research question', 'verified source results']
            : ['project manifest', 'relevant interfaces', 'target files', 'relevant tests'],
      expectedOutput: taskClass.includes('research') ? 'verified sources and concise findings' : 'structured result or controlled patches',
      allowedFiles: input.affectedFiles ?? [],
      dependsOn: index === 0 ? [] : [`task-${index}`],
      canRunConcurrently:
        index > 0 &&
        taskClass.includes('research') &&
        !taskClasses[index - 1]?.includes('research'),
      risk: taskRisk(taskClass, highRisk),
      selectedModel: ranked[0] ?? null,
      fallbackModels: ranked.slice(1, 4),
      validation: taskClass.includes('research')
        ? ['source retrieval', 'citation presence']
        : taskClass.includes('review')
          ? ['finding severity', 'actionable evidence']
          : ['patch applicability', 'typecheck', 'tests', 'build'],
      tokenBudget: requiredTokens,
      timeoutMs: complexity.level === 'critical' ? 180_000 : complexity.level === 'high' ? 120_000 : 60_000,
      blocker: ranked.length ? undefined : blockers.at(-1),
    };
  });

  const reviewRequired =
    admin.requireHighRiskReview &&
    (highRisk || complexity.level === 'critical' || (input.affectedFileCount ?? input.affectedFiles?.length ?? 0) > 12 || (input.previousFailures ?? 0) >= 2);
  if (reviewRequired) {
    const implementationModels = subtasks
      .filter((task) => ['ui_generation', 'backend_generation', 'code_generation', 'multi_file_implementation', 'integration_implementation', 'bug_fixing', 'refactoring'].includes(task.taskClass))
      .map((task) => task.selectedModel)
      .filter(Boolean) as ModelId[];
    const ranked = rankModelsForSubtask('security_review', {
      mode: 'intelligence',
      complexity,
      requiredTokens: Math.min(perTask, 8_192),
      registry: input.registry,
      budget: input.budget,
      exclude: [...new Set(implementationModels)],
    });
    if (!ranked.length) blockers.push('Independent review is required but no distinct healthy configured review model is available.');
    subtasks.push({
      id: `task-${subtasks.length + 1}`,
      taskClass: highRisk ? 'security_review' : 'code_review',
      objective: 'independently review validated changes',
      requiredContext: ['changed files', 'validation results', 'security findings'],
      expectedOutput: 'structured review findings without private reasoning',
      allowedFiles: [],
      dependsOn: subtasks.length ? [subtasks.at(-1)!.id] : [],
      canRunConcurrently: false,
      risk: highRisk ? 'critical' : 'high',
      selectedModel: ranked[0] ?? null,
      fallbackModels: ranked.slice(1, 4),
      validation: ['finding evidence', 'no unresolved critical findings'],
      tokenBudget: Math.min(perTask, 8_192),
      timeoutMs: 120_000,
      blocker: ranked.length ? undefined : blockers.at(-1),
    });
  }

  return {
    mode,
    classification,
    complexity,
    subtasks,
    reviewRequired,
    contextStrategy: {
      useRepositoryIndex: Boolean((input.repositoryFileCount ?? input.repositoryFiles?.length ?? 0) > 0),
      includeFullRepository: false,
      maximumContextTokens: Math.min(
        totalCap,
        Math.max(...subtasks.map((task) => task.tokenBudget), 1024),
      ),
      rules: [
        'include repository instructions and relevant interfaces',
        'retrieve only target files and relevant tests',
        'summarize unchanged large files',
        'exclude secrets and unrelated logs',
      ],
    },
    blockers: [...new Set(blockers)],
  };
}

export function repairTaskClass(category: FailureCategory): RouterTaskClass {
  if (category === 'type' || category === 'syntax') return 'validation_repair';
  if (category === 'dependency' || category === 'structural') return 'build_debugging';
  if (category === 'deployment') return 'deployment_troubleshooting';
  if (category === 'runtime' || category === 'integration') return 'runtime_debugging';
  return 'recovery';
}

export function fallbackOrderForModel(preferred: ModelId): ModelId[] {
  const registry = getRuntimeModelRegistry();
  const model = registry.find((entry) => entry.id === preferred);
  const candidates = [preferred, ...(model?.preferredFallbacks ?? [])];
  return [...new Set(candidates)].filter((id) => {
    const entry = registry.find((item) => item.id === id);
    return entry?.enabled && entry.configured && entry.health.status !== 'circuit_open';
  });
}

export function selectRepairModel(
  category: FailureCategory,
  exclude: ModelId[] = [],
): ModelId | null {
  return rankModelsForSubtask(repairTaskClass(category), {
    mode: category === 'deployment' || category === 'integration' ? 'intelligence' : 'balanced',
    complexity: {
      score: 55,
      level: 'high',
      signals: [`${category} validation failure`],
    },
    requiredTokens: 8_192,
    exclude,
  })[0] ?? null;
}
