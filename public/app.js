// ===== Loading Screen =====
const lsEl       = document.getElementById('loading-screen');
const lsStatus   = document.getElementById('ls-status');
const lsPingRow  = document.getElementById('ls-ping-row');
const lsBars     = document.getElementById('ls-signal-bars');
const lsPingLbl  = document.getElementById('ls-ping-label');
let lsHideTimer  = null;

function lsSetStatus(text, cls) {
  lsStatus.textContent = text;
  lsStatus.className = 'ls-status' + (cls ? ' ' + cls : '');
}

function lsShowPing(ms) {
  lsPingRow.style.display = 'flex';
  lsPingLbl.textContent = `${ms} ms`;
  lsBars.className = 'ls-signal-bars';
  let qClass, qText, qCls;
  if (ms < 80)       { qClass = 'q-great'; qText = '連線優秀';  qCls = 'ok'; }
  else if (ms < 200) { qClass = 'q-good';  qText = '連線良好';  qCls = 'ok'; }
  else if (ms < 450) { qClass = 'q-fair';  qText = '連線普通';  qCls = 'warn'; }
  else               { qClass = 'q-poor';  qText = '連線不穩定'; qCls = 'bad'; }
  lsBars.classList.add(qClass);
  lsSetStatus(qText, qCls);
}

function lsHide() {
  lsEl.classList.add('hide');
  // Clean up after transition
  setTimeout(() => { if (lsEl.parentNode) lsEl.style.display = 'none'; }, 600);
}

function lsDone() {
  if (lsHideTimer) return;
  lsHideTimer = setTimeout(lsHide, 2500);
}

// ===== i18n Init =====
i18n.apply();
document.getElementById('lang-toggle-btn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('lang-picker').classList.toggle('open');
});
document.querySelectorAll('.lang-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    i18n.set(btn.dataset.lang);
    document.getElementById('lang-picker').classList.remove('open');
  });
});
document.addEventListener('click', e => {
  if (!document.getElementById('lang-picker').contains(e.target))
    document.getElementById('lang-picker').classList.remove('open');
});

// ===== Constants =====
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};
const CHUNK_SIZE = 64 * 1024;
const MAX_BUFFER  = 256 * 1024;

// ===== Device =====
function getDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua))          return 'iPhone';
  if (/iPad/.test(ua))            return 'iPad';
  if (/Android.*Mobile/.test(ua)) return 'Android Phone';
  if (/Android/.test(ua))         return 'Android Tablet';
  if (/Macintosh/.test(ua))       return 'Mac';
  if (/Windows/.test(ua))         return 'Windows PC';
  if (/Linux/.test(ua))           return 'Linux';
  return 'Browser';
}
function getDeviceIcon(name) {
  return /iPhone|iPad|Android/.test(name)
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18" stroke-linecap="round" stroke-width="2"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;
}

// ===== Room =====
let myName = getDeviceName();
let myAvatar = null;
let roomId = window.location.hash.slice(1);
if (!roomId) {
  roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
  history.replaceState(null, '', `#${roomId}`);
}

// ===== Theme =====
const html    = document.documentElement;
const iconMoon = document.getElementById('icon-moon');
const iconSun  = document.getElementById('icon-sun');

function applyTheme(theme) {
  html.setAttribute('data-theme', theme);
  iconMoon.style.display = theme === 'dark' ? 'block' : 'none';
  iconSun.style.display  = theme === 'light' ? 'block' : 'none';
  localStorage.setItem('webdrop-theme', theme);
}
applyTheme(localStorage.getItem('webdrop-theme') || 'dark');
document.getElementById('theme-toggle').addEventListener('click', () => {
  applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

// ===== Mobile Tabs =====
let activeTab = 'files';
let chatUnread = 0;

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('panel-files').classList.toggle('active', tab === 'files');
  document.getElementById('panel-chat').classList.toggle('active', tab === 'chat');
  if (tab === 'chat') clearChatBadge();
}

function bumpChatBadge() {
  if (activeTab === 'chat') return;
  chatUnread++;
  const badge = document.getElementById('chat-badge');
  badge.textContent = chatUnread > 9 ? '9+' : chatUnread;
  badge.style.display = 'flex';
}
function clearChatBadge() {
  chatUnread = 0;
  document.getElementById('chat-badge').style.display = 'none';
}

// ===== Share URL =====
let shareUrl = `${window.location.origin}/#${roomId}`;

function setShareUrl(baseUrl) {
  shareUrl = baseUrl ? `${baseUrl}/#${roomId}` : `${window.location.origin}/#${roomId}`;
  const img     = document.getElementById('qr-image');
  const spinner = document.getElementById('qr-spinner');
  img.classList.add('loading');
  spinner.classList.remove('hidden');
  img.onload  = () => { img.classList.remove('loading'); spinner.classList.add('hidden'); };
  img.onerror = () => spinner.classList.add('hidden');
  img.src = `/qr?url=${encodeURIComponent(shareUrl)}`;
  document.getElementById('qr-url').textContent = shareUrl;

  const statusEl = document.getElementById('tunnel-status');
  const textEl   = document.getElementById('tunnel-status-text');
  if (baseUrl) {
    statusEl.className = 'tunnel-status tunnel-public';
    textEl.textContent  = 'Public — works across any network';
  } else {
    statusEl.className = 'tunnel-status tunnel-local';
    textEl.textContent  = 'Local network only';
  }
}

// ===== Auth State =====
let userToken    = localStorage.getItem('wd-user-token');
let currentUser  = null;
let googleConfig = false;

async function authApi(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userToken ? { Authorization: `Bearer ${userToken}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function applyCustomRoom(customRoomId) {
  if (!customRoomId || customRoomId === roomId) return false;
  roomId = customRoomId;
  history.replaceState(null, '', `#${roomId}`);
  roomCodeEl.textContent = roomId;
  setShareUrl(null);
  return true;
}

function setEditRoomBtnVisible(visible) {
  const btn = document.getElementById('edit-room-btn');
  if (btn) btn.style.display = visible ? 'inline-flex' : 'none';
}

function onLoginSuccess(data, isNew = false) {
  userToken   = data.token;
  currentUser = data.user;
  localStorage.setItem('wd-user-token', userToken);
  applyCustomRoom(data.user.customRoomId);
  setEditRoomBtnVisible(!!data.user.canCustomRoom);
  // Update socket auth & reconnect to apply new per-user file limit
  socket.auth.userToken = userToken;
  socket.disconnect();
  socket.connect();
  showUserBadge(currentUser);
  if (data.user.language) i18n.set(data.user.language);
  const langSel = document.getElementById('user-lang-select');
  if (langSel) langSel.value = data.user.language || '';
  document.getElementById('auth-modal').classList.remove('active');
  if (isNew) {
    // Show promo prompt after registration
    document.getElementById('promo-greeting').textContent = `${i18n.t('signed-in-greeting').replace('!','')} ${currentUser.name || currentUser.email}!`;
    document.getElementById('promo-modal').classList.add('active');
  } else {
    toast(`${i18n.t('signed-in-as')} ${currentUser.email}`, 'success');
    qrModal.classList.add('active');
  }
}

const ROLE_LABELS = { admin: '👑 Admin', vip: '💎 VIP', business: '💼 Business' };

function applyRoleStyle(role) {
  const badgeBtn = document.getElementById('user-badge-btn');
  const roleBadgeEl = document.getElementById('dropdown-role-badge');
  badgeBtn.classList.remove('role-admin', 'role-vip');
  if (role === 'admin' || role === 'vip' || role === 'business') {
    badgeBtn.classList.add(`role-${role}`);
    roleBadgeEl.innerHTML = `<span class="role-badge-display role-${role}">${ROLE_LABELS[role]}</span>`;
    roleBadgeEl.style.display = 'flex';
    roleBadgeEl.style.justifyContent = 'center';
  } else {
    roleBadgeEl.style.display = 'none';
  }
}

function showUserBadge(user) {
  const initial = (user.name || user.email || '?')[0].toUpperCase();
  const initialEl = document.getElementById('user-initial-badge');
  const avatarEl  = document.getElementById('user-avatar-img');
  initialEl.textContent = initial;
  if (user.avatar) {
    avatarEl.src = user.avatar;
    avatarEl.style.display = 'block';
    initialEl.style.display = 'none';
  } else {
    avatarEl.style.display = 'none';
    initialEl.style.display = 'block';
  }
  document.getElementById('user-badge-btn').style.display = 'flex';
  document.getElementById('signin-btn').style.display = 'none';
  document.getElementById('dropdown-name').textContent = user.name || '';
  document.getElementById('dropdown-email').textContent = user.email;
  const mb = user.effectiveMaxFileSizeMB || 500;
  document.getElementById('dropdown-limit-val').textContent = mb >= 999999 ? '∞ Unlimited' : mb >= 1000 ? `${(mb/1024).toFixed(1)} GB` : `${mb} MB`;
  applyRoleStyle(user.role);
  if (user.avatar !== undefined) myAvatar = user.avatar || null;
  if (user.name) myName = user.name;
}

function showGuestMode() {
  document.getElementById('user-badge-btn').style.display = 'none';
  document.getElementById('signin-btn').style.display = 'flex';
}

function userLogout() {
  localStorage.removeItem('wd-user-token');
  userToken   = null;
  currentUser = null;
  socket.auth.userToken = null;
  socket.disconnect();
  socket.connect();
  showGuestMode();
  document.getElementById('user-dropdown').classList.remove('open');
  toast('Signed out', 'info');
}

// ===== Auth Modal =====
const authModal    = document.getElementById('auth-modal');
const authTitle    = document.getElementById('auth-title');
const authError    = document.getElementById('auth-error');
const authSubmit   = document.getElementById('auth-submit-btn');
let authMode = 'login';

document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    authMode = btn.dataset.authTab;
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.authTab === authMode));
    authTitle.textContent = authMode === 'login' ? 'Welcome Back' : 'Create Account';
    authSubmit.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
    authError.textContent = '';
  });
});

authSubmit.addEventListener('click', async () => {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  authError.textContent = '';
  if (!email || !password) { authError.textContent = 'Email and password required'; return; }
  authSubmit.disabled = true;
  authSubmit.textContent = '...';
  try {
    const data = await authApi('POST', `/api/auth/${authMode}`, { email, password });
    onLoginSuccess(data, authMode === 'register');
  } catch (e) {
    authError.textContent = e.message;
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
  }
});

document.getElementById('auth-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') authSubmit.click();
});

document.getElementById('auth-guest-btn').addEventListener('click', () => {
  authModal.classList.remove('active');
  qrModal.classList.add('active');
});

document.getElementById('signin-btn').addEventListener('click', () => {
  authError.textContent = '';
  authModal.classList.add('active');
});

authModal.addEventListener('click', e => { if (e.target === authModal) authModal.classList.remove('active'); });

// ===== Google Auth =====
function initGoogleAuth() {
  if (!window.google || !googleConfig) return;
  google.accounts.id.initialize({
    client_id: googleConfig,
    callback: async ({ credential }) => {
      try {
        const data = await authApi('POST', '/api/auth/google', { idToken: credential });
        onLoginSuccess(data, false);
      } catch (e) {
        authError.textContent = e.message;
      }
    }
  });
  google.accounts.id.renderButton(
    document.getElementById('google-btn-wrap'),
    { theme: html.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline', size: 'large', width: 300, text: 'continue_with' }
  );
}

// ===== Set Room ID Modal =====
const setRoomModal = document.getElementById('set-room-modal');
const setRoomInput = document.getElementById('set-room-input');
const setRoomError = document.getElementById('set-room-error');

function openSetRoomModal() {
  setRoomInput.value = '';
  setRoomError.textContent = '';
  setRoomModal.classList.add('active');
}

document.getElementById('edit-room-btn').addEventListener('click', () => {
  document.getElementById('user-dropdown').classList.remove('open');
  openSetRoomModal();
});

document.getElementById('set-room-skip').addEventListener('click', () => {
  setRoomModal.classList.remove('active');
});

document.getElementById('set-room-submit').addEventListener('click', async () => {
  const val = setRoomInput.value.trim().toUpperCase();
  setRoomError.textContent = '';
  if (!val) { setRoomError.textContent = '請輸入房號'; return; }
  try {
    const data = await authApi('PUT', '/api/auth/room', { roomId: val });
    if (currentUser) currentUser.customRoomId = data.customRoomId;
    applyCustomRoom(data.customRoomId);
    socket.emit('join-room', { roomId, name: myName });
    setRoomModal.classList.remove('active');
    toast(`房號已設定為 ${data.customRoomId}`, 'success');
  } catch (e) {
    setRoomError.textContent = e.message;
  }
});

setRoomInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('set-room-submit').click(); });
setRoomModal.addEventListener('click', e => { if (e.target === setRoomModal) setRoomModal.classList.remove('active'); });

// ===== Promo Modal (post-register) =====
document.getElementById('promo-skip-btn').addEventListener('click', () => {
  document.getElementById('promo-modal').classList.remove('active');
  toast(i18n.t('signed-in-promo'), 'info');
  qrModal.classList.add('active');
});
document.getElementById('promo-submit-btn').addEventListener('click', async () => {
  await redeemCode(
    document.getElementById('promo-input'),
    document.getElementById('promo-error'),
    () => { document.getElementById('promo-modal').classList.remove('active'); qrModal.classList.add('active'); }
  );
});
document.getElementById('promo-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('promo-submit-btn').click();
});

// ===== Redeem In-App Modal =====
const redeemModal = document.getElementById('redeem-modal');
document.getElementById('redeem-code-btn').addEventListener('click', () => {
  document.getElementById('user-dropdown').classList.remove('open');
  document.getElementById('redeem-input').value = '';
  document.getElementById('redeem-error').textContent = '';
  redeemModal.classList.add('active');
});
document.getElementById('redeem-cancel-btn').addEventListener('click', () => redeemModal.classList.remove('active'));
redeemModal.addEventListener('click', e => { if (e.target === redeemModal) redeemModal.classList.remove('active'); });
document.getElementById('redeem-submit-btn').addEventListener('click', async () => {
  await redeemCode(
    document.getElementById('redeem-input'),
    document.getElementById('redeem-error'),
    () => redeemModal.classList.remove('active')
  );
});
document.getElementById('redeem-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('redeem-submit-btn').click();
});

async function redeemCode(inputEl, errorEl, onSuccess) {
  const code = inputEl.value.trim().toUpperCase();
  errorEl.textContent = '';
  if (!code) { errorEl.textContent = 'Enter a promo code'; return; }
  try {
    const data = await authApi('POST', '/api/auth/redeem', { code });
    const mb = data.effectiveMaxFileSizeMB;
    if (currentUser) {
      currentUser.effectiveMaxFileSizeMB = mb;
      currentUser.activePromoId = true;
      document.getElementById('dropdown-limit-val').textContent = mb >= 999999 ? '∞ Unlimited' : mb >= 1000 ? `${(mb/1024).toFixed(1)} GB` : `${mb} MB`;
      if (data.customRoomId) { currentUser.customRoomId = data.customRoomId; applyCustomRoom(data.customRoomId); }
      if (data.canCustomRoom) { currentUser.canCustomRoom = true; setEditRoomBtnVisible(true); }
    }
    toast(`Code redeemed! File limit: ${mb} MB`, 'success');
    inputEl.value = '';
    if (data.canCustomRoom && !data.customRoomId) {
      onSuccess();
      document.getElementById('set-room-modal').classList.add('active');
    } else {
      onSuccess();
    }
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

// ===== User Language Select =====
document.getElementById('user-lang-select').addEventListener('change', async (e) => {
  const lang = e.target.value;
  if (lang) {
    i18n.set(lang);
  } else {
    localStorage.removeItem('wd-lang');
    const nav = (navigator.language || 'en').replace('_', '-');
    const auto = nav.startsWith('zh') ? (nav.includes('TW') || nav.includes('HK') ? 'zh-TW' : 'zh-CN') : nav.split('-')[0];
    i18n.lang = auto;
    i18n.apply();
  }
  if (userToken) {
    try { await authApi('PUT', '/api/auth/profile', { language: lang || null }); } catch {}
  }
});

// ===== User Badge Dropdown =====
document.getElementById('user-badge-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('user-dropdown').classList.toggle('open');
});
document.getElementById('user-logout-btn').addEventListener('click', userLogout);
document.addEventListener('click', () => {
  document.getElementById('user-dropdown').classList.remove('open');
});

// ===== State =====
const peers = new Map();
let selectedPeerId = null;

// ===== DOM =====
const radarEl        = document.getElementById('radar');
const noDevicesEl    = document.getElementById('no-devices');
const dropZoneEl     = document.getElementById('drop-zone');
const dropHintEl     = document.getElementById('drop-hint');
const fileInputEl    = document.getElementById('file-input');
const messageInputEl = document.getElementById('message-input');
const sendBtn        = document.getElementById('send-btn');
const roomCodeEl     = document.getElementById('room-code');
const copyLinkBtn    = document.getElementById('copy-link');
const showQRBtn      = document.getElementById('show-qr');
const qrModal        = document.getElementById('qr-modal');
const closeQRBtn     = document.getElementById('close-qr');
const copyQRUrlBtn   = document.getElementById('copy-qr-url');
const notificationsEl = document.getElementById('notifications');
const myDeviceNameEl  = document.getElementById('my-device-name');
const chatEl          = document.getElementById('chat-messages');

// ===== Init UI =====
roomCodeEl.textContent = roomId;
myDeviceNameEl.textContent = myName;
document.getElementById('my-device-svg').outerHTML = getDeviceIcon(myName).replace('<svg', '<svg id="my-device-svg"');

copyLinkBtn.addEventListener('click', () =>
  navigator.clipboard.writeText(shareUrl).then(() => toast(i18n.t('link-copied'), 'success')).catch(() => toast(i18n.t('copy-failed'), 'error'))
);
copyQRUrlBtn.addEventListener('click', () =>
  navigator.clipboard.writeText(shareUrl).then(() => toast(i18n.t('link-copied'), 'success')).catch(() => toast(i18n.t('copy-failed'), 'error'))
);
showQRBtn.addEventListener('click', () => qrModal.classList.add('active'));
closeQRBtn.addEventListener('click', () => qrModal.classList.remove('active'));
qrModal.addEventListener('click', e => { if (e.target === qrModal) qrModal.classList.remove('active'); });

document.getElementById('open-share-btn').addEventListener('click', () => qrModal.classList.add('active'));

document.getElementById('room-closed-new').addEventListener('click', () => {
  const newId = Math.random().toString(36).slice(2, 8).toUpperCase();
  window.location.href = `${window.location.origin}/#${newId}`;
  window.location.reload();
});

// ===== Chat UI =====
function addChatMsg(sender, text, isMine) {
  removeChatEmpty();
  const el = document.createElement('div');
  el.className = `chat-msg ${isMine ? 'mine' : 'theirs'}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `
    ${!isMine ? `<div class="chat-sender">${esc(sender)}</div>` : ''}
    <div class="chat-bubble">
      <div class="chat-text">${esc(text)}</div>
      <div class="chat-time">${time}</div>
    </div>`;
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  if (!isMine) bumpChatBadge();
}

function addChatEvent(text) {
  removeChatEmpty();
  const el = document.createElement('div');
  el.className = 'chat-event';
  el.textContent = text;
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function removeChatEmpty() {
  const empty = chatEl.querySelector('.chat-empty');
  if (empty) empty.remove();
}

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

function addFileBubble(filename, filesize, isMine, peerName) {
  removeChatEmpty();
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${isMine ? 'mine' : 'theirs'}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  wrap.innerHTML = `
    ${!isMine ? `<div class="chat-sender">${esc(peerName || 'Unknown')}</div>` : ''}
    <div class="file-bubble ${isMine ? 'mine' : 'theirs'}">
      <div class="file-bubble-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </div>
      <div class="file-bubble-meta">
        <div class="file-bubble-name">${esc(filename)}</div>
        <div class="file-bubble-size">${fmtBytes(filesize)}</div>
      </div>
    </div>
    <div class="chat-time">${time}</div>`;
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
  if (!isMine) bumpChatBadge();
}

// ===== Socket.io =====
let roomClosedByAdmin = false;
const socket = io({ auth: { userToken: userToken || null } });

function rejoinRoom() {
  if (roomClosedByAdmin) return;
  socket.emit('join-room', { roomId, name: myName, avatar: myAvatar });
}

socket.on('connect', () => {
  document.getElementById('maintenance-overlay').style.display = 'none';
  lsSetStatus('已連線，測量延遲…');
  // Measure round-trip ping
  const t0 = Date.now();
  socket.timeout(5000).emit('ping-check', (err) => {
    if (!err) lsShowPing(Date.now() - t0);
    else lsSetStatus('連線已建立', 'ok');
    lsDone();
  });
  rejoinRoom();
});

socket.on('room-joined', ({ peers: existing }) => {
  existing.forEach(({ id, name, role, avatar }) => addPeer(id, name, true, role, avatar));
});
socket.on('peer-joined', ({ id, name, role, avatar }) => addPeer(id, name, false, role, avatar));
socket.on('peer-left',   id => removePeer(id));
socket.on('tunnel-url',  url => setShareUrl(url));

socket.on('room-closed', ({ reason } = {}) => {
  roomClosedByAdmin = true;
  // Clear all peers silently
  peers.forEach((_, id) => {
    const peer = peers.get(id);
    if (peer) { peer.pc.close(); if (peer.element) peer.element.remove(); }
  });
  peers.clear();
  selectedPeerId = null;
  noDevicesEl.style.display = 'flex';
  updatePositions();
  // Show modal
  document.getElementById('room-closed-msg').textContent =
    reason || 'This room has been closed by the administrator.';
  document.getElementById('room-closed-modal').classList.add('active');
});

socket.on('role-updated', ({ role, effectiveMaxFileSizeMB, canCustomRoom }) => {
  if (currentUser) {
    currentUser.role = role;
    if (effectiveMaxFileSizeMB != null) currentUser.effectiveMaxFileSizeMB = effectiveMaxFileSizeMB;
    if (canCustomRoom != null) currentUser.canCustomRoom = canCustomRoom;
    applyRoleStyle(role);
    setEditRoomBtnVisible(!!canCustomRoom);
    const mb = effectiveMaxFileSizeMB || currentUser.effectiveMaxFileSizeMB || 500;
    const el = document.getElementById('dropdown-limit-val');
    if (el) el.textContent = mb >= 1000 ? `${(mb/1024).toFixed(1)} GB` : mb >= 999999 ? '∞' : `${mb} MB`;
  }
});

socket.on('account-banned', ({ reason } = {}) => {
  localStorage.removeItem('wd-user-token');
  userToken = null;
  currentUser = null;
  const overlay = document.getElementById('banned-overlay');
  const reasonEl = document.getElementById('banned-reason-text');
  if (reason && reasonEl) reasonEl.textContent = `原因：${reason}`;
  overlay.style.display = 'flex';
});

socket.on('connect_error', (e) => {
  lsSetStatus('連線失敗，重試中…', 'bad');
  if (e.message === 'Under maintenance') {
    document.getElementById('maintenance-overlay').style.display = 'flex';
    lsHide();
  }
  if (e.message === 'Your account has been suspended') {
    localStorage.removeItem('wd-user-token');
    userToken = null;
    currentUser = null;
    showGuestMode();
    toast(i18n.t('suspended'), 'error');
  }
});

socket.on('settings-updated', ({ maintenanceMode }) => {
  const overlay = document.getElementById('maintenance-overlay');
  if (maintenanceMode) {
    overlay.style.display = 'flex';
  } else {
    overlay.style.display = 'none';
  }
});

socket.on('admin-switch-room', ({ roomId: newRoomId }) => {
  if (!newRoomId || newRoomId === roomId) return;
  roomId = newRoomId;
  history.replaceState(null, '', `#${roomId}`);
  roomCodeEl.textContent = roomId;
  setShareUrl(null);
  rejoinRoom();
  toast('房間 ID 已由管理員更新', 'info');
});

socket.on('peer-profile-changed', ({ id, name, avatar }) => {
  const peer = peers.get(id);
  if (!peer) return;
  if (name) peer.name = name;
  if (avatar !== undefined) peer.avatar = avatar;
  if (peer.element) {
    const iconEl = peer.element.querySelector('.peer-icon');
    if (iconEl) iconEl.innerHTML = `${peerIconHtml(peer.name, peer.avatar)}<div class="status-dot ${iconEl.querySelector('.status-dot')?.className.replace('status-dot','').trim() || ''}"></div>`;
    const nameEl = peer.element.querySelector('.peer-name');
    if (nameEl) {
      const badge = PEER_ROLE_BADGE[peer.role] || '';
      nameEl.innerHTML = `${esc(peer.name)}${badge}`;
    }
  }
});

socket.on('profile-error', ({ error }) => toast(error, 'error'));

socket.on('offer', async ({ from, offer }) => {
  const peer = peers.get(from);
  if (!peer) return;
  await peer.pc.setRemoteDescription(offer);
  const answer = await peer.pc.createAnswer();
  await peer.pc.setLocalDescription(answer);
  socket.emit('answer', { to: from, answer });
});
socket.on('answer', async ({ from, answer }) => {
  const peer = peers.get(from);
  if (peer) await peer.pc.setRemoteDescription(answer);
});
socket.on('ice-candidate', ({ from, candidate }) => {
  const peer = peers.get(from);
  if (peer) peer.pc.addIceCandidate(candidate).catch(() => {});
});

// Socket relay receive
socket.on('relay-msg', ({ from, text }) => {
  const peer = peers.get(from);
  if (peer) addChatMsg(peer.name, text, false);
});
socket.on('relay-error', ({ error }) => toast(error, 'error'));
socket.on('relay-file-start', ({ from, meta }) => {
  const peer = peers.get(from);
  if (!peer) return;
  peer.receiving = { fileId: meta.fileId, name: meta.name, size: meta.size, mime: meta.mime, chunks: [], received: 0 };
  setProgress(peer, 0);
});
socket.on('relay-file-chunk', ({ from, chunk }) => {
  const peer = peers.get(from);
  if (!peer?.receiving) return;
  const buf = toArrayBuffer(chunk);
  peer.receiving.chunks.push(buf);
  peer.receiving.received += buf.byteLength;
  setProgress(peer, peer.receiving.received / peer.receiving.size);
});
socket.on('relay-file-end', ({ from, fileId, name }) => {
  const peer = peers.get(from);
  if (!peer?.receiving || peer.receiving.fileId !== fileId) return;
  const r = peer.receiving;
  download(r);
  addFileBubble(r.name, r.size, false, peer.name);
  toast(`Received: ${r.name}`, 'success');
  peer.receiving = null;
  setProgress(peer, null);
});

// ===== Peer Lifecycle =====
function addPeer(peerId, name, isInitiator, role, avatar) {
  if (peers.has(peerId)) return;
  const pc = new RTCPeerConnection(ICE_SERVERS);
  pc.onicecandidate = ({ candidate }) => { if (candidate) socket.emit('ice-candidate', { to: peerId, candidate }); };
  pc.onconnectionstatechange = () => { const p = peers.get(peerId); if (p) updateStatusDot(p, pc.connectionState); };

  const peerObj = { pc, dc: null, name, role: role || null, avatar: avatar || null, element: null, sendQueue: [], isSending: false, receiving: null };
  peers.set(peerId, peerObj);
  peerObj.element = createPeerEl(peerId, name, role, avatar);
  radarEl.appendChild(peerObj.element);
  updatePositions();
  noDevicesEl.style.display = 'none';

  if (peers.size === 1 && qrModal.classList.contains('active')) {
    setTimeout(() => qrModal.classList.remove('active'), 600);
  }
  if (peers.size === 1) autoSelect(peerId);

  addChatEvent(`${name} joined the room`);

  if (isInitiator) {
    const dc = pc.createDataChannel('webdrop', { ordered: true });
    peerObj.dc = dc;
    setupDC(dc, peerId);
    pc.createOffer().then(o => { pc.setLocalDescription(o); socket.emit('offer', { to: peerId, offer: o }); });
  } else {
    pc.ondatachannel = ({ channel }) => {
      const p = peers.get(peerId);
      if (p) { p.dc = channel; setupDC(channel, peerId); }
    };
  }
}

function removePeer(peerId) {
  const peer = peers.get(peerId);
  if (!peer) return;
  peer.pc.close();
  if (peer.element) peer.element.remove();
  peers.delete(peerId);
  addChatEvent(`${peer.name} left`);
  if (selectedPeerId === peerId) {
    selectedPeerId = null;
    const next = peers.keys().next().value;
    if (next) autoSelect(next); else updateDropHint();
  }
  updatePositions();
  if (peers.size === 0) noDevicesEl.style.display = 'flex';
  toast(`${peer.name} disconnected`, 'info');
}

function autoSelect(peerId) {
  if (selectedPeerId) {
    const prev = peers.get(selectedPeerId);
    if (prev?.element) prev.element.classList.remove('selected');
  }
  selectedPeerId = peerId;
  const peer = peers.get(peerId);
  if (peer?.element) peer.element.classList.add('selected');
  updateDropHint();
}

function setupDC(dc, peerId) {
  dc.binaryType = 'arraybuffer';
  dc.onopen  = () => { const p = peers.get(peerId); if (p) { updateStatusDot(p, 'connected'); toast(`Connected to ${p.name}`, 'success'); } };
  dc.onclose = () => { const p = peers.get(peerId); if (p) updateStatusDot(p, 'disconnected'); };
  dc.onmessage = ({ data }) => {
    if (typeof data === 'string') handleDCControl(JSON.parse(data), peerId);
    else handleDCChunk(data, peerId);
  };
}

// ===== DC Receive =====
function handleDCControl(msg, peerId) {
  const peer = peers.get(peerId);
  if (!peer) return;
  if (msg.type === 'file-start') {
    peer.receiving = { fileId: msg.fileId, name: msg.name, size: msg.size, mime: msg.mime, chunks: [], received: 0 };
    setProgress(peer, 0);
  } else if (msg.type === 'file-end') {
    if (peer.receiving?.fileId === msg.fileId) {
      const r = peer.receiving;
      download(r);
      addFileBubble(r.name, r.size, false, peer.name);
      toast(`Received: ${r.name}`, 'success');
      peer.receiving = null;
      setProgress(peer, null);
    }
  } else if (msg.type === 'message') {
    addChatMsg(peer.name, msg.text, false);
  }
}
function handleDCChunk(data, peerId) {
  const peer = peers.get(peerId);
  if (!peer?.receiving) return;
  peer.receiving.chunks.push(data);
  peer.receiving.received += data.byteLength;
  setProgress(peer, peer.receiving.received / peer.receiving.size);
}

function download(r) {
  const blob = new Blob(r.chunks, { type: r.mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: r.name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

// ===== Send =====
function resolveTargets() {
  if (selectedPeerId && peers.has(selectedPeerId)) return [selectedPeerId];
  const all = Array.from(peers.keys());
  if (all.length === 1) return all;
  return null;
}
function dcReady(id) { return peers.get(id)?.dc?.readyState === 'open'; }

function doSendMessage() {
  const text = messageInputEl.value.trim();
  if (!text) return;
  const targets = resolveTargets();
  if (!targets?.length) { toast(peers.size === 0 ? 'No devices connected' : 'Select a device first', 'error'); return; }
  targets.forEach(id => {
    const peer = peers.get(id);
    if (!peer) return;
    if (dcReady(id)) peer.dc.send(JSON.stringify({ type: 'message', text }));
    else socket.emit('relay-msg', { to: id, text });
  });
  addChatMsg('You', text, true);
  messageInputEl.value = '';
  if (window.innerWidth <= 768) switchTab('chat');
}

sendBtn.addEventListener('click', doSendMessage);
messageInputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSendMessage(); } });

async function sendFileToPeer(peerId, file) {
  if (dcReady(peerId)) await sendFileViaDC(peerId, file);
  else await sendFileViaRelay(peerId, file);
}

async function sendFileViaDC(peerId, file) {
  const peer = peers.get(peerId);
  const fileId = randId();
  peer.dc.send(JSON.stringify({ type: 'file-start', fileId, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' }));
  let offset = 0;
  while (offset < file.size) {
    while (peer.dc.bufferedAmount > MAX_BUFFER) await sleep(50);
    const buf = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    peer.dc.send(buf);
    offset += buf.byteLength;
    setProgress(peer, offset / file.size);
  }
  peer.dc.send(JSON.stringify({ type: 'file-end', fileId }));
  setProgress(peer, null);
  addFileBubble(file.name, file.size, true, peer.name);
  toast(`Sent: ${file.name}`, 'success');
}

async function sendFileViaRelay(peerId, file) {
  const peer = peers.get(peerId);
  const fileId = randId();
  socket.emit('relay-file-start', { to: peerId, meta: { fileId, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' } });
  let offset = 0;
  while (offset < file.size) {
    const buf = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    socket.emit('relay-file-chunk', { to: peerId, chunk: buf });
    offset += buf.byteLength;
    setProgress(peer, offset / file.size);
    if (offset % (CHUNK_SIZE * 4) === 0) await sleep(10);
  }
  socket.emit('relay-file-end', { to: peerId, fileId, name: file.name });
  setProgress(peer, null);
  addFileBubble(file.name, file.size, true, peer.name);
  toast(`Sent: ${file.name}`, 'success');
}

function queueFile(peerId, file) {
  const peer = peers.get(peerId);
  if (!peer) return;
  peer.sendQueue.push(file);
  processSendQueue(peerId);
}

async function processSendQueue(peerId) {
  const peer = peers.get(peerId);
  if (!peer || peer.isSending || !peer.sendQueue.length) return;
  peer.isSending = true;
  await sendFileToPeer(peerId, peer.sendQueue.shift());
  peer.isSending = false;
  processSendQueue(peerId);
}

function handleFiles(files) {
  if (!files.length) return;
  const targets = resolveTargets();
  if (!targets?.length) { toast(peers.size === 0 ? 'No devices connected' : 'Select a device first', 'error'); return; }
  targets.forEach(id => files.forEach(f => queueFile(id, f)));
}

dropZoneEl.addEventListener('dragover',  e => { e.preventDefault(); dropZoneEl.classList.add('dragover'); });
dropZoneEl.addEventListener('dragleave', e => { if (!dropZoneEl.contains(e.relatedTarget)) dropZoneEl.classList.remove('dragover'); });
dropZoneEl.addEventListener('drop',      e => { e.preventDefault(); dropZoneEl.classList.remove('dragover'); handleFiles([...e.dataTransfer.files]); });
dropZoneEl.addEventListener('click',     () => fileInputEl.click());
fileInputEl.addEventListener('change',   () => { handleFiles([...fileInputEl.files]); fileInputEl.value = ''; });

const fileInputChatEl = document.getElementById('file-input-chat');
fileInputChatEl.addEventListener('change', () => { handleFiles([...fileInputChatEl.files]); fileInputChatEl.value = ''; });

// ===== UI: Peers =====
const PEER_ROLE_BADGE = {
  admin:    `<span class="peer-role-badge peer-role-admin">👑 Admin</span>`,
  vip:      `<span class="peer-role-badge peer-role-vip">💎 VIP</span>`,
  business: `<span class="peer-role-badge peer-role-business">💼 Business</span>`,
};

function peerIconHtml(name, avatar) {
  if (avatar) return `<img class="peer-avatar-img" src="${esc(avatar)}" alt="">`;
  return getDeviceIcon(name);
}

function createPeerEl(peerId, name, role, avatar) {
  const el = document.createElement('div');
  el.className = 'peer-bubble' + (role ? ` has-${role}` : '');
  const badge = PEER_ROLE_BADGE[role] || '';
  el.innerHTML = `
    <div class="peer-icon">${peerIconHtml(name, avatar)}<div class="status-dot"></div></div>
    <span class="peer-name">${esc(name)}${badge}</span>
    <div class="peer-progress"><div class="peer-progress-bar"></div></div>`;
  el.addEventListener('click', () => {
    if (selectedPeerId !== peerId) { autoSelect(peerId); toast(`${name} selected`, 'info'); }
  });
  return el;
}

function updateDropHint() {
  const peer = selectedPeerId ? peers.get(selectedPeerId) : peers.size === 1 ? peers.values().next().value : null;
  if (peer) {
    dropHintEl.textContent = `Sending to: ${peer.name}`;
    dropZoneEl.classList.add('ready');
  } else {
    dropHintEl.textContent = peers.size > 1 ? 'Click a device to select' : 'Waiting for devices...';
    dropZoneEl.classList.remove('ready');
  }
}

function updateStatusDot(peer, state) {
  if (!peer.element) return;
  peer.element.querySelector('.status-dot').className = `status-dot ${state}`;
}

function setProgress(peer, fraction) {
  if (!peer?.element) return;
  const wrap = peer.element.querySelector('.peer-progress');
  const bar  = peer.element.querySelector('.peer-progress-bar');
  if (fraction === null) { wrap.style.display = 'none'; bar.style.width = '0%'; }
  else { wrap.style.display = 'block'; bar.style.width = `${Math.round(fraction * 100)}%`; }
}

function updatePositions() {
  const list = [...peers.values()].filter(p => p.element);
  const n = list.length;
  if (!n) return;
  const radarSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--radar-size')) || 320;
  const radius = Math.min(radarSize * 0.37, 145);
  list.forEach((peer, i) => {
    const angle = ((360 / n) * i - 90) * (Math.PI / 180);
    const tx = Math.cos(angle) * radius;
    const ty = Math.sin(angle) * radius;
    peer.element.style.setProperty('--tx', `${tx}px`);
    peer.element.style.setProperty('--ty', `${ty}px`);
    peer.element.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
    peer.element.style.animation = 'peerAppear .4s cubic-bezier(.34,1.56,.64,1) both';
  });
}

// ===== Toasts =====
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  notificationsEl.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 3000);
}

// ===== Utils =====
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }
function randId()   { return Math.random().toString(36).slice(2, 10); }
function toArrayBuffer(chunk) {
  if (chunk instanceof ArrayBuffer) return chunk;
  if (chunk?.buffer) return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
  return new Uint8Array(Object.values(chunk)).buffer;
}

// ===== Edit Profile Modal =====
let pendingAvatarData = undefined; // undefined = no change; null = clear; string = new avatar

document.getElementById('edit-profile-btn').addEventListener('click', () => {
  document.getElementById('user-dropdown').classList.remove('open');
  const nameInput = document.getElementById('profile-name-input');
  nameInput.value = currentUser?.name || myName;
  pendingAvatarData = undefined;
  const previewImg = document.getElementById('avatar-preview-img');
  const previewInitial = document.getElementById('avatar-preview-initial');
  const clearBtn = document.getElementById('avatar-clear-btn');
  if (myAvatar) {
    previewImg.src = myAvatar; previewImg.style.display = 'block';
    previewInitial.style.display = 'none'; clearBtn.style.display = 'inline-block';
  } else {
    previewImg.style.display = 'none';
    previewInitial.textContent = (currentUser?.name || myName || '?')[0].toUpperCase();
    previewInitial.style.display = 'block'; clearBtn.style.display = 'none';
  }
  document.getElementById('profile-error').style.display = 'none';
  document.getElementById('edit-profile-modal').classList.add('active');
});

document.getElementById('profile-cancel-btn').addEventListener('click', () => {
  document.getElementById('edit-profile-modal').classList.remove('active');
});

document.getElementById('avatar-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  const dataUrl = await resizeImageToDataUrl(file, 80, 80);
  pendingAvatarData = dataUrl;
  const previewImg = document.getElementById('avatar-preview-img');
  const previewInitial = document.getElementById('avatar-preview-initial');
  previewImg.src = dataUrl; previewImg.style.display = 'block';
  previewInitial.style.display = 'none';
  document.getElementById('avatar-clear-btn').style.display = 'inline-block';
});

document.getElementById('avatar-clear-btn').addEventListener('click', () => {
  pendingAvatarData = null;
  document.getElementById('avatar-preview-img').style.display = 'none';
  const initial = (document.getElementById('profile-name-input').value || currentUser?.name || myName || '?')[0].toUpperCase();
  const previewInitial = document.getElementById('avatar-preview-initial');
  previewInitial.textContent = initial; previewInitial.style.display = 'block';
  document.getElementById('avatar-clear-btn').style.display = 'none';
});

document.getElementById('profile-save-btn').addEventListener('click', async () => {
  const newName = document.getElementById('profile-name-input').value.trim();
  const errEl = document.getElementById('profile-error');
  errEl.style.display = 'none';
  if (!newName) { errEl.textContent = '名稱不能為空'; errEl.style.display = 'block'; return; }
  if (newName.length > 20) { errEl.textContent = '名稱不能超過20字'; errEl.style.display = 'block'; return; }

  const saveBtn = document.getElementById('profile-save-btn');
  saveBtn.disabled = true;

  try {
    const body = {};
    if (newName !== (currentUser?.name || myName)) body.name = newName;
    if (pendingAvatarData !== undefined) body.avatar = pendingAvatarData;

    if (Object.keys(body).length > 0 && currentUser) {
      const result = await authApi('PUT', '/api/auth/profile', body);
      if (result.name) { currentUser.name = result.name; myName = result.name; }
      if ('avatar' in result) { currentUser.avatar = result.avatar; myAvatar = result.avatar; }
      showUserBadge(currentUser);
    }

    // Broadcast to room peers in real-time
    const profileUpdate = {};
    if (body.name) profileUpdate.name = newName;
    if (pendingAvatarData !== undefined) profileUpdate.avatar = pendingAvatarData;
    if (Object.keys(profileUpdate).length > 0) {
      if (!currentUser) { myName = newName; if (pendingAvatarData !== undefined) myAvatar = pendingAvatarData; }
      socket.emit('change-profile', profileUpdate);
    }

    document.getElementById('edit-profile-modal').classList.remove('active');
    toast('個人資料已更新', 'success');
  } catch (e) {
    errEl.textContent = e.message || '儲存失敗';
    errEl.style.display = 'block';
  } finally {
    saveBtn.disabled = false;
  }
});

async function resizeImageToDataUrl(file, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.getElementById('avatar-canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      // Center-crop
      const scale = Math.max(w / img.width, h / img.height);
      const sw = w / scale, sh = h / scale;
      const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片讀取失敗')); };
    img.src = url;
  });
}

// Force-hide loading screen after 6s if something goes wrong
setTimeout(() => { if (!lsHideTimer) { lsSetStatus('連線逾時，請重新整理', 'bad'); setTimeout(lsHide, 2000); } }, 6000);

// ===== Init =====
window.addEventListener('load', async () => {
  setShareUrl(null);

  // Mobile-friendly drop zone copy
  if (window.matchMedia('(hover: none)').matches) {
    document.getElementById('drop-label').textContent = 'Tap to select files';
  }

  // Load config (Google auth availability)
  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    if (cfg.googleAuth && cfg.googleClientId) {
      googleConfig = cfg.googleClientId;
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogleAuth;
      document.head.appendChild(script);
    } else {
      document.getElementById('google-btn-wrap').style.display = 'none';
      document.getElementById('auth-divider').style.display = 'none';
    }
  } catch {}

  // Restore session
  if (userToken) {
    try {
      const data = await authApi('GET', '/api/auth/me');
      currentUser = data;
      applyCustomRoom(data.customRoomId);
      setEditRoomBtnVisible(!!data.canCustomRoom);
      showUserBadge(currentUser);
      if (data.language) i18n.set(data.language);
      const langSel = document.getElementById('user-lang-select');
      if (langSel) langSel.value = data.language || '';
    } catch {
      localStorage.removeItem('wd-user-token');
      userToken = null;
      socket.auth.userToken = null;
      setTimeout(() => authModal.classList.add('active'), 600);
    }
  } else {
    setTimeout(() => authModal.classList.add('active'), 600);
  }

  // Auto-open QR
  setTimeout(() => {
    if (!authModal.classList.contains('active')) {
      qrModal.classList.add('active');
    }
  }, 800);
});

// ===== WebRTC check =====
if (!window.RTCPeerConnection) {
  document.getElementById('app').innerHTML =
    '<div style="text-align:center;padding:80px 20px;color:#888"><h2>Browser not supported</h2><p>Please use a modern browser.</p></div>';
}
