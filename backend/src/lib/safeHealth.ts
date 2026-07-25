export function publicHealthPayload(now = new Date()): Record<string, unknown> {
  return {
    status: 'ok', service: 'xroga-api', version: '3.0.0-ai-swarm',
    capabilities: ['chat', 'build', 'github', 'deployment'], timestamp: now.toISOString(),
  };
}
