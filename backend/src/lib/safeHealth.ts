export function publicHealthPayload(now = new Date()): Record<string, unknown> {
  const release = process.env.XROGA_RELEASE_SHA?.match(/^[a-f0-9]{7,40}$/i)?.[0] ?? 'unavailable';
  return {
    status: 'ok', service: 'xroga-api', version: '3.0.0-ai-swarm',
    release, capabilities: ['chat', 'build', 'github', 'deployment'], timestamp: now.toISOString(),
  };
}
