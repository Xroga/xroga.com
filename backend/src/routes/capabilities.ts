import { Router } from 'express';
import { getCapabilityRegistry } from '../lib/capabilityRegistry.js';
import { classifyTaskRequest } from '../lib/taskClassifier.js';

const router = Router();

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

  const classification = classifyTaskRequest(prompt, context);
  const registry = getCapabilityRegistry();
  const selectedCapabilities = classification.requiredCapabilities.map((id) => {
    const capability = registry.find((entry) => entry.id === id);
    if (!capability) throw new Error(`Capability registry missing ${id}`);
    return capability;
  });

  res.json({
    status: 'completed',
    classification,
    capabilities: selectedCapabilities,
  });
});

export default router;
