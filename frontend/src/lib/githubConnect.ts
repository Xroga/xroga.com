import { clearOAuthResult } from './oauthPopupResult';

type GitHubOAuthPopup = Pick<Window, 'close' | 'focus'> & {
  readonly closed: boolean;
  location: Pick<Location, 'href'>;
};

export interface GitHubOAuthOpenResult {
  opened: boolean;
  popup: GitHubOAuthPopup | null;
  error?: string;
}

interface GitHubOAuthDependencies {
  resolveUrl?: () => Promise<{ url: string }>;
  openWindow?: () => GitHubOAuthPopup | null;
  navigateSameTab?: (url: string) => void;
}

/**
 * Open the blank OAuth window synchronously while the click still owns browser
 * activation, then resolve the authenticated authorize URL. Waiting for the API
 * before `window.open` makes real browsers silently block the popup.
 */
export async function openGitHubOAuthPopup(
  deps: GitHubOAuthDependencies = {},
): Promise<GitHubOAuthOpenResult> {
  clearOAuthResult();

  const openWindow =
    deps.openWindow ??
    (() =>
      window.open(
        'about:blank',
        'xroga-github-oauth',
        'width=600,height=720,scrollbars=yes,resizable=yes',
      ));
  const navigateSameTab = deps.navigateSameTab ?? ((url: string) => window.location.assign(url));
  const resolveUrl =
    deps.resolveUrl ??
    (async () => {
      const { api } = await import('./api');
      return api.github.oauthUrl();
    });

  // This must stay before the first await.
  const popup = openWindow();

  try {
    const { url } = await resolveUrl();
    if (!url) {
      popup?.close();
      return { opened: false, popup: null, error: 'GitHub OAuth is not configured' };
    }

    if (!popup) {
      navigateSameTab(url);
      return { opened: true, popup: null };
    }

    try {
      popup.location.href = url;
      popup.focus();
      return { opened: true, popup };
    } catch {
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      navigateSameTab(url);
      return { opened: true, popup: null };
    }
  } catch (error) {
    try {
      popup?.close();
    } catch {
      /* ignore */
    }
    return {
      opened: false,
      popup: null,
      error: (error as Error).message || 'Could not start GitHub authorization',
    };
  }
}
