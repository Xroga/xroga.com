import { MODELS, resolveModelSpec, type ModelId } from '../../ai/models.js';
import { getModelRuntimeHealth } from '../../ai/providerRuntime.js';
import { getRouterAdminConfig } from '../../ai/routerConfig.js';

/** Connected-app planning has one approved model and no expensive model fallback.
 * Tool execution remains in the existing Composio + authority + budget pipeline. */
export function connectedAppModelRoute(
  env: NodeJS.ProcessEnv = process.env,
  healthy: (id: ModelId) => boolean = id => getModelRuntimeHealth(id).status !== 'circuit_open',
): readonly ModelId[] {
  const id: ModelId = 'deepseek_v4_1_flash_1017';
  const model = MODELS[id];
  const config = getRouterAdminConfig(env);
  if (model.provider !== 'zurelay' || model.baseUrl !== 'https://api.zurelay.com/v1'
    || model.secretKey !== 'ZURELAY_API_KEY' || !resolveModelSpec(id, env)
    || !env.ZURELAY_API_KEY?.trim() || !config.allowedModels.includes(id)
    || !config.enabledProviders.includes('zurelay') || !healthy(id)) {
    throw Object.assign(new Error('Connected-app model is unavailable. No alternate provider was charged.'), {
      code: 'CONNECTED_APP_MODEL_UNAVAILABLE', status: 503,
    });
  }
  return [id];
}
