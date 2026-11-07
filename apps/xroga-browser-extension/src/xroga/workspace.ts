// Xroga modification. Discovery is public information and conveys no task authority.
export const WORKSPACE_URL = 'https://xroga.com/workspace';
const WORKSPACE_ORIGIN = new URL(WORKSPACE_URL).origin;

export function getWorkspaceExtensionStatus(
  message: unknown,
  sender: { origin?: string; url?: string; frameId?: number },
) {
  if (sender.origin !== WORKSPACE_ORIGIN || sender.frameId !== 0 || typeof sender.url !== 'string') return;
  try {
    const url = new URL(sender.url);
    if (url.origin !== WORKSPACE_ORIGIN || url.pathname !== '/workspace') return;
  } catch {
    return;
  }
  if (
    !message ||
    typeof message !== 'object' ||
    Object.keys(message).length !== 1 ||
    !Object.hasOwn(message, 'type') ||
    (message as { type: unknown }).type !== 'xroga.browser.status.v1'
  ) {
    return;
  }
  return { protocol: 1, installed: true, paired: false } as const;
}
