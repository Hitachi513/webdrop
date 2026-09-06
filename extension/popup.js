const SITE_ORIGIN = 'https://webdrop-6l1u.onrender.com';

const stateLoading   = document.getElementById('state-loading');
const stateNotFound  = document.getElementById('state-not-found');
const stateConnected = document.getElementById('state-connected');
const connBadge      = document.getElementById('conn-badge');
const connLabel      = document.getElementById('conn-label');
const roomCodeEl     = document.getElementById('room-code');
const qrImg          = document.getElementById('qr-img');
const peerCountEl    = document.getElementById('peer-count');
const copyLinkBtn    = document.getElementById('copy-link-btn');
const openSiteBtn    = document.getElementById('open-site-btn');

function show(el) {
  [stateLoading, stateNotFound, stateConnected].forEach(s => s.classList.add('hidden'));
  el.classList.remove('hidden');
}

let roomUrl = '';

chrome.runtime.sendMessage({ type: 'popup-get-status' }, (res) => {
  if (!res?.found || !res.roomId) {
    show(stateNotFound);
    return;
  }

  roomUrl = `${SITE_ORIGIN}/#${res.roomId}`;
  roomCodeEl.textContent = res.roomId;
  qrImg.src = `${SITE_ORIGIN}/qr?url=${encodeURIComponent(roomUrl)}`;

  if (res.connected) {
    connBadge.classList.remove('offline');
    connLabel.textContent = '已連線';
    peerCountEl.textContent = `${res.peerCount} 位裝置已連線`;
  } else {
    connBadge.classList.add('offline');
    connLabel.textContent = '等待裝置加入';
    peerCountEl.textContent = '尚未有其他裝置加入這個房間';
  }

  show(stateConnected);
});

copyLinkBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomUrl);
  copyLinkBtn.textContent = '已複製！';
  setTimeout(() => copyLinkBtn.textContent = '複製邀請連結', 1200);
});

openSiteBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: `${SITE_ORIGIN}/` });
});
