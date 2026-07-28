import { getSupabasePublicConfig } from './config';

export async function requireGitHubProvider(): Promise<void> {
  const config = getSupabasePublicConfig();
  const response = await fetch(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.publishableKey },
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('Authentication provider status unavailable');

  const settings = await response.json() as { external?: { github?: boolean } };
  if (settings.external?.github !== true) {
    throw new Error('GitHub provider is not enabled');
  }
}
