chrome.action.onClicked.addListener((tab) => {
  // Chrome grants activeTab for the action click. Its built-in side-panel
  // toggle skips that grant, so open the panel from the click handler.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
    console.warn("Xroga could not open the side panel.", error.message);
  });
});
