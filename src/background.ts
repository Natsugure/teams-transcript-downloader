// Background Service Worker

// タブごとの可用性状態を管理
type TabState = {
  available: boolean;
  reason?: string;
  lastChecked: number;
};

const tabStates = new Map<number, TabState>();

// タブが更新されたときにアイコンをチェック
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // URLが変更された場合、または読み込みが完了した場合にチェック
  if (changeInfo.url || changeInfo.status === 'complete') {
    checkAndUpdateTabState(tabId, tab.url);
  }
});

// タブが作成されたときもチェック
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id) {
    checkAndUpdateTabState(tab.id, tab.url);
  }
});

// タブが閉じられたときにクリーンアップ
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

// タブが非アクティブになって一定時間経過したらクリーンアップ（メモリ節約）
chrome.tabs.onActivated.addListener(() => {
  const now = Date.now();
  const CLEANUP_THRESHOLD = 30 * 60 * 1000; // 30分
  
  for (const [tabId, state] of tabStates.entries()) {
    if (now - state.lastChecked > CLEANUP_THRESHOLD) {
      tabStates.delete(tabId);
    }
  }
});

// タブの状態をチェックして更新する関数
function checkAndUpdateTabState(tabId: number, url?: string) {
  if (!url) {
    // URLがない場合は無効状態
    setTabUnavailable(tabId, 'このページではトランスクリプトをダウンロードできません');
    return;
  }

  const isStreamPage = /^https:\/\/.*\.sharepoint\.com\/.*\/stream\.aspx/.test(url);

  if (!isStreamPage) {
    // stream.aspxページでない場合は無効状態
    setTabUnavailable(tabId, 'このページではトランスクリプトをダウンロードできません');
  } else {
    // stream.aspxページの場合は確認中状態（content scriptが後で更新）
    setTabChecking(tabId);
  }
}

// ヘルパー関数: 確認中状態に設定
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
    title: 'トランスクリプトを確認中...'
  });
  tabStates.set(tabId, {
    available: false,
    reason: '確認中',
    lastChecked: Date.now()
  });
}

// ヘルパー関数: 利用可能状態に設定
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
    title: 'トランスクリプトをダウンロード'
  });
  tabStates.set(tabId, {
    available: true,
    lastChecked: Date.now()
  });
}

// ヘルパー関数: 利用不可状態に設定
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

// content scriptからのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'updateAvailability' && sender.tab?.id) {
    const tabId = sender.tab.id;

    if (message.available) {
      setTabAvailable(tabId);
    } else {
      setTabUnavailable(
        tabId,
        `トランスクリプトをダウンロードできません: ${message.reason || '不明なエラー'}`
      );
    }
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    console.error('タブIDが取得できませんでした');
    return;
  }

  const tabState = tabStates.get(tab.id);
  
  // 状態が未確認または利用不可の場合
  if (!tabState || !tabState.available) {
    console.log('トランスクリプトが利用できません:', tabState?.reason || '未確認');
    
    // オプション: ユーザーに通知を表示
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128-disabled.png',
        title: 'トランスクリプトをダウンロードできません',
        message: tabState?.reason || 'トランスクリプトが見つかりませんでした'
      });
    }
    return;
  }

  // アクティブなタブにメッセージを送信
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { 
      action: 'downloadTranscript' 
    });
    
    if (response?.success) {
      console.log('ダウンロード成功:', response.filename);
    } else {
      console.error('ダウンロード失敗:', response?.error);
      // エラー時は状態を更新
      setTabUnavailable(tab.id, response?.error || 'ダウンロードに失敗しました');
    }
  } catch (error) {
    console.error('メッセージ送信エラー:', error);
    setTabUnavailable(tab.id, 'Content scriptとの通信に失敗しました');
  }
});

// 拡張機能起動時に既存のタブを初期化
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      checkAndUpdateTabState(tab.id, tab.url);
    }
  }
});

// Service Worker起動時にも既存のタブを初期化
chrome.runtime.onStartup.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      checkAndUpdateTabState(tab.id, tab.url);
    }
  }
});

/*
// タブごとの可用性状態を管理
type TabState = {
  available: boolean;
  reason?: string;
  lastChecked: number;
};

const tabStates = new Map<number, TabState>();

// タブが更新されたときにアイコンをチェック
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isStreamPage = /^https:\/\/.*\.sharepoint\.com\/.*\/stream\.aspx/.test(tab.url);

    if (!isStreamPage) {
      // stream.aspxページでない場合
      setTabUnavailable(tabId, 'このページではトランスクリプトをダウンロードできません');
    } else {
      // stream.aspxページの場合は確認中状態
      setTabChecking(tabId);
    }
  }
  
  // URLが変更された場合は状態をリセット
  if (changeInfo.url) {
    tabStates.delete(tabId);
  }
});

// タブが閉じられたときにクリーンアップ
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

// タブが非アクティブになって一定時間経過したらクリーンアップ（メモリ節約）
chrome.tabs.onActivated.addListener(() => {
  const now = Date.now();
  const CLEANUP_THRESHOLD = 30 * 60 * 1000; // 30分
  
  for (const [tabId, state] of tabStates.entries()) {
    if (now - state.lastChecked > CLEANUP_THRESHOLD) {
      tabStates.delete(tabId);
    }
  }
});

// ヘルパー関数: 確認中状態に設定
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
    title: 'トランスクリプトを確認中...'
  });
  tabStates.set(tabId, {
    available: false,
    reason: '確認中',
    lastChecked: Date.now()
  });
}

// ヘルパー関数: 利用可能状態に設定
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
    title: 'トランスクリプトをダウンロード'
  });
  tabStates.set(tabId, {
    available: true,
    lastChecked: Date.now()
  });
}

// ヘルパー関数: 利用不可状態に設定
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

// content scriptからのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'updateAvailability' && sender.tab?.id) {
    const tabId = sender.tab.id;

    if (message.available) {
      setTabAvailable(tabId);
    } else {
      setTabUnavailable(
        tabId,
        `トランスクリプトをダウンロードできません: ${message.reason || '不明なエラー'}`
      );
    }
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    console.error('タブIDが取得できませんでした');
    return;
  }

  const tabState = tabStates.get(tab.id);
  
  // 状態が未確認または利用不可の場合
  if (!tabState || !tabState.available) {
    console.log('トランスクリプトが利用できません:', tabState?.reason || '未確認');
    
    // オプション: ユーザーに通知を表示
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128-disabled.png',
        title: 'トランスクリプトをダウンロードできません',
        message: tabState?.reason || 'トランスクリプトが見つかりませんでした'
      });
    }
    return;
  }

  // アクティブなタブにメッセージを送信
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { 
      action: 'downloadTranscript' 
    });
    
    if (response?.success) {
      console.log('ダウンロード成功:', response.filename);
    } else {
      console.error('ダウンロード失敗:', response?.error);
      // エラー時は状態を更新
      setTabUnavailable(tab.id, response?.error || 'ダウンロードに失敗しました');
    }
  } catch (error) {
    console.error('メッセージ送信エラー:', error);
    setTabUnavailable(tab.id, 'Content scriptとの通信に失敗しました');
  }
});

*/