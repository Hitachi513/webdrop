const WEBDROP_MATCH = 'https://webdrop-6l1u.onrender.com/*';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'webdrop-send-image',
    title: '傳送圖片到 WebDrop',
    contexts: ['image']
  });
  chrome.contextMenus.create({
    id: 'webdrop-send-link',
    title: '傳送連結到 WebDrop',
    contexts: ['link']
  });
  chrome.contextMenus.create({
    id: 'webdrop-send-selection',
    title: '傳送選取文字到 WebDrop',
    contexts: ['selection']
  });
});

async function findWebDropTab() {
  const tabs = await chrome.tabs.query({ url: WEBDROP_MATCH });
  if (!tabs.length) return null;
  // Prefer the most recently active/focused tab among matches.
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

function notify(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'WebDrop',
    message
  });
}

async function dispatchToTab(payload) {
  const tab = await findWebDropTab();
  if (!tab) {
    notify('找不到已開啟的 WebDrop 分頁，請先開啟網站並加入房間。');
    chrome.tabs.create({ url: 'https://webdrop-6l1u.onrender.com/' });
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, payload);
    if (!res?.ok) notify(res?.error || '傳送失敗，請確認已加入房間並有連線的裝置。');
  } catch (e) {
    notify('無法連接到 WebDrop 分頁，請重新整理該分頁後再試一次。');
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'webdrop-send-image' && info.srcUrl) {
    dispatchToTab({ type: 'send-image', url: info.srcUrl });
  } else if (info.menuItemId === 'webdrop-send-link' && info.linkUrl) {
    dispatchToTab({ type: 'send-text', text: info.linkUrl });
  } else if (info.menuItemId === 'webdrop-send-selection' && info.selectionText) {
    dispatchToTab({ type: 'send-text', text: info.selectionText });
  }
});

// Relay popup status checks to the active WebDrop tab.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'popup-get-status') {
    findWebDropTab().then(async (tab) => {
      if (!tab) { sendResponse({ found: false }); return; }
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { type: 'get-status' });
        sendResponse({ found: true, tabId: tab.id, ...status });
      } catch {
        sendResponse({ found: false });
      }
    });
    return true; // async response
  }
});
