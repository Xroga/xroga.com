import { createHash, randomUUID } from 'crypto';
import type { ProjectFile } from '../ai/patches.js';
import {
  createCanonicalExecutionState,
  ExecutionScheduler,
  type CanonicalExecutionState,
  type ExecutableTaskNode,
  type ExecutionEvidence,
  type ExecutionEvent,
  type ExecutionStateStore,
  type TaskHandler,
} from '../ai/executionRuntime.js';
import {
  buildCapabilityGraph,
  compileCapabilitySpecifications,
  validateCapabilityGraph,
  type CompiledCapabilityPlan,
  type DynamicCapabilityGraph,
} from './capabilityGraph.js';
import {
  dependencyInventory,
  selectArchitecture,
  selectFrameworkAdapter,
  type ArchitectureDecision,
  type FrameworkAdapter,
} from './adapters.js';
import { synthesizeProductDefinition, type ProductDefinitionV1 } from './productDefinition.js';

export interface UniversalSynthesisArtifacts {
  schemaVersion: '1.0.0';
  migrationPath: string[];
  productDefinition: ProductDefinitionV1;
  capabilityGraph: DynamicCapabilityGraph;
  compiledPlan: CompiledCapabilityPlan;
  architecture: ArchitectureDecision;
  framework: FrameworkAdapter;
  dependencyInventory: ReturnType<typeof dependencyInventory>;
  evidenceHash: string;
}

export interface UniversalSynthesisResult {
  state: CanonicalExecutionState;
  artifacts: UniversalSynthesisArtifacts;
}

const stages = [
  ['synthesis-understand', 'Derive a versioned product definition from the requested outcome and repository', 'synthesis_understanding', []],
  ['synthesis-capabilities', 'Build and validate the dynamic capability graph', 'synthesis_capability_graph', ['synthesis-understand']],
  ['synthesis-architecture', 'Select architecture and framework contracts from required behavior', 'synthesis_architecture', ['synthesis-capabilities']],
  ['synthesis-compile', 'Compile capability specifications into executable Command 1 task nodes', 'synthesis_compile', ['synthesis-architecture']],
  ['synthesis-evidence', 'Persist the coherent synthesis manifest and evidence digest', 'synthesis_evidence', ['synthesis-compile']],
] as const;

function stageTask(stage: typeof stages[number]): ExecutableTaskNode {
  return {
    id: stage[0], objective: stage[1], operationType: stage[2], requiredCapabilities: [stage[2]],
    selectedRuntime: 'deterministic_synthesis_runtime', selectedProvider: null, selectedModel: null,
    requiredContextReferences: ['user_outcome', 'repository_file_metadata'], allowedFiles: [],
    expectedOutputSchema: { schemaVersion: '1.0.0', type: stage[2] }, dependencies: [...stage[3]],
    riskLevel: 'low', timeoutMs: 30_000,
    retryPolicy: { maximumAttempts: 1, initialBackoffMs: 0, maximumBackoffMs: 0 }, budget: {},
    validationMethod: ['schema validation', 'cross-reference validation'],
    evidenceRequirements: ['content-addressed synthesis evidence'], fallbackRoutes: [],
    status: stage[3].length ? 'pending' : 'ready', attempts: 0, evidence: [],
  };
}

export function createSynthesisStageTasks(): ExecutableTaskNode[] {
  return stages.map(stageTask);
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function evidence(kind: string, summary: string, value: unknown): ExecutionEvidence {
  return { id: randomUUID(), kind, summary, identifier: `sha256:${stableHash(value)}`, timestamp: new Date().toISOString() };
}

/**
 * Executes Part 2A synthesis as real Command 1 scheduler tasks. The runtime owns one
 * canonical state; every stage consumes and updates that state instead of producing
 * disconnected model-specific project versions.
 */
export async function runUniversalSynthesisFoundation(input: {
  prompt: string;
  projectId: string;
  runId: string;
  files: ProjectFile[];
  store: ExecutionStateStore;
  repository?: CanonicalExecutionState['repository'];
  selectedBranch?: string;
  startingCommitSha?: string | null;
  onEvent?: (event: ExecutionEvent) => void;
}): Promise<UniversalSynthesisResult> {
  let definition: ProductDefinitionV1 | undefined;
  let graph: DynamicCapabilityGraph | undefined;
  let architecture: ArchitectureDecision | undefined;
  let framework: FrameworkAdapter | undefined;
  let compiledPlan: CompiledCapabilityPlan | undefined;
  let inventory: ReturnType<typeof dependencyInventory> | undefined;

  const state = createCanonicalExecutionState({
    projectId: input.projectId, runId: input.runId, repository: input.repository,
    selectedBranch: input.selectedBranch, startingCommitSha: input.startingCommitSha,
    files: input.files, tasks: createSynthesisStageTasks(),
  });

  const handlers: Record<string, TaskHandler> = {
    synthesis_understanding: async () => {
      definition = synthesizeProductDefinition({ prompt: input.prompt, repositoryFiles: input.files });
      state.productManifest.productDefinition = definition;
      state.requiredCapabilities = [...new Set(definition.functionalRequirements.map((item) => item.id))];
      const workflowCount = definition.criticalWorkflows.length + definition.secondaryWorkflows.length;
      return { output: definition, evidence: [evidence('product_definition', `Specified ${definition.functionalRequirements.length} requirements and ${workflowCount} workflows`, definition)], validated: definition.schemaVersion === '1.0.0' };
    },
    synthesis_capability_graph: async () => {
      if (!definition) throw new Error('product definition is unavailable');
      graph = buildCapabilityGraph(definition);
      const errors = validateCapabilityGraph(graph);
      if (errors.length) throw new Error(`invalid capability graph: ${errors.join('; ')}`);
      state.productManifest.capabilityGraph = graph;
      return { output: graph, evidence: [evidence('capability_graph', `Validated ${graph.nodes.length} capability nodes and ${graph.relationships.length} relationships`, graph)], validated: true };
    },
    synthesis_architecture: async () => {
      if (!definition || !graph) throw new Error('synthesis inputs are unavailable');
      architecture = selectArchitecture(definition, graph);
      framework = selectFrameworkAdapter(architecture, input.files);
      inventory = dependencyInventory(input.files);
      if (inventory.blockers.length) throw new Error(`dependency inventory blocked verification: ${inventory.blockers.join('; ')}`);
      state.productManifest.architecture = architecture;
      state.productManifest.framework = framework;
      state.productManifest.dependencyInventory = inventory;
      state.architectureDecisions = [`${architecture.primary}: ${architecture.reasoning.join('; ')}`, `framework:${framework.id}`];
      return { output: { architecture, framework, dependencyInventory: inventory }, evidence: [evidence('architecture_decision', `Selected ${architecture.primary} with ${framework.id}`, { architecture, framework })], validated: Boolean(framework.buildCommand || architecture.primary === 'static_site') };
    },
    synthesis_compile: async () => {
      if (!definition || !graph) throw new Error('synthesis inputs are unavailable');
      compiledPlan = compileCapabilitySpecifications(graph, definition);
      state.productManifest.compiledCapabilityPlan = compiledPlan;
      return { output: compiledPlan, evidence: [evidence('compiled_capability_plan', `Compiled ${compiledPlan.tasks.length} executable tasks with validation and evidence requirements`, compiledPlan)], validated: compiledPlan.tasks.every((task) => task.status !== 'completed' && task.validationMethod.length > 0 && task.evidenceRequirements.length > 0) };
    },
    synthesis_evidence: async () => {
      if (!definition || !graph || !compiledPlan || !architecture || !framework || !inventory) throw new Error('synthesis is incomplete');
      const manifest = { schemaVersion: '1.0.0', definition, graph, compiledPlan, architecture, framework, inventory };
      const digest = stableHash(manifest);
      state.productManifest.synthesisEvidenceHash = digest;
      return { output: { digest }, evidence: [evidence('synthesis_manifest', 'Persisted one coherent, content-addressed synthesis manifest', manifest)], validated: digest.length === 64 };
    },
  };

  await new ExecutionScheduler(input.store, input.onEvent).run(state, handlers);
  const failed = state.tasks.find((task) => task.status !== 'completed');
  if (failed) throw new Error(`universal synthesis failed at ${failed.id}: ${failed.blocker ?? failed.status}`);
  if (!definition || !graph || !compiledPlan || !architecture || !framework || !inventory) throw new Error('universal synthesis did not produce all artifacts');
  return {
    state,
    artifacts: {
      schemaVersion: '1.0.0', migrationPath: ['1.0.0 is the initial universal-synthesis artifact schema'], productDefinition: definition, capabilityGraph: graph,
      compiledPlan, architecture, framework, dependencyInventory: inventory,
      evidenceHash: String(state.productManifest.synthesisEvidenceHash),
    },
  };
}
