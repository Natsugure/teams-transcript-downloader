type TabState = {
  available: boolean;
  reason?: string;
  lastChecked: number;
};

const tabStates = new Map<number, TabState>();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    checkAndUpdateTabState(tabId, tab.url);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id) {
    checkAndUpdateTabState(tab.id, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

// Cleanup inactive tabs after threshold (memory optimization)
chrome.tabs.onActivated.addListener(() => {
  const now = Date.now();
  const CLEANUP_THRESHOLD = 30 * 60 * 1000; // 30 minutes

  for (const [tabId, state] of tabStates.entries()) {
    if (now - state.lastChecked > CLEANUP_THRESHOLD) {
      tabStates.delete(tabId);
    }
  }
});


function checkAndUpdateTabState(tabId: number, url?: string) {
  if (!url) {
    return;
  }

  // Only process http/https URLs to avoid errors on chrome://, edge://, etc.
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  const isStreamPage = /^https:\/\/.*\.sharepoint\.com\/.*\/stream\.aspx/.test(url);

  if (!isStreamPage) {
    setTabUnavailable(tabId, chrome.i18n.getMessage('transcriptUnavailable'));
  } else {
    setTabChecking(tabId);
  }
}


function setTabChecking(tabId: number) {
  chrome.action.setIcon({
    tabId,
    path: {
      '16': 'icon16-disabled.png',
      '48': 'icon48-disabled.png',
      '128': 'icon128-disabled.png'
    }
  });
  chrome.action.setTitle({
    tabId,
    title: chrome.i18n.getMessage('checkingTranscript')
  });
  tabStates.set(tabId, {
    available: false,
    reason: chrome.i18n.getMessage('reasonChecking'),
    lastChecked: Date.now()
  });
}


function setTabAvailable(tabId: number) {
  chrome.action.setIcon({
    tabId,
    path: {
      '16': 'icon16.png',
      '48': 'icon48.png',
      '128': 'icon128.png'
    }
  });
  chrome.action.setTitle({
    tabId,
    title: chrome.i18n.getMessage('defaultTitle')
  });
  tabStates.set(tabId, {
    available: true,
    lastChecked: Date.now()
  });
}


function setTabUnavailable(tabId: number, reason: string) {
  chrome.action.setIcon({
    tabId,
    path: {
      '16': 'icon16-disabled.png',
      '48': 'icon48-disabled.png',
      '128': 'icon128-disabled.png'
    }
  });
  chrome.action.setTitle({
    tabId,
    title: reason
  });
  tabStates.set(tabId, {
    available: false,
    reason,
    lastChecked: Date.now()
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'updateAvailability' && sender.tab?.id) {
    const tabId = sender.tab.id;

    if (message.available) {
      setTabAvailable(tabId);
    } else {
      setTabUnavailable(
        tabId,
        chrome.i18n.getMessage('transcriptUnavailableWithReason', [
          message.reason || chrome.i18n.getMessage('reasonUnknown')
        ])
      );
    }
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    console.error('[Teams Transcript Downloader] Tab ID not found');
    return;
  }

  const tabState = tabStates.get(tab.id);

  // If state is unknown or unavailable, show notification
  if (!tabState || !tabState.available) {
    console.log('[Teams Transcript Downloader] Transcript unavailable:', tabState?.reason || 'Unknown');

    // Show notification if API is available
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128-disabled.png',
        title: chrome.i18n.getMessage('notificationTitle'),
        message: tabState?.reason || chrome.i18n.getMessage('notificationMessage')
      });
    }
    return;
  }

  // Send message to content script to download transcript
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'downloadTranscript'
    });

    if (response?.success) {
      console.log('[Teams Transcript Downloader] Download successful:', response.filename);
    } else {
      console.error('[Teams Transcript Downloader] Download failed:', response?.error);
      // Update state on error
      setTabUnavailable(tab.id, response?.error || chrome.i18n.getMessage('errorDownloadFailed'));
    }
  } catch (error) {
    console.error('[Teams Transcript Downloader] Message send error:', error);
    setTabUnavailable(tab.id, chrome.i18n.getMessage('errorCommunication'));
  }
});

// Initialize existing tabs when extension is installed
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      checkAndUpdateTabState(tab.id, tab.url);
    }
  }
});

// Initialize existing tabs when service worker starts
chrome.runtime.onStartup.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      checkAndUpdateTabState(tab.id, tab.url);
    }
  }
});
