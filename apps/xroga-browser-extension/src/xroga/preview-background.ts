import { getWorkspaceExtensionStatus } from './workspace';

chrome.action.onClicked.addListener(tab => {
  // The toolbar gesture grants activeTab for the selected tab.
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
});

chrome.runtime.onMessageExternal.addListener((message: unknown, sender, reply) => {
  const status = getWorkspaceExtensionStatus(message, sender);
  if (status) reply(status);
});
