const APP_PAGE = "index.html";

chrome.action.onClicked.addListener(async () => {
  const appUrl = chrome.runtime.getURL(APP_PAGE);
  const tabs = await chrome.tabs.query({});
  const existingTab = tabs.find((tab) => tab.url?.startsWith(appUrl));

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { active: true });
    if (existingTab.windowId !== undefined) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: appUrl, active: true });
});
