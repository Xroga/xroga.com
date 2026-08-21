import { clearOAuthResult } from './oauthPopupResult';

export interface GitHubOAuthOpenResult {
  opened: boolean;
  /** Kept for callers shared with popup-based providers; GitHub returns null. */
  popup: Pick<Window, 'closed' | 'close'> | null;
  error?: string;
}

interface GitHubOAuthDependencies {
  resolveUrl?: () => Promise<{ url: string }>;
  navigateSameTab?: (url: string) => void;
}

/**
 * Resolve the authenticated authorize URL and continue in the current tab.
 *
 * The callback explicitly supports returning without `window.opener`. A same-tab
 * redirect therefore avoids popup blockers, embedded-browser popup sinks, and
 * blank windows while preserving the normal OAuth round trip.
 */
export async function openGitHubOAuthPopup(
  deps: GitHubOAuthDependencies = {},
): Promise<GitHubOAuthOpenResult> {
  clearOAuthResult();

  const navigateSameTab = deps.navigateSameTab ?? ((url: string) => window.location.assign(url));
  const resolveUrl =
    deps.resolveUrl ??
    (async () => {
      const { api } = await import('./api');
      return api.github.oauthUrl();
    });

  try {
    const { url } = await resolveUrl();
    if (!url) {
      return { opened: false, popup: null, error: 'GitHub OAuth is not configured' };
    }

    navigateSameTab(url);
    return { opened: true, popup: null };
  } catch (error) {
    return {
      opened: false,
      popup: null,
      error: (error as Error).message || 'Could not start GitHub authorization',
    };
  }
}
