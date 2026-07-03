export const GITHUB_CONNECTED_EVENT = 'xroga-github-connected';

export interface GitHubConnectedDetail {
  username?: string;
}

export function dispatchGitHubConnected(username?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<GitHubConnectedDetail>(GITHUB_CONNECTED_EVENT, { detail: { username } })
  );
}
