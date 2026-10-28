import { getSupabasePublicConfig } from './config';

export async function requireOAuthProvider(provider: 'github' | 'google'): Promise<void> {
  const config = getSupabasePublicConfig();
  const response = await fetch(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.publishableKey },
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('Authentication provider status unavailable');

  const settings = await response.json() as { external?: { github?: boolean; google?: boolean } };
  if (settings.external?.[provider] !== true) {
    throw new Error(`${provider === 'google' ? 'Google' : 'GitHub'} provider is not enabled`);
  }
}

export const requireGitHubProvider = () => requireOAuthProvider('github');
