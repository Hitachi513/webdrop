// Capture hash before room-ID generation overwrites it
const originalHash = window.location.hash;

// ===== Loading Screen =====
const lsEl       = document.getElementById('loading-screen');
const lsStatus   = document.getElementById('ls-status');
const lsPingRow  = document.getElementById('ls-ping-row');
const lsBars     = document.getElementById('ls-signal-bars');
const lsPingLbl  = document.getElementById('ls-ping-label');
let lsHideTimer      = null;
let lsFinishTimer    = null;
let lastPingMs       = null;
let landingDismissed = false;
let lsDonePending    = false;

function lsSetStatus(text, cls) {
  lsStatus.textContent = text;
  lsStatus.className = 'ls-status' + (cls ? ' ' + cls : '');
}

function lsShowPing(ms) {
  lastPingMs = ms;
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
  // Update header button icon
  const iconBars = document.getElementById('st-icon-bars');
  if (iconBars) iconBars.className = `ls-signal-bars ${qClass}`;
}

function lsHide() {
  lsEl.classList.add('ls-completing');
  setTimeout(() => { lsEl.style.display = 'none'; }, 550);
}

function lsDone() {
  if (lsHideTimer) return;
  if (!landingDismissed) { lsDonePending = true; return; }
  const ring = document.querySelector('.ls-ring');
  // Speed up ring 650ms before exit
  lsFinishTimer = setTimeout(() => { if (ring) ring.classList.add('fast'); }, 2000 - 650);
  // Exit at 2s
  lsHideTimer = setTimeout(lsHide, 2000);
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
function getBrowserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua))   return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua))  return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua))  return 'Safari';
  return 'Browser';
}
function getDeviceName() {
  const ua = navigator.userAgent;
  const b = getBrowserName();
  if (/iPhone/.test(ua))          return `iPhone · ${b}`;
  if (/iPad/.test(ua))            return `iPad · ${b}`;
  if (/Android.*Mobile/.test(ua)) return `Android · ${b}`;
  if (/Android/.test(ua))         return `Android Tablet · ${b}`;
  if (/Macintosh/.test(ua))       return `Mac · ${b}`;
  if (/Windows/.test(ua))         return `Windows · ${b}`;
  if (/Linux/.test(ua))           return `Linux · ${b}`;
  return b;
}

const BROWSER_ICONS = {
  Chrome:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3.5"/><line x1="12" y1="8.5" x2="12" y2="2"/><line x1="15" y1="13.8" x2="19.8" y2="16.5"/><line x1="9" y1="13.8" x2="4.2" y2="16.5"/></svg>`,
  Safari:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/><line x1="8" y1="16" x2="16" y2="8"/><circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" opacity="0.4"/></svg>`,
  Firefox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C7 4.5 4.5 9 5 13c.3 2 1.3 4 3 5.5C9.5 20 11 21 12 22c1-.5 3-2 4.5-3.5 2.5-2.5 3.5-6 2.5-9.5-.5-2-2-4-4.5-5 .5 1.5.5 3 0 4.5C13.5 7.5 13 5 12 2z"/></svg>`,
  Edge:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.5 8C19.4 4.5 16 2 12 2 6.5 2 2 6.5 2 12c0 3 1.4 5.6 3.5 7.3"/><path d="M5 16.5C6.3 19.7 9 22 12.5 22c4 0 7-3 7-7"/><line x1="5.5" y1="12.5" x2="19.5" y2="12.5"/></svg>`,
  Opera:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="7"/></svg>`,
};

function getDeviceIcon(name) {
  for (const [b, svg] of Object.entries(BROWSER_ICONS)) {
    if (name.includes(b)) return svg;
  }
  return /iPhone|iPad|Android/.test(name)
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="18" r="1" fill="currentColor" stroke="none"/></svg>`
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
  document.getElementById('panel-members').classList.toggle('active', tab === 'members');
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
  const membersTab = document.getElementById('tab-members');
  if (membersTab) membersTab.style.display = ['admin', 'business'].includes(role) ? '' : 'none';
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
const dragOverlayEl  = document.getElementById('drag-overlay');
let dragDepth = 0;
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
(function setMyDeviceName() {
  const dot = myName.indexOf(' · ');
  if (dot !== -1) {
    myDeviceNameEl.innerHTML = `${esc(myName.slice(0, dot))}<span class="center-browser">${esc(myName.slice(dot + 3))}</span>`;
    myDeviceNameEl.style.whiteSpace = 'normal';
  } else {
    myDeviceNameEl.textContent = myName;
  }
})();
document.getElementById('my-device-svg').outerHTML = getDeviceIcon(myName).replace('<svg', '<svg id="my-device-svg"');

copyLinkBtn.addEventListener('click', () =>
  navigator.clipboard.writeText(shareUrl).then(() => toast(i18n.t('link-copied'), 'success')).catch(() => toast(i18n.t('copy-failed'), 'error'))
);
copyQRUrlBtn.addEventListener('click', () =>
  navigator.clipboard.writeText(shareUrl).then(() => toast(i18n.t('link-copied'), 'success')).catch(() => toast(i18n.t('copy-failed'), 'error'))
);
showQRBtn.addEventListener('click', () => qrModal.classList.add('active'));
// On narrow screens the copy button is hidden; tap the pill to share
document.querySelector('.room-pill').addEventListener('click', e => {
  if (window.innerWidth <= 480 && !e.target.closest('button')) qrModal.classList.add('active');
});

// ===== Speed Test =====
const speedtestBtn  = document.getElementById('speedtest-btn');
const speedtestCard = document.getElementById('speedtest-card');
const stClose       = document.getElementById('st-close');
const stRing        = document.getElementById('st-ring');
const stCenterVal   = document.getElementById('st-center-val');
const stCenterUnit  = document.getElementById('st-center-unit');
const stBars        = document.getElementById('st-bars');
const stQuality     = document.getElementById('st-quality');
const stPingVal     = document.getElementById('st-ping-val');
const stDlVal       = document.getElementById('st-dl-val');
const stRunBtn      = document.getElementById('st-run');
let stTestedOnce    = false;

function stShowPing(ms) {
  const poor = ms >= 450, fair = !poor && ms >= 200, good = !poor && !fair && ms >= 80;
  const qClass = poor ? 'poor' : fair ? 'fair' : good ? 'good' : 'great';
  const qLabels = { great: '連線優秀', good: '連線良好', fair: '連線普通', poor: '連線不穩定' };
  const qCss    = { great: 'ok',       good: 'ok',       fair: 'warn',     poor: 'bad' };
  stCenterVal.textContent  = String(ms);
  stCenterUnit.textContent = 'ms 延遲';
  stPingVal.textContent    = `${ms} ms`;
  stRing.className         = `st-ring q-${qClass}`;
  stBars.className         = `ls-signal-bars q-${qClass}`;
  stQuality.textContent    = qLabels[qClass];
  stQuality.className      = `st-quality-text ${qCss[qClass]}`;
  document.getElementById('st-icon-bars').className = `ls-signal-bars q-${qClass}`;
}

speedtestBtn.addEventListener('click', e => {
  e.stopPropagation();
  speedtestCard.classList.toggle('open');
  // Show loading-screen ping as preview if no full test has been run yet
  if (speedtestCard.classList.contains('open') && lastPingMs !== null && !stTestedOnce) {
    stShowPing(lastPingMs);
    stQuality.textContent += '（載入時測量）';
  }
});
stClose.addEventListener('click', () => speedtestCard.classList.remove('open'));
document.addEventListener('click', e => {
  if (!speedtestCard.contains(e.target) && e.target !== speedtestBtn)
    speedtestCard.classList.remove('open');
});

async function runSpeedTest() {
  stRunBtn.disabled = true;
  stRunBtn.textContent = '測試中…';
  stRing.className = 'st-ring running';
  stCenterVal.textContent = '—';
  stCenterUnit.textContent = 'ms 延遲';
  stPingVal.textContent = '—';
  stDlVal.textContent = '—';
  stQuality.textContent = '測試中…';
  stQuality.className = 'st-quality-text';
  stBars.className = 'ls-signal-bars';

  // Ping: 3 round trips
  const pings = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    await new Promise(res => socket.emit('ping-check', res));
    pings.push(Date.now() - t);
    await new Promise(r => setTimeout(r, 120));
  }
  const avgPing = Math.round(pings.reduce((a, b) => a + b) / pings.length);
  stPingVal.textContent = `${avgPing} ms`;
  stCenterVal.textContent = String(avgPing);

  // Download speed
  let dlMbps = null;
  try {
    const t0 = performance.now();
    const res = await fetch(`/api/speedtest?size=600000&_=${Date.now()}`, { cache: 'no-store' });
    const buf = await res.arrayBuffer();
    const secs = (performance.now() - t0) / 1000;
    dlMbps = (buf.byteLength * 8) / secs / 1_000_000;
    stDlVal.textContent = dlMbps < 1
      ? `${(dlMbps * 1000).toFixed(0)} Kbps`
      : `${dlMbps.toFixed(1)} Mbps`;
  } catch { stDlVal.textContent = '—'; }

  // Determine quality
  const poor = avgPing >= 450 || (dlMbps !== null && dlMbps < 0.5);
  const fair = !poor && (avgPing >= 200 || (dlMbps !== null && dlMbps < 2));
  const good = !poor && !fair && (avgPing >= 80 || (dlMbps !== null && dlMbps < 10));
  const qClass = poor ? 'poor' : fair ? 'fair' : good ? 'good' : 'great';
  const qLabels = { great: '連線優秀', good: '連線良好', fair: '連線普通', poor: '連線不穩定' };
  const qCss    = { great: 'ok',       good: 'ok',       fair: 'warn',     poor: 'bad' };

  stRing.className = `st-ring q-${qClass}`;
  stBars.className = `ls-signal-bars q-${qClass}`;
  stQuality.textContent = qLabels[qClass];
  stQuality.className   = `st-quality-text ${qCss[qClass]}`;
  document.getElementById('st-icon-bars').className = `ls-signal-bars q-${qClass}`;

  stTestedOnce = true;
  stRunBtn.disabled = false;
  stRunBtn.textContent = '再測一次';
}

stRunBtn.addEventListener('click', runSpeedTest);
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
function fmtSpeed(bps) {
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1048576) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / 1048576).toFixed(1)} MB/s`;
}
function fmtEta(sec) {
  if (sec < 60) return `${Math.ceil(sec)}s`;
  const m = Math.floor(sec / 60), s = Math.ceil(sec % 60);
  return `${m}m ${s}s`;
}

// ===== Transfer Progress =====
const currentTransfer = { active: false, filename: '', totalBytes: 0, startTime: 0, lastTime: 0, lastBytes: 0, speedBps: 0 };
const tpPanel   = document.getElementById('transfer-progress-panel');
const tpName    = document.getElementById('tp-filename');
const tpPct     = document.getElementById('tp-pct');
const tpSpeed   = document.getElementById('tp-speed');
const tpEta     = document.getElementById('tp-eta');
const tpBar     = document.getElementById('tp-bar');

function txStart(name, size) {
  Object.assign(currentTransfer, { active: true, filename: name, totalBytes: size, startTime: Date.now(), lastTime: Date.now(), lastBytes: 0, speedBps: 0 });
  tpName.textContent = name;
  tpPct.textContent  = '0%';
  tpSpeed.textContent = '—';
  tpEta.textContent  = '計算中…';
  tpBar.style.width  = '0%';
  tpPanel.classList.add('active');
}
function txUpdate(bytesNow) {
  if (!currentTransfer.active) return;
  const now = Date.now();
  const elapsed = (now - currentTransfer.lastTime) / 1000;
  if (elapsed >= 0.35) {
    currentTransfer.speedBps = (bytesNow - currentTransfer.lastBytes) / elapsed;
    currentTransfer.lastTime  = now;
    currentTransfer.lastBytes = bytesNow;
  }
  const fraction  = Math.min(bytesNow / currentTransfer.totalBytes, 1);
  const remaining = currentTransfer.totalBytes - bytesNow;
  const eta = currentTransfer.speedBps > 512 ? fmtEta(remaining / currentTransfer.speedBps) : '計算中…';
  tpBar.style.width   = `${Math.round(fraction * 100)}%`;
  tpPct.textContent   = `${Math.round(fraction * 100)}%`;
  tpSpeed.textContent = currentTransfer.speedBps > 0 ? fmtSpeed(currentTransfer.speedBps) : '—';
  tpEta.textContent   = eta;
}
function txEnd() {
  currentTransfer.active = false;
  tpPanel.classList.remove('active');
}

function addFileBubble(filename, filesize, isMine, peerName, blob) {
  removeChatEmpty();
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${isMine ? 'mine' : 'theirs'}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dlBtnHtml = (!isMine && blob) ? `
      <button class="file-redownload-btn" title="重新下載">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>` : '';
  wrap.innerHTML = `
    ${!isMine ? `<div class="chat-sender">${esc(peerName || 'Unknown')}</div>` : ''}
    <div class="file-bubble ${isMine ? 'mine' : 'theirs'}">
      <div class="file-bubble-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </div>
      <div class="file-bubble-meta">
        <div class="file-bubble-name">${esc(filename)}</div>
        <div class="file-bubble-size">${fmtBytes(filesize)}</div>
      </div>${dlBtnHtml}
    </div>
    <div class="chat-time">${time}</div>`;
  if (!isMine && blob) {
    wrap.querySelector('.file-redownload-btn').addEventListener('click', e => {
      e.stopPropagation();
      triggerDownload(blob, filename);
    });
  }
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
  joinPendingOverlay.classList.remove('active');
  existing.forEach(({ id, name, role, avatar }) => addPeer(id, name, true, role, avatar));
});
socket.on('peer-joined', ({ id, name, role, avatar }) => addPeer(id, name, false, role, avatar));
socket.on('peer-left',   id => removePeer(id));
socket.on('tunnel-url',  url => setShareUrl(url));

// ===== Join Approval =====
const joinPendingOverlay = document.getElementById('join-pending-overlay');
const joinRequestCard    = document.getElementById('join-request-card');
const jrQueueCount       = document.getElementById('jr-queue-count');
const jrAvatarWrap       = document.getElementById('jr-avatar-wrap');
const jrNameEl           = document.getElementById('jr-name');
const jrApproveBtn       = document.getElementById('jr-approve');
const jrRejectBtn        = document.getElementById('jr-reject');
const joinRequestQueue   = [];

function jrShowNext() {
  if (!joinRequestQueue.length) { joinRequestCard.classList.remove('active'); return; }
  const req = joinRequestQueue[0];
  jrNameEl.textContent = req.name;
  const extra = joinRequestQueue.length - 1;
  jrQueueCount.textContent = extra > 0 ? `+${extra} 更多` : '';
  jrQueueCount.style.display = extra > 0 ? '' : 'none';
  jrAvatarWrap.innerHTML = '';
  if (req.avatar) {
    const img = document.createElement('img');
    img.src = req.avatar;
    img.onerror = () => { img.remove(); jrShowInitial(req.name); };
    jrAvatarWrap.appendChild(img);
  } else { jrShowInitial(req.name); }
  joinRequestCard.classList.add('active');
}
function jrShowInitial(name) {
  const s = document.createElement('span');
  s.className = 'jr-initial';
  s.textContent = (name || '?')[0].toUpperCase();
  jrAvatarWrap.appendChild(s);
}

socket.on('join-pending', () => joinPendingOverlay.classList.add('active'));

socket.on('join-rejected', ({ message }) => {
  joinPendingOverlay.classList.add('active');
  const titleEl = joinPendingOverlay.querySelector('.jp-title');
  const subEl   = joinPendingOverlay.querySelector('.jp-sub');
  const spinEl  = joinPendingOverlay.querySelector('.jp-spinner');
  if (titleEl) titleEl.textContent = '加入請求被拒絕';
  if (subEl)   subEl.textContent   = message || '房主已拒絕你的加入請求';
  if (spinEl)  spinEl.style.display = 'none';
  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn-primary';
  retryBtn.style.cssText = 'margin-top:4px;padding:11px 32px;font-size:.9rem;';
  retryBtn.textContent = '重新整理';
  retryBtn.addEventListener('click', () => location.reload());
  joinPendingOverlay.querySelector('.jp-box').appendChild(retryBtn);
});

socket.on('join-request', ({ requestId, name, avatar }) => {
  joinRequestQueue.push({ requestId, name, avatar });
  if (joinRequestQueue.length === 1) jrShowNext();
  else { const extra = joinRequestQueue.length - 1; jrQueueCount.textContent = `+${extra} 更多`; jrQueueCount.style.display = ''; }
});

jrApproveBtn.addEventListener('click', () => {
  if (!joinRequestQueue.length) return;
  socket.emit('approve-join', { requestId: joinRequestQueue.shift().requestId });
  jrShowNext();
});
jrRejectBtn.addEventListener('click', () => {
  if (!joinRequestQueue.length) return;
  socket.emit('reject-join', { requestId: joinRequestQueue.shift().requestId });
  jrShowNext();
});

socket.on('room-reserved', ({ message }) => {
  toast(message || '此房號已被預留', 'error');
  // Redirect to a fresh random room
  const newId = Math.random().toString(36).slice(2, 8).toUpperCase();
  history.replaceState(null, '', `#${newId}`);
  roomId = newId;
  roomCodeEl.textContent = newId;
  socket.emit('join-room', { roomId: newId, name: myName, avatar: myAvatar });
});

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

socket.on('kicked-from-room', ({ message } = {}) => forceLeaveRoom(message || '你已被踢出房間'));
socket.on('room-banned',      ({ message } = {}) => forceLeaveRoom(message || '你已被此房間封鎖'));

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
    if (nameEl) nameEl.innerHTML = peerNameHtml(peer.name, peer.role);
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
  txStart(meta.name, meta.size);
});
socket.on('relay-file-chunk', ({ from, chunk }) => {
  const peer = peers.get(from);
  if (!peer?.receiving) return;
  const buf = toArrayBuffer(chunk);
  peer.receiving.chunks.push(buf);
  peer.receiving.received += buf.byteLength;
  setProgress(peer, peer.receiving.received / peer.receiving.size);
  txUpdate(peer.receiving.received);
});
socket.on('relay-file-end', ({ from, fileId, name }) => {
  const peer = peers.get(from);
  if (!peer?.receiving || peer.receiving.fileId !== fileId) return;
  const r = peer.receiving;
  const blob = download(r);
  addFileBubble(r.name, r.size, false, peer.name, blob);
  toast(`Received: ${r.name}`, 'success');
  peer.receiving = null;
  setProgress(peer, null);
  txEnd();
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
  refreshMembersPanel();

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

function forceLeaveRoom(message) {
  if (message) toast(message, 'error');
  peers.forEach((_, id) => { const p = peers.get(id); if (p) { p.pc.close(); if (p.element) p.element.remove(); } });
  peers.clear();
  selectedPeerId = null;
  noDevicesEl.style.display = 'flex';
  updatePositions();
  const newId = Math.random().toString(36).slice(2, 8).toUpperCase();
  roomId = newId;
  roomCodeEl.textContent = newId;
  history.replaceState(null, '', `#${newId}`);
  setShareUrl(null);
  socket.emit('join-room', { roomId: newId, name: myName, avatar: myAvatar });
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
  refreshMembersPanel();
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
    txStart(msg.name, msg.size);
  } else if (msg.type === 'file-end') {
    if (peer.receiving?.fileId === msg.fileId) {
      const r = peer.receiving;
      const blob = download(r);
      addFileBubble(r.name, r.size, false, peer.name, blob);
      toast(`Received: ${r.name}`, 'success');
      peer.receiving = null;
      setProgress(peer, null);
      txEnd();
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
  txUpdate(peer.receiving.received);
}

function download(r) {
  const blob = new Blob(r.chunks, { type: r.mime || 'application/octet-stream' });
  triggerDownload(blob, r.name);
  return blob;
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
  txStart(file.name, file.size);
  let offset = 0;
  while (offset < file.size) {
    while (peer.dc.bufferedAmount > MAX_BUFFER) await sleep(50);
    const buf = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    peer.dc.send(buf);
    offset += buf.byteLength;
    setProgress(peer, offset / file.size);
    txUpdate(offset);
  }
  peer.dc.send(JSON.stringify({ type: 'file-end', fileId }));
  setProgress(peer, null);
  txEnd();
  addFileBubble(file.name, file.size, true, peer.name, null);
  toast(`Sent: ${file.name}`, 'success');
}

async function sendFileViaRelay(peerId, file) {
  const peer = peers.get(peerId);
  const fileId = randId();
  socket.emit('relay-file-start', { to: peerId, meta: { fileId, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' } });
  txStart(file.name, file.size);
  let offset = 0;
  while (offset < file.size) {
    const buf = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    socket.emit('relay-file-chunk', { to: peerId, chunk: buf });
    offset += buf.byteLength;
    setProgress(peer, offset / file.size);
    txUpdate(offset);
    if (offset % (CHUNK_SIZE * 4) === 0) await sleep(10);
  }
  socket.emit('relay-file-end', { to: peerId, fileId, name: file.name });
  setProgress(peer, null);
  txEnd();
  addFileBubble(file.name, file.size, true, peer.name, null);
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

async function collectEntry(entry, out) {
  if (entry.isFile) {
    out.push(await new Promise((res, rej) => entry.file(res, rej)));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      for (const child of batch) await collectEntry(child, out);
    } while (batch.length > 0);
  }
}

async function getDropFiles(dataTransfer) {
  const items = dataTransfer.items ? [...dataTransfer.items] : null;
  if (items && items[0]?.webkitGetAsEntry) {
    const out = [];
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry();
      if (entry) await collectEntry(entry, out);
    }
    return out;
  }
  return [...dataTransfer.files];
}

dropZoneEl.addEventListener('dragover',  e => { e.preventDefault(); dropZoneEl.classList.add('dragover'); });
dropZoneEl.addEventListener('dragleave', e => { if (!dropZoneEl.contains(e.relatedTarget)) dropZoneEl.classList.remove('dragover'); });
dropZoneEl.addEventListener('drop',      async e => {
  e.preventDefault(); e.stopPropagation();
  dragDepth = 0; dragOverlayEl.classList.remove('visible');
  dropZoneEl.classList.remove('dragover');
  handleFiles(await getDropFiles(e.dataTransfer));
});
dropZoneEl.addEventListener('click',     e => { if (!e.target.closest('label')) fileInputEl.click(); });
fileInputEl.addEventListener('change',   () => { handleFiles([...fileInputEl.files]); fileInputEl.value = ''; });

const folderInputEl = document.getElementById('folder-input');
folderInputEl.addEventListener('change', () => { handleFiles([...folderInputEl.files]); folderInputEl.value = ''; });

// ===== Global Drag Overlay =====
document.addEventListener('dragenter', e => {
  if (!e.dataTransfer?.types?.includes('Files')) return;
  dragDepth++;
  dragOverlayEl.classList.add('visible');
});
document.addEventListener('dragleave', e => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragOverlayEl.classList.remove('visible');
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', async e => {
  e.preventDefault();
  dragDepth = 0;
  dragOverlayEl.classList.remove('visible');
  handleFiles(await getDropFiles(e.dataTransfer));
  // drop-zone handler calls stopPropagation() so this won't fire twice for drop-zone drops
});

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

function peerNameHtml(name, role) {
  const badge = PEER_ROLE_BADGE[role] || '';
  const dot = name.indexOf(' · ');
  if (dot !== -1) {
    return `<span class="peer-name-device">${esc(name.slice(0, dot))}</span><span class="peer-browser-badge">${esc(name.slice(dot + 3))}</span>${badge}`;
  }
  return `${esc(name)}${badge}`;
}

function canModeratePeer(targetRole) {
  const myR = currentUser?.role;
  if (!['admin', 'business'].includes(myR)) return false;
  if (myR === 'business' && ['admin', 'business'].includes(targetRole)) return false;
  return true;
}

function createPeerEl(peerId, name, role, avatar) {
  const el = document.createElement('div');
  el.className = 'peer-bubble' + (role ? ` has-${role}` : '');
  const showMod = canModeratePeer(role);
  el.innerHTML = `
    <div class="peer-icon">${peerIconHtml(name, avatar)}<div class="status-dot"></div></div>
    <span class="peer-name">${peerNameHtml(name, role)}</span>
    <div class="peer-progress"><div class="peer-progress-bar"></div></div>
    ${showMod ? `<div class="peer-actions">
      <button class="peer-action-btn" title="踢出房間"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
      <button class="peer-action-btn peer-action-ban" title="封鎖並踢出"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>
    </div>` : ''}`;
  el.addEventListener('click', () => {
    if (selectedPeerId !== peerId) { autoSelect(peerId); toast(`${name} selected`, 'info'); }
  });
  if (showMod) {
    const [kickBtn, banBtn] = el.querySelectorAll('.peer-action-btn');
    kickBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`踢出 ${name}？對方可重新加入房間。`)) socket.emit('room-kick', { peerId });
    });
    banBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`封鎖並踢出 ${name}？對方將無法重新加入本房間。`)) socket.emit('room-ban', { peerId });
    });
  }
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

lsEl.addEventListener('click', () => {
  clearTimeout(lsHideTimer); lsHideTimer = 1;
  clearTimeout(lsFinishTimer);
  lsHide();
});

// Force-hide loading screen after 7s if something goes wrong (only runs after landing dismissed)
setTimeout(() => { if (!lsHideTimer && landingDismissed) { lsSetStatus('連線逾時，請重新整理', 'bad'); lsHideTimer = setTimeout(lsHide, 2000); } }, 7000);

// ===== Landing Page =====
const landingEl = document.getElementById('landing-page');
const hasRoomHash = originalHash.length > 1;

if (hasRoomHash) {
  // Came via a shared room link — skip landing, go straight to app
  landingEl.style.display = 'none';
  landingDismissed = true;
} else {
  // Hide loading screen until user enters
  lsEl.style.display = 'none';
}

document.getElementById('lp-enter').addEventListener('click', () => {
  landingEl.classList.add('lp-hiding');
  setTimeout(() => {
    landingEl.style.display = 'none';
    landingDismissed = true;
    lsEl.style.display = 'flex';
    if (lsDonePending) lsDone();
    // Start 7s fallback from when the user enters the app
    setTimeout(() => {
      if (!lsHideTimer) { lsSetStatus('連線逾時，請重新整理', 'bad'); lsHideTimer = setTimeout(lsHide, 2000); }
    }, 7000);
  }, 480);
});

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

// ===== Members Panel =====
function refreshMembersPanel() {
  const list = document.getElementById('members-list');
  const badge = document.getElementById('members-count-badge');
  if (!list) return;
  const myRole = currentUser?.role;
  const isMod = ['admin', 'business'].includes(myRole);
  badge.textContent = peers.size;
  if (!peers.size) {
    list.innerHTML = `<div class="members-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      <p>目前沒有其他成員</p></div>`;
    return;
  }
  list.innerHTML = '';
  peers.forEach((peer, peerId) => {
    const row = document.createElement('div');
    row.className = 'member-row';
    const initial = (peer.name || '?')[0].toUpperCase();
    const avatarHtml = peer.avatar
      ? `<img src="${peer.avatar}" alt="">`
      : initial;
    const roleBadge = peer.role
      ? `<span class="member-role-badge member-role-${peer.role}">${{ admin:'👑 Admin', business:'💼 Business', vip:'💎 VIP' }[peer.role] || peer.role}</span>`
      : '';
    const canMod = isMod && !(myRole === 'business' && ['admin','business'].includes(peer.role));
    row.innerHTML = `
      <div class="member-avatar">${avatarHtml}</div>
      <div class="member-info">
        <div class="member-name">${escHtml(peer.name)}</div>
        ${roleBadge}
      </div>
      ${canMod ? `<div class="member-actions">
        <button class="member-kick-btn" data-id="${peerId}" title="踢出房間">踢出</button>
        <button class="member-ban-btn"  data-id="${peerId}" title="封鎖並踢出">封鎖</button>
      </div>` : ''}`;
    if (canMod) {
      row.querySelector('.member-kick-btn').addEventListener('click', () => {
        if (confirm(`踢出 ${peer.name}？對方可重新加入。`)) socket.emit('room-kick', { peerId });
      });
      row.querySelector('.member-ban-btn').addEventListener('click', () => {
        if (confirm(`封鎖並踢出 ${peer.name}？對方將無法重新加入本房間。`)) socket.emit('room-ban', { peerId });
      });
    }
    list.appendChild(row);
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== WebRTC check =====
if (!window.RTCPeerConnection) {
  document.getElementById('app').innerHTML =
    '<div style="text-align:center;padding:80px 20px;color:#888"><h2>Browser not supported</h2><p>Please use a modern browser.</p></div>';
}
