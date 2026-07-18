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
// Safe storage helpers — localStorage throws SecurityError in Safari private mode
const _ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k,v) => { try { localStorage.setItem(k,v); } catch {} }, del: k => { try { localStorage.removeItem(k); } catch {} } };
const _ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k,v) => { try { sessionStorage.setItem(k,v); } catch {} } };

let roomId = window.location.hash.slice(1);
// Priority: registered custom room (localStorage) → session room (sessionStorage) → URL hash → random
const _storedCustomRoom = _ls.get('webdrop-custom-room');
if (_storedCustomRoom) {
  roomId = _storedCustomRoom;
  history.replaceState(null, '', `#${roomId}`);
} else {
  const _sessionRoom = _ss.get('webdrop-session-room');
  if (_sessionRoom) {
    roomId = _sessionRoom;
    history.replaceState(null, '', `#${roomId}`);
  } else {
    if (!roomId) {
      roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
      history.replaceState(null, '', `#${roomId}`);
    }
    _ss.set('webdrop-session-room', roomId);
  }
}

// ===== Theme =====
const html = document.documentElement;

const THEMES = [
  { id: 'dark',        name: '星空黑', en: 'Dark',      bg: '#07071a', card: '#0e0e28', p: '#00d4ff', s: '#7b2ff7' },
  { id: 'light',       name: '晴空白', en: 'Light',     bg: '#f2f4fb', card: '#ffffff', p: '#0095cc', s: '#6622cc' },
  { id: 'midnight',    name: '賽博紫', en: 'Cyber',     bg: '#0e0040', card: '#1a0066', p: '#b060ff', s: '#ff2090' },
  { id: 'ocean',       name: '深海藍', en: 'Ocean',     bg: '#001840', card: '#002860', p: '#00aaff', s: '#5566ff' },
  { id: 'aurora',      name: '極光綠', en: 'Aurora',    bg: '#003320', card: '#005030', p: '#00ffaa', s: '#00ddff' },
  { id: 'sunset',      name: '焰橙',   en: 'Flame',     bg: '#2e0a00', card: '#481400', p: '#ff5500', s: '#ff0066' },
  { id: 'forest',      name: '抹茶',   en: 'Matcha',    bg: '#182400', card: '#263800', p: '#88ff00', s: '#22cc44' },
  { id: 'rose',         name: '霓虹粉',    en: 'Neon Pink',    bg: '#200020', card: '#340038', p: '#ff44cc', s: '#aa00ff' },
  { id: 'liquid-glass', name: '🫧 液態玻璃', en: 'Liquid Glass', bg: '#060a14', card: '#0d1828', p: '#7ce8ff', s: '#c4a8ff' },
  { id: 'vip',         name: '💎 尊爵紫', en: 'VIP',        bg: '#220030', card: '#380050', p: '#dd88ff', s: '#ff66aa', requiredRole: 'vip' },
  { id: 'business',    name: '💼 商務靛', en: 'Business',   bg: '#001428', card: '#002040', p: '#00bbff', s: '#00ffcc', requiredRole: 'business' },
  { id: 'admin',       name: '👑 王者金', en: 'Admin',      bg: '#241400', card: '#3c2000', p: '#ffcc00', s: '#ff7700', requiredRole: 'admin' },
  { id: 'super-admin', name: '⚡ 血焰赤', en: 'Super Admin', bg: '#220000', card: '#3a0000', p: '#ff0033', s: '#ff8800', requiredRole: 'super-admin' },
];

function _hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function _rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  }
  return [h * 360, s, l];
}
function _hslToRgb(h, s, l) {
  h /= 360;
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t < 0 && (t += 1); t > 1 && (t -= 1); return Math.round((t < 1/6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p) * 255); };
  return [f(h + 1/3), f(h), f(h - 1/3)];
}
function _deriveGlassColors(hex) {
  const [r, g, b] = _hexToRgb(hex);
  const [h, s, l] = _rgbToHsl(r, g, b);
  const sec = _hslToRgb((h + 150) % 360, Math.max(s, 0.65), Math.max(l, 0.62));
  const bg  = _hslToRgb(h, 0.40, 0.05);
  const cd  = _hslToRgb(h, 0.32, 0.09);
  const mt  = _hslToRgb(h, 0.50, 0.55);
  return { r, g, b, sec, bg, cd, mt };
}
function _applyCustomGlassVars(hex) {
  const { r, g, b, sec, bg, cd, mt } = _deriveGlassColors(hex);
  const bk = bg.map(v => Math.round(v * 0.85));
  let el = document.getElementById('custom-glass-style');
  if (!el) { el = document.createElement('style'); el.id = 'custom-glass-style'; document.head.appendChild(el); }
  el.textContent = `:root[data-theme="liquid-glass"]{` +
    `--bg:rgb(${bg});--bg-card:rgb(${cd});--bg-panel-r:rgb(${bk});` +
    `--border:rgba(${r},${g},${b},.12);--border-strong:rgba(${r},${g},${b},.24);` +
    `--primary:${hex};--primary-rgb:${r},${g},${b};--primary-dim:rgba(${r},${g},${b},.13);` +
    `--secondary:rgb(${sec});--secondary-rgb:${sec};` +
    `--text:#e8f2ff;--text-muted:rgba(${mt},.70);` +
    `--glow-primary:rgba(${r},${g},${b},.32);--glow-secondary:rgba(${sec},.22);` +
    `--chat-mine-bg:rgba(${r},${g},${b},.09);--chat-mine-bd:rgba(${r},${g},${b},.20);` +
    `--radar-ring:rgba(${r},${g},${b},.09);` +
    `--header-glass:rgba(${bg},.82);--tab-glass:rgba(${bg},.88);--input-bg:rgba(${cd},.72);}`;
}

const ROLE_RANK = { 'super-admin': 4, admin: 3, business: 2, vip: 1 };
function _userRoleRank() {
  return ROLE_RANK[currentUser && currentUser.role] || 0;
}
function _themeUnlocked(t) {
  if (!t.requiredRole) return true;
  return _userRoleRank() >= (ROLE_RANK[t.requiredRole] || 99);
}

function applyTheme(id) {
  html.setAttribute('data-theme', id);
  _ls.set('webdrop-theme', id);
  _refreshThemeCards();
  // keep old Google Sign-In theme in sync (light vs dark)
  const googleWrapper = document.getElementById('google-btn-wrap');
  if (googleWrapper) {
    const isLight = id === 'light';
    const btn = googleWrapper.querySelector('.g_id_signin [data-type]');
    if (btn) btn.setAttribute('data-theme', isLight ? 'outline' : 'filled_black');
  }
}
applyTheme(_ls.get('webdrop-theme') || 'dark');
{ const gc = _ls.get('webdrop-glass-color'); if (gc) _applyCustomGlassVars(gc); }

// Theme Store
function _buildThemePreview(t) {
  const bg = t.id === 'light' ? t.bg : t.bg;
  const textColor = t.id === 'light' ? '#1a1b2e' : 'rgba(255,255,255,.5)';
  const lineColor = t.id === 'light' ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.14)';
  return `<div class="theme-preview">
    <div class="tp-bg" style="background:${t.bg}">
      <div class="tp-header" style="background:${t.card}">
        <div class="tp-dot" style="background:${t.p}"></div>
        <div class="tp-dot" style="background:${t.s};opacity:.7"></div>
        <div class="tp-dot" style="background:${lineColor};flex:1;height:3px;border-radius:3px;margin-left:2px"></div>
      </div>
      <div class="tp-body">
        <div class="tp-line" style="background:${lineColor};width:85%"></div>
        <div class="tp-line" style="background:${lineColor};width:60%"></div>
        <div class="tp-pill" style="background:linear-gradient(90deg,${t.p},${t.s})"></div>
      </div>
    </div>
    <div class="tp-glow"></div>
  </div>`;
}

const ROLE_BADGE_LABEL = { vip: 'VIP', business: 'Business', admin: 'Admin', 'super-admin': 'Super Admin' };

function _buildThemeStore() {
  const grid = document.getElementById('theme-store-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const cur = html.getAttribute('data-theme') || 'dark';
  THEMES.forEach(t => {
    const unlocked = _themeUnlocked(t);
    const isActive = t.id === cur;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-card' + (isActive ? ' active' : '') + (unlocked ? '' : ' locked');
    card.dataset.themeId = t.id;
    const badge = t.requiredRole
      ? `<span class="theme-badge theme-badge-${t.requiredRole}">${ROLE_BADGE_LABEL[t.requiredRole]}</span>`
      : '';
    if (t.id === 'liquid-glass') {
      const gc = _ls.get('webdrop-glass-color') || t.p;
      const { sec, bg, cd } = _deriveGlassColors(gc);
      const pt = { ...t, bg: `rgb(${bg})`, card: `rgb(${cd})`, p: gc, s: `rgb(${sec})` };
      // Card button has NO <input> inside it — iOS Safari misbehaves when <input> is inside <button>
      card.innerHTML = `${_buildThemePreview(pt)}<div class="theme-name">${t.name}<small>${t.en}</small></div>`;
      // Color picker lives OUTSIDE the button as a sibling inside a wrapper div
      const wrap = document.createElement('div');
      wrap.className = 'tg-card-wrap';
      const colorRow = document.createElement('div');
      colorRow.className = 'tg-color-row';
      colorRow.innerHTML = `<span>主題色</span><input type="color" class="tg-color-input" value="${gc}">`;
      const picker = colorRow.querySelector('.tg-color-input');
      picker.addEventListener('input', e => {
        const hex = e.target.value;
        _ls.set('webdrop-glass-color', hex);
        _applyCustomGlassVars(hex);
        const { sec: s2, bg: b2, cd: c2 } = _deriveGlassColors(hex);
        const dots = card.querySelectorAll('.tp-dot');
        dots[0]?.style.setProperty('background', hex);
        dots[1]?.style.setProperty('background', `rgb(${s2})`);
        card.querySelector('.tp-bg')?.style.setProperty('background', `rgb(${b2})`);
        card.querySelector('.tp-header')?.style.setProperty('background', `rgb(${c2})`);
        card.querySelector('.tp-pill')?.style.setProperty('background', `linear-gradient(90deg,${hex},rgb(${s2}))`);
      });
      wrap.appendChild(card);
      wrap.appendChild(colorRow);
      card.addEventListener('click', e => {
        e.stopPropagation();
        applyTheme(t.id);
      });
      grid.appendChild(wrap);
      return;
    } else {
      card.innerHTML = `${_buildThemePreview(t)}<div class="theme-name">${t.name}<small>${t.en}</small>${badge}</div>`;
    }
    card.addEventListener('click', e => {
      e.stopPropagation();
      if (!unlocked) {
        const needed = ROLE_BADGE_LABEL[t.requiredRole] || t.requiredRole;
        toast(`此主題需要 ${needed} 權限才能使用`, 'error', 3500);
        return;
      }
      applyTheme(t.id);
    });
    grid.appendChild(card);
  });
}

function _refreshThemeCards() {
  const cur = html.getAttribute('data-theme') || 'dark';
  document.querySelectorAll('.theme-card').forEach(c => {
    const t = THEMES.find(x => x.id === c.dataset.themeId);
    c.classList.toggle('active', c.dataset.themeId === cur);
    if (t) c.classList.toggle('locked', !_themeUnlocked(t));
  });
}

const themeStoreModal = document.getElementById('theme-store-modal');
// iOS Safari: empty touchstart on the container lets buttons inside fire click on first tap
themeStoreModal.addEventListener('touchstart', () => {}, { passive: true });
document.getElementById('theme-store-btn').addEventListener('click', () => {
  _buildThemeStore();
  themeStoreModal.classList.add('active');
});
document.getElementById('theme-store-close').addEventListener('click', () => {
  themeStoreModal.classList.remove('active');
});
themeStoreModal.addEventListener('click', e => {
  if (e.target === themeStoreModal) themeStoreModal.classList.remove('active');
});

// Theme store from user dropdown
document.getElementById('theme-store-dropdown-btn')?.addEventListener('click', () => {
  document.getElementById('user-dropdown')?.classList.remove('active');
  _buildThemeStore();
  themeStoreModal.classList.add('active');
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
  if (tab === 'chat') { clearChatBadge(); setTimeout(markMessagesRead, 300); }
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
  img.onerror = () => { img.classList.remove('loading'); spinner.classList.add('hidden'); img.alt = 'QR 載入失敗，請複製下方連結'; };
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
let userToken    = null;
let currentUser  = null;
let googleConfig = false;

async function authApi(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
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
  if (customRoomId == null) { _ls.del('webdrop-custom-room'); return false; }
  if (customRoomId === roomId) return false;
  roomId = customRoomId;
  _ls.set('webdrop-custom-room', customRoomId);
  _ss.set('webdrop-session-room', customRoomId);
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

const ROLE_LABELS = { 'super-admin': '⚡ Super Admin', admin: '👑 Admin', vip: '💎 VIP', business: '💼 Business' };

function applyRoleStyle(role) {
  const badgeBtn = document.getElementById('user-badge-btn');
  const roleBadgeEl = document.getElementById('dropdown-role-badge');
  badgeBtn.classList.remove('role-admin', 'role-vip', 'role-super-admin');
  if (role === 'super-admin' || role === 'admin' || role === 'vip' || role === 'business') {
    badgeBtn.classList.add(`role-${role}`);
    roleBadgeEl.innerHTML = `<span class="role-badge-display role-${role}">${ROLE_LABELS[role]}</span>`;
    roleBadgeEl.style.display = 'flex';
    roleBadgeEl.style.justifyContent = 'center';
  } else {
    roleBadgeEl.style.display = 'none';
  }
  const isMod = ['super-admin', 'admin', 'business', 'vip'].includes(role);
  const isAdmin = role === 'admin' || role === 'super-admin';
  const adminFab = document.getElementById('admin-panel-btn');
  if (adminFab) adminFab.style.display = isMod ? 'flex' : 'none';
  const apBroadcast = document.getElementById('ap-broadcast-btn');
  const apClear = document.getElementById('ap-clear-btn');
  if (apBroadcast) apBroadcast.style.display = isAdmin ? '' : 'none';
  if (apClear) apClear.style.display = isAdmin ? '' : 'none';
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
  document.getElementById('dropdown-limit-val').textContent = fmtFileSizeMB(mb);
  applyRoleStyle(user.role);
  if (user.avatar !== undefined) myAvatar = user.avatar || null;
  if (user.name) myName = user.name;
}

function showGuestMode() {
  document.getElementById('user-badge-btn').style.display = 'none';
  document.getElementById('signin-btn').style.display = 'flex';
}

function userLogout() {
  fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  userToken   = null;
  currentUser = null;
  _ls.del('webdrop-custom-room');
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
let authMode  = 'login';
let phoneMode = false; // false | 'step1' | 'step2'
let _fbConfirmation = null;

const _emailInput        = document.getElementById('auth-email');
const _emailField        = _emailInput.parentElement;
const _pwField           = document.querySelector('.auth-field.pw-field');
const _pwInput           = document.getElementById('auth-password');
const _authTabs          = document.querySelector('.auth-tabs');
const _phoneHint         = document.getElementById('phone-sent-hint');
const _phoneBackBtn      = document.getElementById('phone-back-btn');
const _phoneFieldCont    = document.getElementById('phone-field-container');
const _phoneLocalInput   = document.getElementById('phone-local-input');
const _phoneCountryBtn   = document.getElementById('phone-country-btn');
const _phoneCountryDrop  = document.getElementById('phone-country-dropdown');
const _phoneCountrySearch= document.getElementById('phone-country-search');
const _phoneCountryList  = document.getElementById('phone-country-list');

const DIAL_COUNTRIES = [
  { flag:'🇹🇼', name:'台灣', en:'Taiwan', code:'+886' },
  { flag:'🇨🇳', name:'中國', en:'China', code:'+86' },
  { flag:'🇭🇰', name:'香港', en:'Hong Kong', code:'+852' },
  { flag:'🇲🇴', name:'澳門', en:'Macao', code:'+853' },
  { flag:'🇸🇬', name:'新加坡', en:'Singapore', code:'+65' },
  { flag:'🇲🇾', name:'馬來西亞', en:'Malaysia', code:'+60' },
  { flag:'🇯🇵', name:'日本', en:'Japan', code:'+81' },
  { flag:'🇰🇷', name:'韓國', en:'Korea', code:'+82' },
  { flag:'🇹🇭', name:'泰國', en:'Thailand', code:'+66' },
  { flag:'🇻🇳', name:'越南', en:'Vietnam', code:'+84' },
  { flag:'🇮🇩', name:'印尼', en:'Indonesia', code:'+62' },
  { flag:'🇵🇭', name:'菲律賓', en:'Philippines', code:'+63' },
  { flag:'🇮🇳', name:'印度', en:'India', code:'+91' },
  { flag:'🇵🇰', name:'巴基斯坦', en:'Pakistan', code:'+92' },
  { flag:'🇦🇺', name:'澳洲', en:'Australia', code:'+61' },
  { flag:'🇳🇿', name:'紐西蘭', en:'New Zealand', code:'+64' },
  { flag:'🇺🇸', name:'美國', en:'United States', code:'+1' },
  { flag:'🇨🇦', name:'加拿大', en:'Canada', code:'+1' },
  { flag:'🇬🇧', name:'英國', en:'United Kingdom', code:'+44' },
  { flag:'🇩🇪', name:'德國', en:'Germany', code:'+49' },
  { flag:'🇫🇷', name:'法國', en:'France', code:'+33' },
  { flag:'🇮🇹', name:'義大利', en:'Italy', code:'+39' },
  { flag:'🇪🇸', name:'西班牙', en:'Spain', code:'+34' },
  { flag:'🇳🇱', name:'荷蘭', en:'Netherlands', code:'+31' },
  { flag:'🇧🇷', name:'巴西', en:'Brazil', code:'+55' },
  { flag:'🇲🇽', name:'墨西哥', en:'Mexico', code:'+52' },
  { flag:'🇷🇺', name:'俄羅斯', en:'Russia', code:'+7' },
  { flag:'🇹🇷', name:'土耳其', en:'Turkey', code:'+90' },
  { flag:'🇮🇱', name:'以色列', en:'Israel', code:'+972' },
  { flag:'🇸🇦', name:'沙烏地阿拉伯', en:'Saudi Arabia', code:'+966' },
  { flag:'🇦🇪', name:'阿聯酋', en:'UAE', code:'+971' },
  { flag:'🇿🇦', name:'南非', en:'South Africa', code:'+27' },
  { flag:'🇳🇬', name:'奈及利亞', en:'Nigeria', code:'+234' },
  { flag:'🇺🇦', name:'烏克蘭', en:'Ukraine', code:'+380' },
  { flag:'🇵🇹', name:'葡萄牙', en:'Portugal', code:'+351' },
];
let _selectedDialCode = '+886';
let _fullPhoneNumber  = '';

function _buildCountryList(q) {
  const s = (q || '').toLowerCase();
  _phoneCountryList.innerHTML = '';
  DIAL_COUNTRIES.filter(c => !s || c.name.includes(s) || c.en.toLowerCase().includes(s) || c.code.includes(s)).forEach(c => {
    const li = document.createElement('li');
    li.className = 'phone-country-item' + (c.code === _selectedDialCode && c.flag === document.getElementById('phone-flag').textContent ? ' selected' : '');
    li.innerHTML = `<span class="pci-flag">${c.flag}</span><span class="pci-name">${c.name}<small>${c.en}</small></span><span class="pci-code">${c.code}</span>`;
    li.addEventListener('click', () => {
      _selectedDialCode = c.code;
      document.getElementById('phone-flag').textContent = c.flag;
      document.getElementById('phone-dialing-code').textContent = c.code;
      _closeCountryDrop();
      _phoneLocalInput.focus();
    });
    _phoneCountryList.appendChild(li);
  });
}

function _openCountryDrop() {
  _phoneCountryDrop.style.display = '';
  _phoneCountryBtn.setAttribute('aria-expanded', 'true');
  _phoneCountrySearch.value = '';
  _buildCountryList('');
  setTimeout(() => _phoneCountrySearch.focus(), 30);
}

function _closeCountryDrop() {
  _phoneCountryDrop.style.display = 'none';
  _phoneCountryBtn.setAttribute('aria-expanded', 'false');
}

_phoneCountryBtn.addEventListener('click', () => {
  _phoneCountryDrop.style.display !== 'none' ? _closeCountryDrop() : _openCountryDrop();
});

_phoneCountrySearch.addEventListener('input', () => _buildCountryList(_phoneCountrySearch.value));

document.addEventListener('click', e => {
  if (_phoneCountryDrop.style.display !== 'none' && !_phoneFieldCont.contains(e.target)) {
    _closeCountryDrop();
  }
});

function _toPhoneStep1() {
  phoneMode = 'step1';
  const trigger = document.getElementById('phone-login-trigger');
  trigger.classList.add('active');
  trigger.querySelector('svg').outerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>';
  trigger.querySelector('span').textContent = '使用電子信箱';
  _emailField.style.display = 'none';
  _phoneFieldCont.style.display = '';
  _pwField.style.display = 'none';
  _authTabs.style.display = 'none';
  _phoneHint.style.display = 'none';
  _phoneBackBtn.style.display = 'none';
  authSubmit.textContent = i18n.t('send-otp') || 'Send Code';
  authError.textContent = '';
  _buildCountryList('');
  setTimeout(() => _phoneLocalInput.focus(), 50);
}

function _toPhoneStep2(phone) {
  phoneMode = 'step2';
  _phoneHint.textContent = i18n.t('otp-sent-to').replace('{phone}', phone);
  _phoneHint.style.display = '';
  _phoneFieldCont.style.display = 'none';
  _pwField.style.display = '';
  _pwInput.type = 'text'; _pwInput.placeholder = '000000'; _pwInput.maxLength = 6;
  _pwInput.pattern = '[0-9]*'; _pwInput.inputMode = 'numeric'; _pwInput.autocomplete = 'one-time-code';
  _pwInput.style.cssText += ';letter-spacing:.25em;text-align:center;font-size:1.2rem';
  _pwInput.value = '';
  const toggle = _pwField.querySelector('.pw-toggle'); if (toggle) toggle.style.display = 'none';
  _phoneBackBtn.style.display = '';
  authSubmit.textContent = i18n.t('verify-otp') || 'Verify';
  authError.textContent = '';
  setTimeout(() => _pwInput.focus(), 50);
}

function _resetToEmail() {
  phoneMode = false; _fbConfirmation = null;
  const trigger = document.getElementById('phone-login-trigger');
  trigger.classList.remove('active');
  trigger.querySelector('svg').outerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.28h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.98a16 16 0 0 0 6 6l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  trigger.querySelector('span').dataset.i18n = 'continue-phone';
  trigger.querySelector('span').textContent = i18n.t('continue-phone') || 'Continue with Phone';
  _emailField.style.display = '';
  _phoneFieldCont.style.display = 'none';
  _closeCountryDrop();
  _phoneLocalInput.value = '';
  _emailInput.value = '';
  _pwField.style.display = '';
  _pwInput.type = 'password'; _pwInput.placeholder = 'Password';
  _pwInput.maxLength = 524288; _pwInput.pattern = ''; _pwInput.inputMode = '';
  _pwInput.autocomplete = 'current-password'; _pwInput.value = '';
  _pwInput.style.letterSpacing = ''; _pwInput.style.textAlign = ''; _pwInput.style.fontSize = '';
  const toggle = _pwField.querySelector('.pw-toggle'); if (toggle) toggle.style.display = '';
  _authTabs.style.display = '';
  _phoneHint.style.display = 'none';
  _phoneBackBtn.style.display = 'none';
  authSubmit.textContent = authMode === 'login' ? (i18n.t('auth-submit') || 'Sign In') : (i18n.t('create-account') || 'Create Account');
  authError.textContent = '';
}

document.getElementById('phone-login-trigger').addEventListener('click', () => {
  phoneMode ? _resetToEmail() : _toPhoneStep1();
});

_phoneBackBtn.addEventListener('click', () => { _toPhoneStep1(); });

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
  authError.textContent = '';
  authSubmit.disabled = true;
  const prevText = authSubmit.textContent;
  authSubmit.textContent = '...';

  try {
    if (phoneMode === 'step1') {
      const localNum = _phoneLocalInput.value.trim().replace(/^0/, '').replace(/[\s\-]/g, '');
      if (!localNum) { authError.textContent = 'Phone number required'; return; }
      const phone = _selectedDialCode + localNum;
      _fullPhoneNumber = phone;
      if (window._fbAuth) {
        if (!window._fbRecaptcha) {
          const { RecaptchaVerifier } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
          if (!document.getElementById('fb-recaptcha')) { const d = document.createElement('div'); d.id = 'fb-recaptcha'; document.body.appendChild(d); }
          window._fbRecaptcha = new RecaptchaVerifier(window._fbAuth, 'fb-recaptcha', { size: 'invisible' });
        }
        const { signInWithPhoneNumber } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        _fbConfirmation = await signInWithPhoneNumber(window._fbAuth, phone, window._fbRecaptcha);
      } else {
        await authApi('POST', '/api/auth/phone/send', { phone });
      }
      _toPhoneStep2(phone);
      return;
    }

    if (phoneMode === 'step2') {
      const otp = _pwInput.value.trim();
      if (!otp) { authError.textContent = 'Code required'; return; }
      let data;
      if (_fbConfirmation) {
        const cred = await _fbConfirmation.confirm(otp);
        data = await authApi('POST', '/api/auth/firebase-phone', { idToken: await cred.user.getIdToken() });
      } else {
        data = await authApi('POST', '/api/auth/phone/verify', { phone: _fullPhoneNumber, otp });
      }
      onLoginSuccess(data, false);
      return;
    }

    // Email/password mode
    const email    = _emailInput.value.trim();
    const password = _pwInput.value;
    if (!email || !password) { authError.textContent = 'Email and password required'; return; }
    const data = await authApi('POST', `/api/auth/${authMode}`, { email, password });
    onLoginSuccess(data, authMode === 'register');
  } catch (e) {
    authError.textContent = e.message || e.code || 'Error';
    if (phoneMode === 'step1' && window._fbRecaptcha) { window._fbRecaptcha.clear(); window._fbRecaptcha = null; }
  } finally {
    authSubmit.disabled = false;
    if (phoneMode !== 'step2') authSubmit.textContent = prevText;
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
    { theme: html.getAttribute('data-theme') === 'light' ? 'outline' : 'filled_black', size: 'large', width: 300, text: 'continue_with' }
  );
}


// ===== Password Show/Hide Toggles =====
const _pwAutoHideTimers = new WeakMap();
document.addEventListener('click', e => {
  const btn = e.target.closest('.pw-toggle');
  if (!btn) return;
  const input = document.getElementById(btn.dataset.target);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.querySelector('.pw-eye-off').style.display = show ? 'none' : '';
  btn.querySelector('.pw-eye-on').style.display  = show ? '' : 'none';
  setTimeout(() => input.focus(), 0);
  if (_pwAutoHideTimers.has(btn)) clearTimeout(_pwAutoHideTimers.get(btn));
  if (show) {
    _pwAutoHideTimers.set(btn, setTimeout(() => {
      input.type = 'password';
      btn.querySelector('.pw-eye-off').style.display = '';
      btn.querySelector('.pw-eye-on').style.display  = 'none';
      _pwAutoHideTimers.delete(btn);
    }, 3000));
  }
});

// ===== Set Room ID Modal =====
const setRoomModal = document.getElementById('set-room-modal');
const setRoomInput = document.getElementById('set-room-input');
const setRoomError = document.getElementById('set-room-error');

const _roomAdj  = ['SWIFT','BLUE','RED','DARK','GOLD','WILD','COOL','NEON','BOLD','BRIGHT','IRON','STORM'];
const _roomNoun = ['STAR','MOON','WOLF','HAWK','LION','FISH','WIND','FIRE','WAVE','PEAK','BIRD','ROCK'];
function generateRoomId() {
  const adj  = _roomAdj[Math.floor(Math.random() * _roomAdj.length)];
  const noun = _roomNoun[Math.floor(Math.random() * _roomNoun.length)];
  const num  = Math.floor(Math.random() * 90) + 10;
  return `${adj}${noun}${num}`;
}

function openSetRoomModal() {
  setRoomInput.value = '';
  setRoomError.textContent = '';
  setRoomModal.classList.add('active');
}

document.getElementById('set-room-random')?.addEventListener('click', () => {
  setRoomInput.value = generateRoomId();
  setRoomError.textContent = '';
});

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
      document.getElementById('dropdown-limit-val').textContent = fmtFileSizeMB(mb);
      if (data.customRoomId) { currentUser.customRoomId = data.customRoomId; applyCustomRoom(data.customRoomId); }
      if (data.canCustomRoom) { currentUser.canCustomRoom = true; setEditRoomBtnVisible(true); }
      if (data.role && data.role !== currentUser.role) {
        currentUser.role = data.role;
        applyRoleStyle(data.role);
      }
    }
    const roleMsg = data.promo?.grantRole ? `，角色已升級為 ${data.promo.grantRole}` : '';
    toast(`序號兌換成功！檔案限制：${mb} MB${roleMsg}`, 'success');
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
    _ls.del('wd-lang');
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
copyQRUrlBtn.addEventListener('click', () => {
  qrModal.dataset.userInteracted = '1';
  navigator.clipboard.writeText(shareUrl).then(() => toast(i18n.t('link-copied'), 'success')).catch(() => toast(i18n.t('copy-failed'), 'error'));
});
showQRBtn.addEventListener('click', () => { delete qrModal.dataset.userInteracted; qrModal.classList.add('active'); });
closeQRBtn.addEventListener('click', () => { delete qrModal.dataset.userInteracted; qrModal.classList.remove('active'); });
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
  try { await _runSpeedTestCore(); }
  catch(e) { stRing.className = 'st-ring q-poor'; stQuality.textContent = '測試失敗'; }
  finally { stRunBtn.disabled = false; stRunBtn.textContent = '再測一次'; }
}
async function _runSpeedTestCore() {

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
}

stRunBtn.addEventListener('click', runSpeedTest);
closeQRBtn.addEventListener('click', () => qrModal.classList.remove('active'));
qrModal.addEventListener('click', e => { if (e.target === qrModal) qrModal.classList.remove('active'); });

document.getElementById('open-share-btn').addEventListener('click', () => qrModal.classList.add('active'));

function setNoDevicesHint(mode) {
  const titleEl = noDevicesEl?.querySelector('.no-dev-title');
  const shareBtn = noDevicesEl?.querySelector('#open-share-btn');
  if (!titleEl) return;
  if (mode === 'reconnected') {
    titleEl.textContent = '連線重建中，若對方消失了…';
    if (shareBtn) shareBtn.textContent = '請對方重新整理頁面';
  } else if (mode === 'disconnected') {
    titleEl.textContent = '連線中斷，嘗試重連…';
    if (shareBtn) shareBtn.style.display = 'none';
  } else {
    titleEl.setAttribute('data-i18n', 'no-devices');
    titleEl.textContent = titleEl.getAttribute('data-i18n') ? (window.i18n?.t('no-devices') || 'No devices nearby') : 'No devices nearby';
    if (shareBtn) { shareBtn.style.display = ''; shareBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/><line x1="14" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="20" y2="17"/><line x1="14" y1="17" x2="14" y2="20"/><line x1="14" y1="20" x2="17" y2="20"/></svg><span data-i18n="share-qr">Share QR Code</span>`; }
  }
}

document.getElementById('room-closed-new').addEventListener('click', () => {
  const newId = Math.random().toString(36).slice(2, 8).toUpperCase();
  _ss.set('webdrop-session-room', newId);
  _ls.del('webdrop-custom-room');
  window.location.href = `${window.location.origin}/#${newId}`;
  window.location.reload();
});

// ===== Chat UI =====
// ===== Chat Enhancement State =====
let _msgIdCounter = 0;
function randMsgId() { return `${Date.now().toString(36)}${(++_msgIdCounter).toString(36)}`; }
const reactionStore = new Map(); // msgId → Map<"from:emoji", emoji>
const sentMsgs = new Map();      // msgId → { el }
let _replyingTo = null;          // { msgId, text, sender }
let _pendingReadMsgIds = new Set();

function addChatMsg(sender, text, isMine, { msgId, replyTo, fromPeerId } = {}) {
  removeChatEmpty();
  const id = msgId || randMsgId();
  const el = document.createElement('div');
  el.className = `chat-msg ${isMine ? 'mine' : 'theirs'}`;
  el.dataset.msgId = id;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const replyHtml = replyTo ? `
    <div class="reply-quote" data-target="${replyTo.msgId}">
      <span class="reply-quote-sender">${esc(replyTo.sender || '')}</span>
      <span class="reply-quote-text">${esc((replyTo.text || '').length > 60 ? replyTo.text.slice(0, 60) + '…' : replyTo.text || '')}</span>
    </div>` : '';

  el.innerHTML = `
    ${!isMine ? `<div class="chat-sender">${esc(sender)}</div>` : ''}
    <div class="chat-bubble">
      ${replyHtml}
      <div class="chat-text">${esc(text)}</div>
      <div class="chat-footer">
        <span class="chat-time">${time}</span>
        ${isMine ? '<span class="msg-tick" title="已傳送">✓</span>' : ''}
      </div>
    </div>
    <div class="msg-reactions"></div>
    <div class="msg-actions">
      <button class="msg-react-btn" title="表情反應">😊</button>
      <button class="msg-reply-btn" title="回覆">↩</button>
    </div>`;

  el.querySelector('.reply-quote')?.addEventListener('click', () => scrollToMsg(replyTo.msgId));
  el.querySelector('.msg-react-btn').addEventListener('click', e => { e.stopPropagation(); showReactionPicker(id, e.currentTarget); });
  el.querySelector('.msg-reply-btn').addEventListener('click', () => setReply(id, text, isMine ? 'You' : sender));

  if (isMine) {
    sentMsgs.set(id, { el });
  } else {
    _pendingReadMsgIds.add(id);
    if (activeTab === 'chat') setTimeout(markMessagesRead, 400);
  }

  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  if (!isMine) bumpChatBadge();
  // Keep search results in sync when new message arrives mid-search
  const searchBar = document.getElementById('chat-search-bar');
  const searchInp = document.getElementById('chat-search-input');
  if (searchBar?.style.display !== 'none' && searchInp?.value.trim()) {
    const q = searchInp.value.trim();
    const prevIdx = _searchIdx;
    doSearch(q);
    _searchIdx = Math.min(prevIdx, Math.max(0, _searchResults.length - 1));
    if (_searchResults.length) highlightResult();
  }
}

function scrollToMsg(msgId) {
  const el = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('msg-flash');
  setTimeout(() => el.classList.remove('msg-flash'), 1000);
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
function fmtFileSizeMB(mb) {
  if (mb >= 999999) return '∞ Unlimited';
  const gb = mb / 1024;
  if (gb >= 512) {
    const tb = Math.round(gb / 1024 * 10) / 10;
    return `${tb % 1 === 0 ? tb | 0 : tb} TB`;
  }
  if (gb >= 1) {
    const g = Math.round(gb * 10) / 10;
    return `${g % 1 === 0 ? g | 0 : g} GB`;
  }
  return `${mb} MB`;
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
  const isImage = blob && (blob.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename));

  if (isImage) {
    const url = URL.createObjectURL(blob);
    wrap.innerHTML = `
      ${!isMine ? `<div class="chat-sender">${esc(peerName || 'Unknown')}</div>` : ''}
      <div class="chat-image-wrap ${isMine ? 'mine' : ''}">
        <img class="chat-img-preview" src="${url}" alt="${esc(filename)}" loading="lazy" title="${esc(filename)}">
        <div class="chat-img-meta">${esc(filename)} · ${fmtBytes(filesize)}</div>
        ${!isMine ? `<button class="chat-img-dl" title="下載"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : ''}
      </div>
      <div class="chat-time">${time}</div>`;
    wrap.querySelector('.chat-img-preview').addEventListener('click', () => window.open(url, '_blank'));
    if (!isMine) wrap.querySelector('.chat-img-dl')?.addEventListener('click', e => { e.stopPropagation(); triggerDownload(blob, filename); });
  } else {
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
  }
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
  if (!isMine) bumpChatBadge();
}

// ===== Socket.io =====
let roomClosedByAdmin = false;
const socket = io({ auth: { userToken: userToken || null, webdriver: !!navigator.webdriver } });

let _roomPassword = null; // password for current room (set when joining password-protected room)

function rejoinRoom() {
  if (roomClosedByAdmin) return;
  socket.emit('join-room', { roomId, name: myName, avatar: myAvatar, password: _roomPassword || undefined });
}

window.addEventListener('hashchange', () => {
  const newId = window.location.hash.slice(1).toUpperCase();
  if (!newId || newId === roomId) return;
  // Always revert — changing rooms via URL bar is not supported in any user type.
  // To join a different room, open a new tab with the target URL.
  history.replaceState(null, '', `#${roomId}`);
  if (currentUser?.customRoomId) {
    toast('你有已登記的房號，如需更換請使用右上角編輯按鈕', 'info', 3500);
  }
});

let _hasConnectedOnce = false;

socket.on('connect', () => {
  document.getElementById('maintenance-overlay').style.display = 'none';
  if (_hasConnectedOnce) {
    toast('連線已重建。若對方看不到你，請對方重新整理頁面。', 'info', 6000);
    setNoDevicesHint('reconnected');
  }
  _hasConnectedOnce = true;
  lsSetStatus('已連線，測量延遲…');
  const t0 = Date.now();
  socket.timeout(5000).emit('ping-check', (err) => {
    if (!err) lsShowPing(Date.now() - t0);
    else lsSetStatus('連線已建立', 'ok');
    lsDone();
  });
  rejoinRoom();
});

socket.on('disconnect', () => {
  if (_hasConnectedOnce) setNoDevicesHint('disconnected');
});

// ===== Captcha =====
let _captchaSiteKey = null;
let _turnstileWidgetId = null;

function _loadTurnstile(siteKey, cb) {
  if (window.turnstile) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  s.async = true; s.defer = true;
  s.onload = cb;
  document.head.appendChild(s);
}

function showCaptchaModal(siteKey) {
  _captchaSiteKey = siteKey;
  document.getElementById('captcha-modal').classList.add('active');
  document.getElementById('captcha-status').textContent = '';
  const container = document.getElementById('turnstile-container');

  _loadTurnstile(siteKey, () => {
    if (_turnstileWidgetId !== null) {
      try { window.turnstile.reset(_turnstileWidgetId); } catch {}
      return;
    }
    _turnstileWidgetId = window.turnstile.render(container, {
      sitekey: siteKey,
      theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
      callback: async (token) => {
        const statusEl = document.getElementById('captcha-status');
        statusEl.textContent = '驗證中…';
        try {
          const r = await fetch('/api/captcha/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          });
          const j = await r.json();
          if (j.ok) {
            statusEl.textContent = '';
            document.getElementById('captcha-modal').classList.remove('active');
            socket.emit('captcha-cleared');
            toast('驗證成功，歡迎使用 WebDrop！', 'success');
          } else {
            statusEl.textContent = '驗證失敗，請重試。';
            window.turnstile.reset(_turnstileWidgetId);
          }
        } catch {
          statusEl.textContent = '驗證服務暫時無法使用，請稍後再試。';
          window.turnstile.reset(_turnstileWidgetId);
        }
      },
      'error-callback': () => {
        document.getElementById('captcha-status').textContent = '驗證載入失敗，請重新整理頁面。';
      }
    });
  });
}

socket.on('require-captcha', ({ siteKey }) => {
  showCaptchaModal(siteKey);
});

socket.on('captcha-ok', () => {
  rejoinRoom();
});

socket.on('captcha-needed', () => {
  if (_captchaSiteKey) showCaptchaModal(_captchaSiteKey);
  else toast('請先完成安全驗證', 'error');
});

let _reservedRetryTimer = null;

socket.on('room-joined', ({ peers: existing, roomSettings: rs, closeAt, hasPassword }) => {
  joinPendingOverlay.classList.remove('active');
  clearTimeout(_reservedRetryTimer);
  existing.forEach(({ id, name, role, avatar, userId }) => addPeer(id, name, true, role, avatar, userId));
  if (rs) applyRoomSettings(rs);
  requestNotificationPermission();
  startRoomTimer(closeAt || null);
  if (hasPassword) _roomPassword = _roomPassword || ''; // keep existing password
});
socket.on('room-settings', applyRoomSettings);
socket.on('peer-joined', ({ id, name, role, avatar, userId }) => addPeer(id, name, false, role, avatar, userId));
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
  toast(`📲 ${name || '有人'} 想加入房間，請點擊同意！`, 'info', 8000);
  try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch {}
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

document.getElementById('jp-leave-btn')?.addEventListener('click', () => {
  clearTimeout(_reservedRetryTimer);
  document.getElementById('join-pending-overlay')?.classList.remove('active');
  socket.disconnect();
  window.location.href = window.location.origin;
});

socket.on('room-reserved', ({ message }) => {
  // Show waiting UI — do NOT redirect; retry joining the same room until host arrives
  const pendingOverlay = document.getElementById('join-pending-overlay');
  const titleEl = pendingOverlay?.querySelector('.jp-title');
  const subEl   = pendingOverlay?.querySelector('.jp-sub');
  if (titleEl) titleEl.textContent = '等待房主開啟房間';
  if (subEl)   subEl.textContent   = '房間尚未開啟，將自動重試…';
  pendingOverlay?.classList.add('active');

  clearTimeout(_reservedRetryTimer);
  _reservedRetryTimer = setTimeout(function retry() {
    if (!pendingOverlay?.classList.contains('active')) return;
    socket.emit('join-room', { roomId, name: myName, avatar: myAvatar });
    _reservedRetryTimer = setTimeout(retry, 5000);
  }, 5000);
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

socket.on('room-denied', ({ reason, message } = {}) => {
  if (reason === 'wrong-password') {
    const modal = document.getElementById('room-password-modal');
    const errEl = document.getElementById('room-pw-error');
    if (errEl) errEl.textContent = _roomPassword ? '密碼錯誤，請再試一次' : '';
    if (modal) modal.classList.add('active');
    setTimeout(() => document.getElementById('room-pw-input')?.focus(), 100);
  } else {
    toast(message || '無法加入房間', 'error');
  }
});

socket.on('room-timer', ({ closeAt }) => startRoomTimer(closeAt));

socket.on('server-broadcast', ({ message, sender, at }) => {
  const chatPanel = document.getElementById('panel-chat');
  const chatMessages = document.getElementById('chat-messages');
  if (chatMessages) {
    const div = document.createElement('div');
    div.className = 'broadcast-msg';
    div.innerHTML = `<span class="broadcast-icon">📢</span><strong>${escHtml(sender)}</strong>：${escHtml(message)}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  toast(`📢 ${sender}：${message}`, 'info');
});

socket.on('room-cleared', ({ count }) => {
  toast(`已清場，踢出 ${count} 名成員`, 'success');
});

socket.on('peer-role-updated', ({ peerId, role }) => {
  const peer = peers.get(peerId);
  if (peer) { peer.role = role; refreshMembersPanel(); }
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
    if (el) el.textContent = fmtFileSizeMB(mb);
  }
});

socket.on('account-banned', ({ reason } = {}) => {
  fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
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
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
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

// ===== Room Timer =====
let _roomCloseAt = null;
let _timerInterval = null;

function startRoomTimer(closeAt) {
  _roomCloseAt = closeAt;
  clearInterval(_timerInterval);
  const timerEl = document.getElementById('room-timer');
  const valEl = document.getElementById('room-timer-val');
  if (!closeAt || !timerEl || !valEl) { if (timerEl) timerEl.style.display = 'none'; return; }
  timerEl.style.display = 'flex';
  timerEl.classList.remove('warn');
  let _warned30 = false;
  function tick() {
    const rem = Math.max(0, _roomCloseAt - Date.now());
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    valEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (rem <= 60000) timerEl.classList.add('warn');
    if (rem <= 30000 && rem > 0 && !_warned30) {
      _warned30 = true;
      toast('⏱ 房間將在 30 秒後自動關閉', 'error', 8000);
    }
    if (rem === 0) clearInterval(_timerInterval);
  }
  tick();
  _timerInterval = setInterval(tick, 1000);
}

// ===== Room Password Modal =====
document.getElementById('room-pw-submit')?.addEventListener('click', () => {
  const pw = document.getElementById('room-pw-input')?.value?.trim();
  const errEl = document.getElementById('room-pw-error');
  if (!pw) { if (errEl) errEl.textContent = '請輸入密碼'; return; }
  _roomPassword = pw;
  document.getElementById('room-password-modal')?.classList.remove('active');
  socket.emit('join-room', { roomId, name: myName, avatar: myAvatar, password: pw });
});

document.getElementById('room-pw-cancel')?.addEventListener('click', () => {
  document.getElementById('room-password-modal')?.classList.remove('active');
});

document.getElementById('room-pw-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('room-pw-submit')?.click();
});

// QR in chat
document.getElementById('chat-qr-btn')?.addEventListener('click', () => qrModal.classList.add('active'));

// ===== Sound =====
let _soundEnabled = _ls.get('wd-chat-sound') !== '0';

(function initSoundBtn() {
  const btn = document.getElementById('chat-sound-btn');
  const onIcon  = document.getElementById('sound-on-icon');
  const offIcon = document.getElementById('sound-off-icon');
  function applySound(on) {
    if (onIcon)  onIcon.style.display  = on ? '' : 'none';
    if (offIcon) offIcon.style.display = on ? 'none' : '';
    if (btn) btn.title = on ? '靜音' : '開啟音效';
  }
  applySound(_soundEnabled);
  btn?.addEventListener('click', () => {
    _soundEnabled = !_soundEnabled;
    _ls.set('wd-chat-sound', _soundEnabled ? '1' : '0');
    applySound(_soundEnabled);
    toast(_soundEnabled ? '🔊 音效已開啟' : '🔇 音效已靜音', 'info');
  });
})();

function playChatSound() {
  if (!_soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.22);
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

// ===== Reply =====
function setReply(msgId, text, sender) {
  _replyingTo = { msgId, text, sender };
  document.getElementById('reply-preview-sender').textContent = sender;
  document.getElementById('reply-preview-text').textContent = text.length > 80 ? text.slice(0, 80) + '…' : text;
  document.getElementById('reply-preview').style.display = 'flex';
  messageInputEl?.focus();
}
function clearReply() {
  _replyingTo = null;
  document.getElementById('reply-preview').style.display = 'none';
}
document.getElementById('reply-cancel-btn')?.addEventListener('click', clearReply);

// ===== Emoji Reactions =====
let _reactionTargetId = null;
const reactionPickerEl = document.getElementById('reaction-picker');

function showReactionPicker(msgId, anchor) {
  _reactionTargetId = msgId;
  if (!reactionPickerEl) return;
  const rect = anchor.getBoundingClientRect();
  reactionPickerEl.style.display = 'flex';
  const pickerW = reactionPickerEl.offsetWidth || 200;
  const pickerH = reactionPickerEl.offsetHeight || 44;
  const gap = 6;
  let top  = rect.top  + window.scrollY - pickerH - gap;
  let left = rect.left + window.scrollX;
  // Flip to below anchor if too close to top
  if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + gap;
  // Clamp right edge
  if (left + pickerW + 8 > window.innerWidth) left = window.innerWidth - pickerW - 8;
  if (left < 8) left = 8;
  // Clamp bottom edge
  if (top + pickerH > window.scrollY + window.innerHeight - 8) top = window.scrollY + window.innerHeight - pickerH - 8;
  reactionPickerEl.style.top  = `${top}px`;
  reactionPickerEl.style.left = `${left}px`;
}

document.addEventListener('click', e => {
  if (reactionPickerEl && !reactionPickerEl.contains(e.target) && !e.target.closest('.msg-react-btn')) {
    reactionPickerEl.style.display = 'none';
    _reactionTargetId = null;
  }
});

reactionPickerEl?.querySelectorAll('.reaction-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!_reactionTargetId) return;
    const emoji = btn.dataset.emoji;
    doSendReaction(_reactionTargetId, emoji);
    reactionPickerEl.style.display = 'none';
    _reactionTargetId = null;
  });
});

function doSendReaction(msgId, emoji) {
  applyReaction(msgId, emoji, 'me');
  const targets = resolveTargets() || Array.from(peers.keys());
  targets.forEach(id => {
    if (dcReady(id)) peers.get(id).dc.send(JSON.stringify({ type: 'reaction', msgId, emoji }));
    else socket.emit('relay-reaction', { to: id, msgId, emoji });
  });
}

function handleReaction(msgId, emoji, fromId) {
  applyReaction(msgId, emoji, fromId);
}

function applyReaction(msgId, emoji, fromId) {
  if (!reactionStore.has(msgId)) reactionStore.set(msgId, new Map());
  const store = reactionStore.get(msgId);
  const key = `${fromId}:${emoji}`;
  if (store.has(key)) store.delete(key); else store.set(key, emoji);
  renderReactions(msgId);
}

function renderReactions(msgId) {
  const el = document.querySelector(`[data-msg-id="${msgId}"] .msg-reactions`);
  if (!el) return;
  const store = reactionStore.get(msgId);
  if (!store || !store.size) { el.innerHTML = ''; return; }
  const counts = new Map();
  for (const emoji of store.values()) counts.set(emoji, (counts.get(emoji) || 0) + 1);
  el.innerHTML = [...counts.entries()].map(([e, n]) =>
    `<span class="reaction-chip">${e}${n > 1 ? `<span class="rc">${n}</span>` : ''}</span>`).join('');
}

// ===== Read Receipts =====
function markMessagesRead() {
  if (!_pendingReadMsgIds.size) return;
  const ids = [..._pendingReadMsgIds];
  _pendingReadMsgIds.clear();
  const targets = resolveTargets() || Array.from(peers.keys());
  targets.forEach(id => {
    if (dcReady(id)) peers.get(id).dc.send(JSON.stringify({ type: 'read-receipt', msgIds: ids }));
    else socket.emit('relay-read-receipt', { to: id, msgIds: ids });
  });
}

function handleReadReceipt(msgIds, fromPeerId) {
  (msgIds || []).forEach(id => {
    const entry = sentMsgs.get(id);
    if (entry?.el) {
      const tick = entry.el.querySelector('.msg-tick');
      if (tick) { tick.textContent = '✓✓'; tick.classList.add('read'); tick.title = '已讀'; }
    }
  });
}

// ===== Chat Search =====
let _searchResults = [], _searchIdx = 0;

document.getElementById('chat-search-btn')?.addEventListener('click', () => {
  const bar = document.getElementById('chat-search-bar');
  if (!bar) return;
  const open = bar.style.display !== 'none' && bar.style.display !== '';
  bar.style.display = open ? 'none' : 'flex';
  if (!open) { setTimeout(() => document.getElementById('chat-search-input')?.focus(), 50); }
  else clearSearch();
});

document.getElementById('chat-search-close')?.addEventListener('click', () => {
  document.getElementById('chat-search-bar').style.display = 'none';
  clearSearch();
});

document.getElementById('chat-search-input')?.addEventListener('input', e => doSearch(e.target.value.trim()));
document.getElementById('chat-search-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && _searchResults.length) {
    _searchIdx = (_searchIdx + 1) % _searchResults.length;
    highlightResult();
  }
});

function doSearch(q) {
  chatEl.querySelectorAll('.search-hl').forEach(el => {
    const txt = document.createTextNode(el.textContent);
    el.replaceWith(txt);
  });
  chatEl.querySelectorAll('.search-current').forEach(el => el.classList.remove('search-current'));
  _searchResults = []; _searchIdx = 0;
  if (!q) { updateSearchCount(); return; }
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  chatEl.querySelectorAll('.chat-text').forEach(el => {
    if (!el.textContent.toLowerCase().includes(q.toLowerCase())) return;
    el.innerHTML = el.innerHTML.replace(re, m => `<mark class="search-hl">${m}</mark>`);
    _searchResults.push(el.closest('.chat-msg'));
  });
  updateSearchCount();
  if (_searchResults.length) highlightResult();
}

function highlightResult() {
  chatEl.querySelectorAll('.search-current').forEach(e => e.classList.remove('search-current'));
  const el = _searchResults[_searchIdx];
  if (el) { el.classList.add('search-current'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  updateSearchCount();
}

function clearSearch() {
  chatEl.querySelectorAll('.search-hl').forEach(el => el.replaceWith(document.createTextNode(el.textContent)));
  chatEl.querySelectorAll('.search-current').forEach(el => el.classList.remove('search-current'));
  _searchResults = []; _searchIdx = 0;
  const inp = document.getElementById('chat-search-input');
  if (inp) inp.value = '';
  updateSearchCount();
}

function updateSearchCount() {
  const el = document.getElementById('chat-search-count');
  if (el) el.textContent = _searchResults.length ? `${_searchIdx + 1} / ${_searchResults.length}` : '';
}

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
socket.on('relay-msg', ({ from, text, msgId, replyTo }) => {
  const peer = peers.get(from);
  if (!peer) return;
  addChatMsg(peer.name, text, false, { msgId, replyTo, fromPeerId: from });
  notifyIfHidden(peer.name, text);
  playChatSound();
});
socket.on('relay-reaction', ({ from, msgId, emoji }) => handleReaction(msgId, emoji, from));
socket.on('relay-read-receipt', ({ from, msgIds }) => handleReadReceipt(msgIds, from));
socket.on('relay-error', ({ error }) => toast(error, 'error'));
// ===== Streaming Receive Helpers (OPFS) =====
// For files >= OPFS_THRESHOLD, stream chunks directly to the Origin Private
// File System instead of accumulating ArrayBuffers in memory.  After all
// chunks are written the OPFS File handle is used to trigger the download,
// which lets the browser serve the bytes from disk without a second in-memory
// copy.  Falls back silently to the legacy chunks-array path when the API is
// unavailable (Firefox, older Safari).
const OPFS_THRESHOLD = 50 * 1024 * 1024; // 50 MB

// Track OPFS entries created this session so they can be cleaned up on pagehide.
// We intentionally do NOT remove entries immediately after download so that
// image previews and the re-download button keep working during the session.
const _opfsRxEntries = new Set();

// Remove any wd-rx-* leftovers from a previous session (e.g. browser was
// force-killed before pagehide fired).
if (typeof navigator?.storage?.getDirectory === 'function') {
  navigator.storage.getDirectory().then(async root => {
    const stale = [];
    for await (const name of root.keys()) {
      if (name.startsWith('wd-rx-')) stale.push(name);
    }
    stale.forEach(n => root.removeEntry(n).catch(() => {}));
  }).catch(() => {});
}

// Best-effort cleanup when the tab is hidden / closed.
window.addEventListener('pagehide', () => {
  if (!_opfsRxEntries.size) return;
  navigator.storage?.getDirectory?.()?.then(root =>
    _opfsRxEntries.forEach(name => root.removeEntry(name).catch(() => {}))
  );
});

function _rxInitOpfs(r) {
  if (r.size < OPFS_THRESHOLD || typeof navigator?.storage?.getDirectory !== 'function') return;
  // _writeChain starts as the OPFS setup promise so that the first _rxChunk
  // call automatically waits for the writable to be ready.
  r._writeChain = navigator.storage.getDirectory().then(async root => {
    const h = await root.getFileHandle(`wd-rx-${r.fileId}`, { create: true });
    r._opfs = { handle: h, writable: await h.createWritable() };
  }).catch(() => {});
  // Note: setup errors are swallowed here; _rxChunk will fall back to
  // r.chunks.push() if r._opfs was never assigned.
}

function _rxChunk(r, data) {
  if (r._writeChain !== undefined) {
    // Chain writes sequentially; each write resolves before the next begins,
    // so the ArrayBuffer for chunk N can be GC'd once its write promise
    // resolves — keeping memory usage near zero regardless of file size.
    r._writeChain = r._writeChain.then(() =>
      r._opfs ? r._opfs.writable.write(data) : void r.chunks.push(data)
    );
  } else {
    r.chunks.push(data);
  }
}

const _pendingFolders = new Map();

async function _addToFolder(r, fileObj, peerName) {
  const { folderId, folderName, folderFileCount, relativePath, name, size } = r;
  if (!_pendingFolders.has(folderId)) {
    _pendingFolders.set(folderId, { name: folderName, fileCount: folderFileCount, receivedCount: 0, totalSize: 0, files: [], peerName });
  }
  const folder = _pendingFolders.get(folderId);
  folder.files.push({ file: fileObj, relativePath: relativePath || name });
  folder.receivedCount++;
  folder.totalSize += size;
  if (folder.receivedCount === folder.fileCount) {
    _pendingFolders.delete(folderId);
    await _downloadFolderAsZip(folder);
  }
}

async function _downloadFolderAsZip(folder) {
  if (typeof JSZip === 'undefined') {
    folder.files.forEach(({ file, relativePath }) => triggerDownload(file, relativePath.split('/').pop()));
    toast(`資料夾「${folder.name}」已接收（逐檔下載）`, 'success');
    return;
  }
  toast(`正在打包資料夾「${folder.name}」…`, 'info');
  const zip = new JSZip();
  for (const { file, relativePath } of folder.files) {
    zip.file(relativePath, file);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  triggerDownload(blob, `${folder.name}.zip`);
  addFileBubble(`${folder.name}.zip`, blob.size, false, folder.peerName, blob);
  notifyIfHidden(folder.peerName, `📁 ${folder.name}`);
  toast(`資料夾「${folder.name}」已接收完成（${folder.fileCount} 個檔案）`, 'success');
}

async function _rxFinish(peer, r) {
  peer.receiving = null;
  let fileObj = null;
  try {
    if (r._writeChain) {
      await r._writeChain;
      if (r._opfs) {
        await r._opfs.writable.close();
        fileObj = await r._opfs.handle.getFile();
        _opfsRxEntries.add(`wd-rx-${r.fileId}`);
      }
    }
    if (!fileObj) {
      fileObj = new Blob(r.chunks, { type: r.mime || 'application/octet-stream' });
    }
  } catch (e) {
    console.error('[webdrop] receive error:', e);
    setProgress(peer, null); txEnd();
    toast(`Failed to receive: ${r.name}`, 'error');
    return;
  }

  setProgress(peer, null); txEnd();

  if (r.folderId) {
    await _addToFolder(r, fileObj, peer.name);
    return;
  }

  triggerDownload(fileObj, r.name);
  addFileBubble(r.name, r.size, false, peer.name, fileObj);
  notifyIfHidden(peer.name, `📎 ${r.name}`);
  toast(`Received: ${r.name}`, 'success');
}

socket.on('relay-file-start', ({ from, meta }) => {
  const peer = peers.get(from);
  if (!peer) return;
  peer.receiving = { fileId: meta.fileId, name: meta.name, size: meta.size, mime: meta.mime, chunks: [], received: 0, relativePath: meta.relativePath || null, folderId: meta.folderId || null, folderName: meta.folderName || null, folderFileCount: meta.folderFileCount || null };
  setProgress(peer, 0);
  txStart(meta.name, meta.size);
  _rxInitOpfs(peer.receiving);
});
socket.on('relay-file-chunk', ({ from, chunk }) => {
  const peer = peers.get(from);
  if (!peer?.receiving) return;
  const buf = toArrayBuffer(chunk);
  peer.receiving.received += buf.byteLength;
  setProgress(peer, peer.receiving.received / peer.receiving.size);
  txUpdate(peer.receiving.received);
  _rxChunk(peer.receiving, buf);
});
socket.on('relay-file-end', ({ from, fileId }) => {
  const peer = peers.get(from);
  if (!peer?.receiving || peer.receiving.fileId !== fileId) return;
  _rxFinish(peer, peer.receiving);
});

// ===== Peer Lifecycle =====
const resumeBank = new Map(); // userId → { files: File[] }

function addPeer(peerId, name, isInitiator, role, avatar, userId) {
  if (peers.has(peerId)) return;
  let pc;
  try { pc = new RTCPeerConnection(ICE_SERVERS); }
  catch(e) { toast('無法建立 P2P 連線，請確認瀏覽器是否允許 WebRTC', 'error'); return; }
  pc.onicecandidate = ({ candidate }) => { if (candidate) socket.emit('ice-candidate', { to: peerId, candidate }); };
  pc.onconnectionstatechange = () => { const p = peers.get(peerId); if (p) updateStatusDot(p, pc.connectionState); };

  const peerObj = { pc, dc: null, name, role: role || null, avatar: avatar || null, userId: userId || null, element: null, sendQueue: [], isSending: false, receiving: null, activeSend: null };
  peers.set(peerId, peerObj);

  // Restore pending transfers from before disconnect
  if (userId && resumeBank.has(userId)) {
    const { files } = resumeBank.get(userId);
    resumeBank.delete(userId);
    setTimeout(() => {
      files.forEach(f => queueFile(peerId, f));
      if (files.length) toast(`${name} 重新連線 — 繼續傳送 ${files.length} 個檔案`, 'info');
    }, 1200);
  }
  peerObj.element = createPeerEl(peerId, name, role, avatar);
  radarEl.appendChild(peerObj.element);
  updatePositions();
  noDevicesEl.style.display = 'none';
  setNoDevicesHint('normal');

  if (peers.size === 1 && qrModal.classList.contains('active') && !qrModal.dataset.userInteracted) {
    setTimeout(() => { if (!qrModal.dataset.userInteracted) qrModal.classList.remove('active'); }, 600);
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
  // Save pending transfers for resume when peer reconnects
  if (peer.userId) {
    const pendingFiles = [];
    if (peer.isSending && peer.activeSend?.file) pendingFiles.push(peer.activeSend.file);
    peer.sendQueue.forEach(item => { if (item?.file) pendingFiles.push(item.file); else if (item instanceof File || item instanceof Blob) pendingFiles.push(item); });
    if (pendingFiles.length > 0) {
      resumeBank.set(peer.userId, { files: pendingFiles });
      toast(`${peer.name} 斷線，${pendingFiles.length} 個檔案待續傳`, 'info');
    }
  }
  if (peer.receiving) { peer.receiving = null; setProgress(peer, null); if (currentTransfer.active) txEnd(); }
  peer.pc.close();
  if (peer.element) peer.element.remove();
  peers.delete(peerId);
  _peerConnTypes.delete(peerId);
  refreshConnTypePill();
  // Clear any lingering typing indicator for this peer
  if (_typingPeers.has(peerId)) {
    clearTimeout(_typingPeers.get(peerId).timer);
    _typingPeers.delete(peerId);
    renderTyping();
  }
  fqUpdate();
  addChatEvent(`${peer.name} left`);
  if (selectedPeerId === peerId) {
    selectedPeerId = null;
    const next = peers.keys().next().value;
    if (next) autoSelect(next); else updateDropHint();
  }
  updatePositions();
  if (peers.size === 0) { noDevicesEl.style.display = 'flex'; setNoDevicesHint('normal'); }
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
  if (pendingSharedFiles.length) {
    const files = pendingSharedFiles.splice(0);
    setTimeout(() => handleFiles(files), 150);
  }
}

function setupDC(dc, peerId) {
  dc.binaryType = 'arraybuffer';
  dc.onopen  = () => { const p = peers.get(peerId); if (p) { updateStatusDot(p, 'connected'); toast(`Connected to ${p.name}`, 'success'); detectConnType(peerId, p.pc); } };
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
    peer.receiving = { fileId: msg.fileId, name: msg.name, size: msg.size, mime: msg.mime, chunks: [], received: 0, relativePath: msg.relativePath || null, folderId: msg.folderId || null, folderName: msg.folderName || null, folderFileCount: msg.folderFileCount || null };
    setProgress(peer, 0);
    txStart(msg.name, msg.size);
    _rxInitOpfs(peer.receiving);
  } else if (msg.type === 'file-end') {
    if (peer.receiving?.fileId === msg.fileId) {
      _rxFinish(peer, peer.receiving);
    }
  } else if (msg.type === 'message') {
    addChatMsg(peer.name, msg.text, false, { msgId: msg.msgId, replyTo: msg.replyTo, fromPeerId: peerId });
    notifyIfHidden(peer.name, msg.text);
    playChatSound();
  } else if (msg.type === 'typing') {
    handlePeerTyping(peerId, peer.name);
  } else if (msg.type === 'reaction') {
    handleReaction(msg.msgId, msg.emoji, peerId);
  } else if (msg.type === 'read-receipt') {
    handleReadReceipt(msg.msgIds, peerId);
  }
}
function handleDCChunk(data, peerId) {
  const peer = peers.get(peerId);
  if (!peer?.receiving) return;
  const r = peer.receiving;
  r.received += data.byteLength;
  setProgress(peer, r.received / r.size);
  txUpdate(r.received);
  _rxChunk(r, data);
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
  const msgId = randMsgId();
  const replyTo = _replyingTo ? { ..._replyingTo } : null;
  targets.forEach(id => {
    const peer = peers.get(id);
    if (!peer) return;
    if (dcReady(id)) peer.dc.send(JSON.stringify({ type: 'message', text, msgId, replyTo }));
    else socket.emit('relay-msg', { to: id, text, msgId, replyTo });
  });
  addChatMsg('You', text, true, { msgId, replyTo });
  clearReply();
  messageInputEl.value = '';
  if (window.innerWidth <= 768) switchTab('chat');
}

sendBtn.addEventListener('click', doSendMessage);
messageInputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSendMessage(); } });

// Typing indicator — emit to room (throttled)
let _typingThrottle = 0;
messageInputEl.addEventListener('input', () => {
  const now = Date.now();
  if (now - _typingThrottle < 1400) return;
  _typingThrottle = now;
  socket.emit('typing');
  // Also broadcast via DC for P2P peers
  peers.forEach((peer, id) => {
    if (dcReady(id)) peer.dc.send(JSON.stringify({ type: 'typing' }));
  });
});

// Paste image from clipboard
document.addEventListener('paste', e => {
  const active = document.activeElement;
  if (active && active !== messageInputEl && active.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
  const items = Array.from(e.clipboardData?.items || []);
  const imageItem = items.find(i => i.kind === 'file' && i.type.startsWith('image/'));
  if (!imageItem) return;
  const file = imageItem.getAsFile();
  if (!file) return;
  e.preventDefault();
  handleFiles([file]);
  toast('📋 圖片已貼上，準備傳送', 'info');
});

// ===== Typing Indicator =====
const typingIndicatorEl = document.getElementById('typing-indicator');
const _typingPeers = new Map(); // id → { name, timer }

function handlePeerTyping(peerId, name) {
  if (_typingPeers.has(peerId)) clearTimeout(_typingPeers.get(peerId).timer);
  const timer = setTimeout(() => { _typingPeers.delete(peerId); renderTyping(); }, 2500);
  _typingPeers.set(peerId, { name: name || '有人', timer });
  renderTyping();
}

function renderTyping() {
  if (!typingIndicatorEl) return;
  if (_typingPeers.size === 0) { typingIndicatorEl.innerHTML = ''; return; }
  const names = [..._typingPeers.values()].map(v => v.name);
  const label = names.length === 1 ? `${names[0]} 正在輸入` : `${names.slice(0, 2).join('、')} 正在輸入`;
  typingIndicatorEl.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label">${escHtml(label)}…</span>`;
}

socket.on('peer-typing', ({ id, name }) => handlePeerTyping(id, name));

// ===== Browser Notifications =====
function notifyIfHidden(title, body) {
  if (!document.hidden) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: '/icon-192.svg', silent: false }); } catch {}
}
// Request notification permission when joining a room (non-intrusively)
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

async function sendFileToPeer(peerId, file, meta = {}) {
  if (dcReady(peerId)) await sendFileViaDC(peerId, file, meta);
  else await sendFileViaRelay(peerId, file, meta);
}

async function sendFileViaDC(peerId, file, meta = {}) {
  const peer = peers.get(peerId);
  const dc = peer.dc;
  const fileId = randId();
  peer.activeSend = { fileId, file, offset: 0 };

  // Event-based backpressure: fire when buffer drains below threshold
  dc.bufferedAmountLowThreshold = MAX_BUFFER / 2;
  let _drainResolve = null;
  let _aborted = false;
  const _savedLow   = dc.onbufferedamountlow;
  const _savedClose = dc.onclose;
  const _abort = () => { _aborted = true; if (_drainResolve) { _drainResolve(); _drainResolve = null; } };
  dc.onbufferedamountlow = () => { if (_drainResolve) { _drainResolve(); _drainResolve = null; } };
  dc.onclose = (...a) => { _abort(); if (_savedClose) _savedClose(...a); };
  const waitDrain = () => (dc.bufferedAmount <= MAX_BUFFER || _aborted)
    ? Promise.resolve()
    : new Promise(r => { _drainResolve = r; });

  const restoreHandlers = () => { dc.onbufferedamountlow = _savedLow; dc.onclose = _savedClose; };

  dc.send(JSON.stringify({ type: 'file-start', fileId, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', relativePath: meta.relativePath || null, folderId: meta.folderId || null, folderName: meta.folderName || null, folderFileCount: meta.folderFileCount || null }));
  txStart(file.name, file.size);
  let offset = 0;
  while (offset < file.size && !_aborted) {
    await waitDrain();
    if (_aborted || !peers.has(peerId)) { peer.activeSend = null; restoreHandlers(); txEnd(); return; }
    const buf = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    dc.send(buf);
    offset += buf.byteLength;
    peer.activeSend.offset = offset;
    setProgress(peer, offset / file.size);
    txUpdate(offset);
  }
  restoreHandlers();
  dc.send(JSON.stringify({ type: 'file-end', fileId }));
  peer.activeSend = null;
  setProgress(peer, null);
  txEnd();
  addFileBubble(file.name, file.size, true, peer.name, file);
  toast(`Sent: ${file.name}`, 'success');
}

async function sendFileViaRelay(peerId, file, meta = {}) {
  const peer = peers.get(peerId);
  const fileId = randId();
  peer.activeSend = { fileId, file, offset: 0 };
  setServerRelayType(peerId);
  socket.emit('relay-file-start', { to: peerId, meta: { fileId, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', relativePath: meta.relativePath || null, folderId: meta.folderId || null, folderName: meta.folderName || null, folderFileCount: meta.folderFileCount || null } });
  txStart(file.name, file.size);
  let offset = 0;
  while (offset < file.size) {
    if (!peers.has(peerId)) { peer.activeSend = null; txEnd(); return; }
    const buf = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    socket.emit('relay-file-chunk', { to: peerId, chunk: buf });
    offset += buf.byteLength;
    setProgress(peer, offset / file.size);
    txUpdate(offset);
    if (offset % (CHUNK_SIZE * 4) === 0) await sleep(10);
  }
  socket.emit('relay-file-end', { to: peerId, fileId, name: file.name });
  peer.activeSend = null;
  setProgress(peer, null);
  txEnd();
  addFileBubble(file.name, file.size, true, peer.name, file);
  toast(`Sent: ${file.name}`, 'success');
}

// ===== File Queue Display =====
const _globalQueue = []; // { id, peerId, file, status:'queued'|'sending'|'done'|'error' }
let _fqNextId = 0;
const fileQueuePanel = document.getElementById('file-queue-panel');
const fqListEl = document.getElementById('fq-list');

function fqUpdate() {
  const active = _globalQueue.filter(i => i.status === 'queued' || i.status === 'sending');
  if (!fileQueuePanel) return;
  if (active.length === 0) { fileQueuePanel.style.display = 'none'; return; }
  fileQueuePanel.style.display = '';
  if (!fqListEl) return;
  fqListEl.innerHTML = '';
  _globalQueue.forEach(item => {
    const el = document.createElement('div');
    el.className = `fq-item fq-${item.status}`;
    const peerName = peers.get(item.peerId)?.name || '';
    const statusText = { queued: '等待中', sending: '傳送中', done: '完成', error: '失敗' }[item.status] || '';
    el.innerHTML = `<div class="fq-icon">${item.status === 'sending' ? '<div class="fq-spin"></div>' : item.status === 'done' ? '✓' : item.status === 'error' ? '✗' : '…'}</div><div class="fq-info"><div class="fq-name">${esc(item.file.name)}</div><div class="fq-meta">${formatBytes(item.file.size)}${peerName ? ' → ' + esc(peerName) : ''} · ${statusText}</div></div>`;
    fqListEl.appendChild(el);
  });
}

document.getElementById('fq-close')?.addEventListener('click', () => { if (fileQueuePanel) fileQueuePanel.style.display = 'none'; });

function queueFile(peerId, fileItem) {
  const peer = peers.get(peerId);
  if (!peer) return;
  const meta = fileItem instanceof File
    ? { file: fileItem, relativePath: null, folderId: null, folderName: null, folderFileCount: null }
    : fileItem;
  const qItem = { id: _fqNextId++, peerId, file: meta.file, status: 'queued' };
  _globalQueue.push(qItem);
  if (_globalQueue.length > 50) _globalQueue.splice(0, _globalQueue.length - 50);
  fqUpdate();
  peer.sendQueue.push({ ...meta, qItem });
  processSendQueue(peerId);
}

async function processSendQueue(peerId) {
  const peer = peers.get(peerId);
  if (!peer || peer.isSending || !peer.sendQueue.length) return;
  peer.isSending = true;
  const { file, relativePath, folderId, folderName, folderFileCount, qItem } = peer.sendQueue.shift();
  if (qItem) { qItem.status = 'sending'; fqUpdate(); }
  try {
    await sendFileToPeer(peerId, file, { relativePath, folderId, folderName, folderFileCount });
    if (qItem) { qItem.status = 'done'; fqUpdate(); }
  } catch (e) {
    if (qItem) { qItem.status = 'error'; fqUpdate(); }
  }
  peer.isSending = false;
  processSendQueue(peerId);
}

// ===== Image Compression =====
async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  if (file.size < 500 * 1024) return file;
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1920;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (!blob || blob.size >= file.size) resolve(file);
        else resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ===== ZIP Packaging =====
let zipMode = false;
const zipToggleBtn = document.getElementById('zip-toggle-btn');
zipToggleBtn?.addEventListener('click', () => {
  zipMode = !zipMode;
  zipToggleBtn.classList.toggle('zip-active', zipMode);
  zipToggleBtn.title = zipMode ? 'ZIP 模式已啟用（點擊取消）' : '打包成 ZIP 傳送';
  toast(zipMode ? '✔ ZIP 打包模式已啟用' : 'ZIP 打包模式已停用', 'info');
});

async function maybeZip(files) {
  if (!zipMode || files.length <= 1 || typeof JSZip === 'undefined') return files;
  toast('正在打包 ZIP…', 'info');
  const zip = new JSZip();
  files.forEach(f => zip.file(f.name, f));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return [new File([blob], `webdrop-${Date.now()}.zip`, { type: 'application/zip' })];
}

async function handleFiles(rawItems) {
  if (!rawItems.length) return;
  const targets = resolveTargets();
  if (!targets?.length) { toast(peers.size === 0 ? 'No devices connected' : 'Select a device first', 'error'); return; }

  const items = [...rawItems].map(x => x instanceof File
    ? { file: x, relativePath: x.webkitRelativePath || null }
    : x);

  const folderGroups = new Map();
  const looseFiles = [];
  for (const item of items) {
    if (item.relativePath) {
      const top = item.relativePath.split('/')[0];
      if (!folderGroups.has(top)) folderGroups.set(top, []);
      folderGroups.get(top).push(item);
    } else {
      looseFiles.push(item.file);
    }
  }

  if (looseFiles.length) {
    let processed = await Promise.all(looseFiles.map(compressImage));
    processed = await maybeZip(processed);
    targets.forEach(id => processed.forEach(f => queueFile(id, f)));
  }

  for (const [folderName, folderItems] of folderGroups) {
    const folderId = randId();
    const folderFileCount = folderItems.length;
    targets.forEach(id => folderItems.forEach(item =>
      queueFile(id, { file: item.file, relativePath: item.relativePath, folderId, folderName, folderFileCount })
    ));
  }
}

async function collectEntry(entry, out, parentPath = '') {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    const relativePath = parentPath ? `${parentPath}/${entry.name}` : null;
    out.push({ file, relativePath });
  } else if (entry.isDirectory) {
    const dirPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      for (const child of batch) await collectEntry(child, out, dirPath);
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
      if (entry) await collectEntry(entry, out, '');
    }
    return out;
  }
  return [...dataTransfer.files].map(f => ({ file: f, relativePath: f.webkitRelativePath || null }));
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
  'super-admin': `<span class="peer-role-badge peer-role-super-admin">⚡ Super Admin</span>`,
  admin:         `<span class="peer-role-badge peer-role-admin">👑 Admin</span>`,
  vip:           `<span class="peer-role-badge peer-role-vip">💎 VIP</span>`,
  business:      `<span class="peer-role-badge peer-role-business">💼 Business</span>`,
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
  if (!['super-admin', 'admin', 'business'].includes(myR)) return false;
  if (targetRole === 'super-admin') return false; // nobody can moderate super-admin
  if (myR === 'admin' && targetRole === 'admin') return false; // admin cannot moderate another admin (unless host — handled server-side)
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

// ===== Connection Type Indicator =====
const _peerConnTypes = new Map(); // peerId → 'local'|'p2p'|'relay'|'server'

async function detectConnType(peerId, pc) {
  try {
    const stats = await pc.getStats();
    const candidates = {};
    let selectedPair = null;
    stats.forEach(r => {
      if (r.type === 'local-candidate' || r.type === 'remote-candidate') candidates[r.id] = r;
      if (r.type === 'candidate-pair' && r.nominated) selectedPair = r;
    });
    if (!selectedPair) return;
    const loc = candidates[selectedPair.localCandidateId];
    const rem = candidates[selectedPair.remoteCandidateId];
    if (!loc || !rem) return;
    let type;
    if (loc.candidateType === 'relay' || rem.candidateType === 'relay') type = 'relay';
    else if (loc.candidateType === 'host' && rem.candidateType === 'host') type = 'local';
    else type = 'p2p';
    _peerConnTypes.set(peerId, type);
    refreshConnTypePill();
  } catch {}
}

function refreshConnTypePill() {
  const el = document.getElementById('conn-type-pill');
  if (!el) return;
  if (!peers.size) { el.style.display = 'none'; return; }
  const types = [..._peerConnTypes.values()];
  const useServerRelay = [...peers.values()].some(p => p.dc?.readyState !== 'open' && p.dc !== null && !p.pc);
  let dominant = types.includes('relay') ? 'relay'
    : types.includes('p2p') ? 'p2p'
    : types.includes('local') ? 'local'
    : types.includes('server') ? 'server'
    : null;
  if (!dominant) { el.style.display = 'none'; return; }
  const MAP = {
    local:  { cls: 'ct-local',  label: '區域網路' },
    p2p:    { cls: 'ct-p2p',    label: 'P2P 直連' },
    relay:  { cls: 'ct-relay',  label: 'TURN 中轉' },
    server: { cls: 'ct-server', label: '伺服器中轉' },
  };
  const { cls, label } = MAP[dominant];
  el.className = `conn-type-pill ${cls}`;
  el.querySelector('.ct-label').textContent = label;
  el.style.display = 'flex';
}

function setServerRelayType(peerId) {
  _peerConnTypes.set(peerId, 'server');
  refreshConnTypePill();
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
function toast(msg, type = 'info', duration = 3000) {
  const existing = notificationsEl.querySelectorAll('.toast');
  if (existing.length >= 5) existing[0].remove();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  notificationsEl.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, duration);
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

  // Load config (social auth availability)
  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    let hasSocial = false;
    if (cfg.googleAuth && cfg.googleClientId) {
      hasSocial = true;
      googleConfig = cfg.googleClientId;
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true; script.defer = true;
      script.onload = initGoogleAuth;
      document.head.appendChild(script);
    } else {
      document.getElementById('google-btn-wrap').style.display = 'none';
    }
    if (cfg.phoneAuth) {
      hasSocial = true;
      if (cfg.phoneAuthMode === 'firebase' && cfg.firebaseConfig) {
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js').then(({ initializeApp }) => {
          import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js').then(({ getAuth }) => {
            window._fbAuth = getAuth(initializeApp(cfg.firebaseConfig, 'webdrop-phone'));
          });
        });
      }
    } else {
      document.getElementById('phone-btn-wrap').style.display = 'none';
    }
    if (!hasSocial) document.getElementById('auth-divider').style.display = 'none';
  } catch {}

  // Restore session via HttpOnly cookie
  try {
    const data = await authApi('GET', '/api/auth/me');
    userToken = data.token;
    currentUser = data;
    socket.auth.userToken = userToken;
    socket.disconnect();
    socket.connect();
    applyCustomRoom(data.customRoomId);
    setEditRoomBtnVisible(!!data.canCustomRoom);
    showUserBadge(currentUser);
    if (data.language) i18n.set(data.language);
    const langSel = document.getElementById('user-lang-select');
    if (langSel) langSel.value = data.language || '';
  } catch {
    setTimeout(() => authModal.classList.add('active'), 600);
  }

  // Auto-open QR
  setTimeout(() => {
    if (!authModal.classList.contains('active')) {
      qrModal.classList.add('active');
    }
  }, 800);
});

// ===== Members Slide Panel =====
const membersPanel    = document.getElementById('members-panel');
const membersPanelOv  = document.getElementById('members-panel-overlay');
const membersPanelClose = document.getElementById('members-panel-close');

function openMembersPanel() {
  membersPanel.classList.add('open');
  membersPanelOv.classList.add('open');
  document.getElementById('admin-panel-modal')?.classList.remove('active');
  refreshMembersPanel();
}
function closeMembersPanel() {
  membersPanel.classList.remove('open');
  membersPanelOv.classList.remove('open');
}

membersPanelClose?.addEventListener('click', closeMembersPanel);
membersPanelOv?.addEventListener('click', closeMembersPanel);

function refreshMembersPanel() {
  const list = document.getElementById('members-list');
  const badge = document.getElementById('members-count-badge');
  const apBadge = document.getElementById('ap-members-badge');
  const fabBadge = document.getElementById('admin-panel-badge');
  if (!list) return;
  const myRole = currentUser?.role;
  const isMod = ['super-admin', 'admin', 'business', 'vip'].includes(myRole);
  const count = peers.size;
  if (badge) badge.textContent = count;
  if (apBadge) { apBadge.textContent = count; apBadge.style.display = count > 0 ? '' : 'none'; }
  if (fabBadge) { fabBadge.textContent = count; fabBadge.style.display = count > 0 ? '' : 'none'; }
  if (!count) {
    list.innerHTML = `<div class="members-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      <p>目前沒有其他成員</p></div>`;
    return;
  }
  list.innerHTML = '';
  peers.forEach((peer, peerId) => {
    const row = document.createElement('div');
    row.className = 'member-row';
    const avatarHtml = peer.avatar ? `<img src="${esc(peer.avatar)}" alt="">` : (peer.name || '?')[0].toUpperCase();
    const ROLE_BADGE_MAP = { 'super-admin': '⚡ Super Admin', admin: '👑 Admin', business: '💼 Business', vip: '💎 VIP' };
    const roleBadge = peer.role
      ? `<span class="member-role-badge member-role-${peer.role}">${ROLE_BADGE_MAP[peer.role] || peer.role}</span>` : '';
    const canMod = canModeratePeer(peer.role);
    const canGrant = (myRole === 'admin' || myRole === 'super-admin') && peer.role !== 'super-admin' && peer.role !== 'admin';
    const canPermGrant = myRole === 'super-admin' && peer.role !== 'super-admin';
    row.innerHTML = `
      <div class="member-avatar">${avatarHtml}</div>
      <div class="member-info">
        <div class="member-name">${escHtml(peer.name)}</div>${roleBadge}
      </div>
      ${canMod ? `<div class="member-actions">
        <button class="member-kick-btn" title="踢出房間">踢出</button>
        <button class="member-ban-btn"  title="封鎖並踢出">封鎖</button>
        ${canGrant ? `<button class="member-grant-btn" title="設定臨時角色">升級</button>` : ''}
        ${canPermGrant ? `<button class="member-perm-grant-btn" title="永久設定角色">永久</button>` : ''}
      </div>` : ''}`;
    if (canMod) {
      row.querySelector('.member-kick-btn').addEventListener('click', () => {
        if (confirm(`踢出 ${peer.name}？對方可重新加入。`)) socket.emit('room-kick', { peerId });
      });
      row.querySelector('.member-ban-btn').addEventListener('click', () => {
        if (confirm(`封鎖並踢出 ${peer.name}？對方將無法重新加入本房間。`)) socket.emit('room-ban', { peerId });
      });
      if (canGrant) {
        row.querySelector('.member-grant-btn').addEventListener('click', () => {
          const current = peer.role || '';
          const choice = prompt(`${peer.name} 的臨時角色（此次連線有效）\n輸入 vip / business / 留空移除：`, current);
          if (choice === null) return;
          const grantRole = choice.trim().toLowerCase() || null;
          if (grantRole && !['vip', 'business'].includes(grantRole)) { alert('角色只能是 vip 或 business'); return; }
          socket.emit('room-grant-role', { peerId, grantRole });
        });
      }
      if (canPermGrant) {
        row.querySelector('.member-perm-grant-btn').addEventListener('click', () => {
          const current = peer.role || '';
          const choice = prompt(`永久設定 ${peer.name} 的角色\n輸入 vip / business / admin / 留空移除：`, current);
          if (choice === null) return;
          const role = choice.trim().toLowerCase() || null;
          if (role && !['vip', 'business', 'admin'].includes(role)) { alert('角色只能是 vip、business 或 admin'); return; }
          if (confirm(`確定要永久將 ${peer.name} 的角色設為「${role || '無'}」？`)) socket.emit('room-grant-perm-role', { peerId, role });
        });
      }
    }
    list.appendChild(row);
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== Room Settings =====
let currentRoomSettings = null;

function applyRoomSettings(rs) {
  currentRoomSettings = rs;
  const lockDot = document.getElementById('room-lock-indicator');
  if (lockDot) lockDot.style.display = rs?.locked ? '' : 'none';
  const sendBtn = document.getElementById('send-btn');
  const msgInput = document.getElementById('message-input');
  if (sendBtn && msgInput) {
    const chatOk = !rs || rs.allowChat !== false;
    sendBtn.disabled = !chatOk;
    msgInput.disabled = !chatOk;
    msgInput.placeholder = chatOk ? (msgInput.dataset.placeholder || 'Type a message…') : '聊天功能已停用';
  }
}

const roomSettingsModal = document.getElementById('room-settings-modal');

function openRoomSettings() {
  const rs = currentRoomSettings || {};
  document.getElementById('rs-locked').checked       = !!rs.locked;
  document.getElementById('rs-knock').checked        = rs.knockRequired !== false;
  document.getElementById('rs-files').checked        = rs.allowFiles !== false;
  document.getElementById('rs-chat').checked         = rs.allowChat !== false;
  document.getElementById('rs-min-role').value       = rs.minFileRole || '';
  document.getElementById('rs-max-members').value    = rs.maxMembers || '';
  const pwEl = document.getElementById('rs-password');
  if (pwEl) pwEl.value = '';
  const cdEl = document.getElementById('rs-countdown');
  if (cdEl) cdEl.value = _roomCloseAt ? Math.round((_roomCloseAt - Date.now()) / 60000) : '';
  roomSettingsModal.classList.add('active');
}

document.getElementById('rs-cancel')?.addEventListener('click', () => roomSettingsModal.classList.remove('active'));
document.getElementById('rs-save')?.addEventListener('click', () => {
  const countdown = parseInt(document.getElementById('rs-countdown')?.value) || null;
  socket.emit('room-update-settings', {
    locked:           document.getElementById('rs-locked').checked,
    knockRequired:    document.getElementById('rs-knock').checked,
    allowFiles:       document.getElementById('rs-files').checked,
    allowChat:        document.getElementById('rs-chat').checked,
    minFileRole:      document.getElementById('rs-min-role').value || null,
    maxMembers:       parseInt(document.getElementById('rs-max-members').value) || null,
    password:         document.getElementById('rs-password')?.value?.trim() || null,
    countdownMinutes: countdown,
  });
  roomSettingsModal.classList.remove('active');
});

// ===== Admin Panel Hub =====
const adminPanelModal = document.getElementById('admin-panel-modal');

document.getElementById('admin-panel-btn')?.addEventListener('click', () => {
  adminPanelModal?.classList.add('active');
});
adminPanelModal?.addEventListener('click', e => { if (e.target === adminPanelModal) adminPanelModal.classList.remove('active'); });

document.getElementById('ap-members-btn')?.addEventListener('click', () => {
  adminPanelModal?.classList.remove('active');
  openMembersPanel();
});
document.getElementById('ap-settings-btn')?.addEventListener('click', () => {
  adminPanelModal?.classList.remove('active');
  openRoomSettings();
});
document.getElementById('ap-clear-btn')?.addEventListener('click', () => {
  adminPanelModal?.classList.remove('active');
  if (!confirm('確定要清場嗎？所有成員（Super Admin 除外）都會被踢出。')) return;
  socket.emit('room-clear-all');
});

// ===== Admin: Broadcast =====
const broadcastModal  = document.getElementById('broadcast-modal');
const broadcastInput  = document.getElementById('broadcast-input');
const broadcastSendBtn = document.getElementById('broadcast-send-btn');
const broadcastCancelBtn = document.getElementById('broadcast-cancel-btn');

document.getElementById('ap-broadcast-btn')?.addEventListener('click', () => {
  adminPanelModal?.classList.remove('active');
  if (broadcastInput) broadcastInput.value = '';
  broadcastModal?.classList.add('active');
  broadcastInput?.focus();
});
broadcastCancelBtn?.addEventListener('click', () => broadcastModal?.classList.remove('active'));
broadcastModal?.addEventListener('click', e => { if (e.target === broadcastModal) broadcastModal.classList.remove('active'); });
broadcastSendBtn?.addEventListener('click', () => {
  const msg = broadcastInput?.value.trim();
  if (!msg) return;
  socket.emit('server-broadcast', { message: msg });
  broadcastModal?.classList.remove('active');
});
broadcastInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); broadcastSendBtn?.click(); }
});

// ===== Feedback =====
let selectedFbType = 'feature';
let selectedFbRating = 0;

const feedbackModal = document.getElementById('feedback-modal');

function openFeedbackModal() {
  selectedFbType = 'feature';
  selectedFbRating = 0;
  document.querySelectorAll('.fb-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'feature'));
  document.querySelectorAll('.fb-star').forEach(s => s.classList.remove('active'));
  const msg = document.getElementById('fb-message');
  if (msg) msg.value = '';
  document.getElementById('fb-error').textContent = '';
  feedbackModal?.classList.add('active');
}

document.getElementById('feedback-fab')?.addEventListener('click', openFeedbackModal);
document.getElementById('feedback-dropdown-btn')?.addEventListener('click', () => {
  const dd = document.getElementById('user-dropdown');
  if (dd) dd.classList.remove('open');
  openFeedbackModal();
});
document.getElementById('fb-cancel-btn')?.addEventListener('click', () => feedbackModal?.classList.remove('active'));
feedbackModal?.addEventListener('click', e => { if (e.target === feedbackModal) feedbackModal.classList.remove('active'); });

document.querySelectorAll('.fb-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedFbType = btn.dataset.type;
    document.querySelectorAll('.fb-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.querySelectorAll('.fb-star').forEach(star => {
  star.addEventListener('click', () => {
    selectedFbRating = parseInt(star.dataset.v);
    document.querySelectorAll('.fb-star').forEach(s => {
      s.classList.toggle('active', parseInt(s.dataset.v) <= selectedFbRating);
    });
  });
  star.addEventListener('mouseenter', () => {
    document.querySelectorAll('.fb-star').forEach(s => {
      s.classList.toggle('hover', parseInt(s.dataset.v) <= parseInt(star.dataset.v));
    });
  });
});
document.getElementById('fb-stars')?.addEventListener('mouseleave', () => {
  document.querySelectorAll('.fb-star').forEach(s => s.classList.remove('hover'));
});

document.getElementById('fb-submit-btn')?.addEventListener('click', async () => {
  const message = document.getElementById('fb-message')?.value.trim();
  const errEl = document.getElementById('fb-error');
  if (!message) { errEl.textContent = '請輸入意見內容'; return; }
  const btn = document.getElementById('fb-submit-btn');
  btn.disabled = true;
  btn.textContent = '送出中…';
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (userToken) headers['Authorization'] = `Bearer ${userToken}`;
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: selectedFbType, message, rating: selectedFbRating || null })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    feedbackModal?.classList.remove('active');
    toast('感謝你的意見！', 'success');
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '送出';
  }
});

// ===== WebRTC check =====
if (!window.RTCPeerConnection) {
  document.getElementById('app').innerHTML =
    '<div style="text-align:center;padding:80px 20px;color:#888"><h2>Browser not supported</h2><p>Please use a modern browser.</p></div>';
}

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ===== Web Share Target =====
let pendingSharedFiles = [];

async function loadShareTargetFiles() {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('webdrop-share-v1', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('files', { autoIncrement: true });
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = reject;
    });
    const files = await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      const all = store.getAll();
      all.onsuccess = () => { store.clear(); resolve(all.result); };
      all.onerror = reject;
    });
    db.close();
    if (!files.length) return;
    pendingSharedFiles = files;
    toast(`${files.length} 個檔案已準備好 — 點選裝置即可傳送`, 'info', 7000);
    // If a peer is already selected, send immediately
    if (resolveTargets()?.length) {
      const toSend = pendingSharedFiles.splice(0);
      handleFiles(toSend);
    }
  } catch (e) {}
}

if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'share-files-ready') loadShareTargetFiles();
  });
}

if (location.search.includes('share=1')) {
  history.replaceState(null, '', location.pathname + location.hash);
  loadShareTargetFiles();
}

// ===== PWA Install Banner + Modal =====
(function () {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isStandalone) return;

  // Always show the install hint button in header
  const hintBtn = document.getElementById('install-hint-btn');
  if (hintBtn) hintBtn.style.display = '';

  // Install modal logic
  const modal              = document.getElementById('install-modal');
  const modalClose         = document.getElementById('install-modal-close');
  const modalAndroid       = document.getElementById('install-modal-android');
  const modalIos           = document.getElementById('install-modal-ios');
  const modalIosOther      = document.getElementById('install-modal-ios-other');
  const modalMacSafari     = document.getElementById('install-modal-mac-safari');
  const modalFirefox       = document.getElementById('install-modal-firefox');
  const modalSamsung       = document.getElementById('install-modal-samsung');
  const modalOpera         = document.getElementById('install-modal-opera');
  const modalBrave         = document.getElementById('install-modal-brave');
  const modalOther         = document.getElementById('install-modal-other');
  const modalInstBtn       = document.getElementById('install-modal-btn');
  const allModalPanels     = [modalAndroid, modalIos, modalIosOther, modalMacSafari,
                               modalFirefox, modalSamsung, modalOpera, modalBrave, modalOther];

  const ua = navigator.userAgent;
  const isIos        = /iphone|ipad|ipod/i.test(ua);
  const isMac        = /macintosh/i.test(ua);
  const isSafari     = /^((?!chrome|android).)*safari/i.test(ua);
  const isChromeIos  = /CriOS\//i.test(ua);
  const isFirefox    = /Firefox\//i.test(ua);
  const isSamsung    = /SamsungBrowser\//i.test(ua);
  const isOpera      = /OPR\/|Opera\//i.test(ua);
  const isIosSafari  = isIos && isSafari && !isChromeIos;
  const isMacSafari  = isMac && isSafari && !isIos;
  const isBrave      = !!navigator.brave;
  let deferredPrompt = null;

  function openModal() {
    allModalPanels.forEach(el => { if (el) el.style.display = 'none'; });
    let panel;
    if (isIosSafari)                       panel = modalIos;
    else if (isIos)                        panel = modalIosOther;
    else if (isMacSafari)                  panel = modalMacSafari;
    else if (isFirefox)                    panel = modalFirefox;
    else if (isSamsung && !deferredPrompt) panel = modalSamsung;
    else if (isOpera   && !deferredPrompt) panel = modalOpera;
    else if (isBrave   && !deferredPrompt) panel = modalBrave;
    else if (deferredPrompt)               panel = modalAndroid;
    else                                   panel = modalOther;
    if (panel) panel.style.display = 'block';
    modal.style.display = 'flex';
  }
  function closeModal() {
    modal.style.display = 'none';
    allModalPanels.forEach(el => { if (el) el.style.display = 'none'; });
  }

  hintBtn?.addEventListener('click', openModal);
  modalClose?.addEventListener('click', closeModal);
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  modalInstBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') closeModal();
  });

  if (_ls.get('wd-install-dismissed')) return;

  const banner     = document.getElementById('install-banner');
  const subEl      = document.getElementById('install-banner-sub');
  const installBtn = document.getElementById('install-btn');
  const iosSteps   = document.getElementById('install-ios-steps');
  const dismissBtn = document.getElementById('install-dismiss');
  const neverBtn   = document.getElementById('install-never');

  function showBanner() { banner.style.display = 'block'; }
  function dismiss()    { banner.style.display = 'none'; }

  dismissBtn.addEventListener('click', dismiss);
  neverBtn.addEventListener('click', () => { dismiss(); _ls.set('wd-install-dismissed', '1'); });

  if (isIosSafari) {
    subEl.textContent = '加入主畫面以使用系統分享功能';
    iosSteps.style.display = 'flex';
    setTimeout(showBanner, 3000);
  } else if (isMacSafari) {
    subEl.textContent = '加入 Dock 以使用系統分享功能';
    setTimeout(showBanner, 3000);
  } else if (isFirefox || isChromeIos) {
    // Firefox / Chrome iOS：不支援，略過 banner
  } else {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      subEl.textContent = '安裝後可從任何 App 直接分享檔案';
      installBtn.style.display = 'block';
      setTimeout(showBanner, 2000);
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome === 'accepted') dismiss();
    });
  }
})();

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.key === 'Escape') {
    // Close panels/modals in priority order
    const qrModal = document.getElementById('qr-modal');
    const membersPanel = document.getElementById('members-panel');
    const roomSettingsModal = document.getElementById('room-settings-modal');
    const joinPendingOverlay = document.getElementById('join-pending-overlay');
    if (joinPendingOverlay?.classList.contains('active')) return; // don't dismiss pending
    if (roomSettingsModal && !roomSettingsModal.classList.contains('hidden')) { roomSettingsModal.classList.add('hidden'); return; }
    if (membersPanel?.classList.contains('open')) { membersPanel.classList.remove('open'); document.getElementById('members-panel-overlay')?.classList.remove('show'); return; }
    if (qrModal?.classList.contains('active')) { qrModal.classList.remove('active'); return; }
    const speedCard = document.getElementById('speedtest-card');
    if (speedCard?.classList.contains('open')) { speedCard.classList.remove('open'); return; }
    return;
  }

  if (e.key === '/' && !inInput) {
    e.preventDefault();
    const msgInput = document.getElementById('message-input');
    if (msgInput) { msgInput.focus(); switchTab?.('chat'); }
    return;
  }
});

// ===== Onboarding Guide =====
(function initOnboarding() {
  if (_ls.get('wd-onboarded') === '1') return;
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  let step = 1;
  const TOTAL = 4;

  function goStep(n) {
    step = Math.max(1, Math.min(TOTAL, n));
    overlay.querySelectorAll('.ob-step').forEach(el => el.classList.toggle('active', +el.dataset.step === step));
    overlay.querySelectorAll('.ob-dot').forEach(el => el.classList.toggle('active', +el.dataset.dot === step));
    const nextBtn = document.getElementById('ob-next');
    if (nextBtn) nextBtn.textContent = step === TOTAL ? '開始使用 🎉' : '下一步';
  }

  document.getElementById('ob-next')?.addEventListener('click', () => {
    if (step === TOTAL) dismiss();
    else goStep(step + 1);
  });
  document.getElementById('ob-skip')?.addEventListener('click', dismiss);
  overlay.querySelectorAll('.ob-dot').forEach(el => el.addEventListener('click', () => goStep(+el.dataset.dot)));

  function dismiss() {
    overlay.style.display = 'none';
    _ls.set('wd-onboarded', '1');
  }
  goStep(1);
})();
