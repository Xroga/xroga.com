/**
 * Production bindings for change execution. Nothing here is a second runtime: model selection is Xroga's own coding router, the agent is
 * the existing AgentSoftwareExecutor (Cline), execution is the existing isolation boundary, and GitHub writes are the existing
 * atomic writer with the connected account's own token.
 */
import type { AgentSoftwareExecutorInput } from '../../ai/softwareAgent/AgentSoftwareExecutor.js';
import { ExistingSourceError, type SourceBinding } from '../types.js';
import type { DeliveryApi } from './delivery.js';
import type { AgentRunner } from './service.js';
import type { ExecutionPort } from './testRunner.js';

/** Test and build commands run only inside the existing sandbox runtime; with no runtime that can isolate them, they do not run. */
export const productionExecutionPort: ExecutionPort = {
  async execute(request) {
    const { googleProjectRuntimeSelected } = await import('../../synthesis/projectRuntime/googleFactory.js');
    if (googleProjectRuntimeSelected()) {
      // The Google runtime admits execution only for a canonical run attempt that owns the checkout. An existing-project change does not
      // have one yet, and manufacturing that authority here would bypass the admission rule it exists to enforce.
      throw new ExistingSourceError('EXECUTION_UNAVAILABLE', 'Isolated execution on the Google runtime needs a canonical run for this change, which is not connected yet.');
    }
    const { executeSandboxed } = await import('../../sandbox/sandboxRuntime.js');
    return executeSandboxed(request);
  },
};

export const productionAgentRunner: AgentRunner = async (input) => {
  const { AgentSoftwareExecutor } = await import('../../ai/softwareAgent/AgentSoftwareExecutor.js');
  return new AgentSoftwareExecutor().execute(input);
};

/** The coding model Xroga's router picks right now, with its ordered fallbacks. No selection means no run, never a guess. */
export async function selectCodingModelRoute(userId: string, runId: string): Promise<AgentSoftwareExecutorInput['model']> {
  const [{ routeByCapability }, { capabilityCandidates }, { createXrogaAgentModelRoute }] = await Promise.all([
    import('../../ai/capabilityRouter.js'), import('../../synthesis/universalEntrypoint.js'), import('../../ai/softwareAgent/xrogaAgentModel.js'),
  ]);
  const route = routeByCapability({ capability: 'coding', requiredContextTokens: 32_000, needsStructuredOutput: true }, capabilityCandidates());
  if (!route.selected) throw new ExistingSourceError('EXECUTION_UNAVAILABLE', 'No coding model is available right now. Try again shortly.');
  return createXrogaAgentModelRoute({ userId, runId, modelId: route.selected.modelId as never, fallbackModelIds: route.fallbacks.map((m) => m.modelId) as never });
}

/** The atomic GitHub write transport for one repository, using the connected account's own token. */
export async function githubDeliveryApi(userId: string, binding: SourceBinding): Promise<DeliveryApi> {
  const [{ getGitHubToken }, { ghFetch }, { makeAtomicWriteApi }] = await Promise.all([
    import('../../services/integrations/githubAuth.js'), import('../../services/integrations/githubDeploy.js'), import('../../services/integrations/githubAtomicTransport.js'),
  ]);
  const token = await getGitHubToken(userId);
  if (!token) throw new ExistingSourceError('GITHUB_NOT_CONNECTED', 'Connect your GitHub account to continue.');
  const [owner, repo] = binding.repositoryFullName.split('/');
  if (!owner || !repo) throw new ExistingSourceError('DELIVERY_REFUSED', 'The repository name is not usable.');
  return makeAtomicWriteApi(ghFetch, token, owner, repo) as DeliveryApi;
}
