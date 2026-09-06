// Bridges the extension (background / popup) with the WebDrop page's own
// transfer logic via window.postMessage. Never re-implements the transfer
// protocol — it only asks the already-running page to do what it already
// knows how to do (handleFiles / doSendMessage), so this stays compatible
// even if the site's internal WebRTC/relay logic changes later.

function pagePostMessage(payload) {
  window.postMessage({ source: 'webdrop-ext', ...payload }, '*');
}

function waitForPageStatus(requestId, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let done = false;
    function onMsg(e) {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.source !== 'webdrop-page' || d.type !== 'status' || d.requestId !== requestId) return;
      done = true;
      window.removeEventListener('message', onMsg);
      resolve({ roomId: d.roomId, connected: d.connected, peerCount: d.peerCount });
    }
    window.addEventListener('message', onMsg);
    setTimeout(() => {
      if (done) return;
      window.removeEventListener('message', onMsg);
      resolve({ roomId: null, connected: false, peerCount: 0 });
    }, timeoutMs);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-status') {
    const requestId = Math.random().toString(36).slice(2);
    pagePostMessage({ type: 'get-status', requestId });
    waitForPageStatus(requestId).then(sendResponse);
    return true;
  }

  if (msg.type === 'send-text') {
    pagePostMessage({ type: 'send-text', text: msg.text });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'send-image') {
    fetch(msg.url)
      .then(r => {
        if (!r.ok) throw new Error('圖片下載失敗');
        return r.blob();
      })
      .then(blob => {
        const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0];
        const name = `image-${Date.now()}.${ext}`;
        const file = new File([blob], name, { type: blob.type });
        pagePostMessage({ type: 'send-files', files: [file] });
        sendResponse({ ok: true });
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

// ===== Floating drop-zone widget (works around the fact that no browser
// lets you drop files onto a toolbar icon) =====
(function initDropWidget() {
  if (document.getElementById('webdrop-ext-widget')) return;

  const btn = document.createElement('div');
  btn.id = 'webdrop-ext-widget';
  btn.title = '拖曳檔案到這裡，快速傳送到 WebDrop';
  btn.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="WebDrop">`;
  document.documentElement.appendChild(btn);

  let dragDepth = 0;

  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dragDepth++;
    btn.classList.add('webdrop-ext-widget-active');
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) btn.classList.remove('webdrop-ext-widget-active');
  });
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragDepth = 0;
    btn.classList.remove('webdrop-ext-widget-active');
    const files = [...e.dataTransfer.files];
    if (files.length) pagePostMessage({ type: 'send-files', files });
  });
})();
