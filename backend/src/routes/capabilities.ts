import { Router } from 'express';
import { getCapabilityRegistry } from '../lib/capabilityRegistry.js';
import { createAdaptiveExecutionPlan } from '../lib/adaptiveOrchestrator.js';
import type { ProjectContext } from '../lib/adaptiveOrchestrator.js';
import type { StorageProviderId, StorageProviderState } from '../lib/storageSelection.js';
import type { ProviderCandidate } from '../lib/providerResolver.js';
import type { ModelId } from '../ai/models.js';

const router = Router();

const STORAGE_IDS = new Set<StorageProviderId>([
  'existing', 'supabase', 'upstash-redis', 'upstash-vector', 'neon', 'postgres',
  'mysql', 'mongodb', 'firebase', 'cloudflare', 'vercel-blob', 'sqlite',
  'local-files', 'object-storage', 'self-hosted',
]);
const MODEL_IDS = new Set<ModelId>([
  'kimi_k3', 'glm_5_2', 'deepseek_v4_pro', 'deepseek_v4_flash', 'grok_4_5', 'grok_4_3',
]);

function storageStates(value: unknown): StorageProviderState[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    if (
      typeof item.id !== 'string' ||
      !STORAGE_IDS.has(item.id as StorageProviderId) ||
      typeof item.configured !== 'boolean'
    ) return [];
    return [{
      id: item.id as StorageProviderId,
      configured: item.configured,
      healthy: typeof item.healthy === 'boolean' ? item.healthy : undefined,
    }];
  });
}

function providerCandidates(value: unknown): ProviderCandidate[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    if (
      typeof item.id !== 'string' ||
      !MODEL_IDS.has(item.id as ModelId) ||
      typeof item.configured !== 'boolean' ||
      !Array.isArray(item.supports) ||
      !item.supports.every((operation) => typeof operation === 'string')
    ) return [];
    return [{
      id: item.id,
      configured: item.configured,
      healthy: typeof item.healthy === 'boolean' ? item.healthy : undefined,
      supports: item.supports as string[],
      priority: typeof item.priority === 'number' ? item.priority : undefined,
      failureReason: typeof item.failureReason === 'string' ? item.failureReason : undefined,
    }];
  });
}

function projectContext(value: unknown): ProjectContext {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  return {
    repositoryPresent:
      typeof candidate.repositoryPresent === 'boolean'
        ? candidate.repositoryPresent
        : undefined,
    existingStorage: storageStates(candidate.existingStorage),
    availableStorage: storageStates(candidate.availableStorage),
    modelProviders: providerCandidates(candidate.modelProviders),
  };
}

router.get('/', (_req, res) => {
  res.json({
    generatedAt: new Date().toISOString(),
    capabilities: getCapabilityRegistry(),
  });
});

router.post('/plan', (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const context = typeof req.body?.context === 'string' ? req.body.context.trim() : '';
  if (!prompt) {
    res.status(400).json({
      error: 'prompt is required',
      code: 'PROMPT_REQUIRED',
      status: 'blocked',
    });
    return;
  }

  const project = projectContext(req.body?.project);
  res.json(createAdaptiveExecutionPlan(prompt, context, project));
});

export default router;
