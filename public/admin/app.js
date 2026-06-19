// ===== State =====
let token = localStorage.getItem('wd-admin-token');
let currentAdmin = null;
let adminSocket = null;
let currentSettings = {};

// ===== API helper =====
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ===== Toast =====
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 3500);
}

// ===== Auth =====
function showDashboard(admin) {
  currentAdmin = admin;
  document.getElementById('login-screen').style.display  = 'none';
  document.getElementById('dashboard').style.display     = 'flex';
  document.getElementById('user-email').textContent      = admin.email;
  const displayName = admin.name || admin.email.split('@')[0];
  const dispEl = document.getElementById('user-display-name');
  if (dispEl) dispEl.textContent = displayName;
  document.getElementById('user-initial').textContent    = (admin.name || admin.email)[0].toUpperCase();
  connectAdminSocket();
  setTimeout(initMap, 200);
}

function logout() {
  if (adminSocket) adminSocket.disconnect();
  localStorage.removeItem('wd-admin-token');
  token = null;
  currentAdmin = null;
  document.getElementById('dashboard').style.display    = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-error').textContent    = '';
}

// Try to restore session
if (token) {
  api('GET', '/admin/api/stats').then(() => {
    // Token valid — get admin info from token payload
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      showDashboard({ email: payload.email, role: payload.role, id: payload.id, name: payload.name || null });
    } catch { logout(); }
  }).catch(logout);
}

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const err      = document.getElementById('login-error');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const res = await api('POST', '/admin/api/login', { email, password });
    token = res.token;
    localStorage.setItem('wd-admin-token', token);
    showDashboard(res.admin);
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

document.getElementById('logout-btn').addEventListener('click', logout);

// ===== Admin Socket =====
function connectAdminSocket() {
  adminSocket = io('/admin', { auth: { token } });

  adminSocket.on('connect_error', (e) => {
    if (e.message === 'Invalid token' || e.message === 'Authentication required') logout();
  });

  adminSocket.on('stats',          renderStats);
  adminSocket.on('rooms',          renderRooms);
  adminSocket.on('users',          renderUsers);
  adminSocket.on('admins',         renderAdmins);
  adminSocket.on('settings',       renderSettings);
  adminSocket.on('promos',         renderPromos);
  adminSocket.on('conn-locations', updateMapMarkers);
  adminSocket.on('system-health',  renderHealth);
  adminSocket.on('feedback',       renderFeedback);
}

// ===== Map =====
let adminMap = null;
const mapMarkers = [];

function initMap() {
  if (adminMap) return;
  adminMap = L.map('admin-map', { zoomControl: true, attributionControl: true }).setView([20, 10], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(adminMap);
}

function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function updateMapMarkers(locs) {
  if (!adminMap) return;
  mapMarkers.forEach(m => adminMap.removeLayer(m));
  mapMarkers.length = 0;

  const grouped = new Map();
  locs.forEach(loc => {
    if (!loc?.lat || !loc?.lon) return;
    const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
    if (!grouped.has(key)) grouped.set(key, { ...loc, count: 0 });
    grouped.get(key).count++;
  });

  grouped.forEach(loc => {
    const r = Math.min(7 + loc.count * 3, 22);
    const m = L.circleMarker([loc.lat, loc.lon], {
      radius: r,
      color: '#4361ee',
      fillColor: '#4361ee',
      fillOpacity: 0.55,
      weight: 2
    }).addTo(adminMap);
    const flag = countryFlag(loc.countryCode);
    m.bindPopup(`<b>${flag} ${esc(loc.country || '?')}</b><br><small>${esc(loc.city || '')}${loc.regionName ? ', ' + esc(loc.regionName) : ''}</small><br>連線數：<b>${loc.count}</b>`);
    mapMarkers.push(m);
  });

  const total = locs.length;
  const countEl = document.getElementById('map-conn-count');
  if (countEl) countEl.textContent = total ? `${total} 個活躍連線` : '';
}

// ===== Navigation =====
const sections = { overview: 'Overview', rooms: 'Live Rooms', users: 'Users', admins: 'Admins', promos: 'Promo Codes', feedback: 'Feedback', health: 'System Health', settings: 'Settings' };

document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', () => switchSection(item.dataset.section));
});

function switchSection(id) {
  document.querySelectorAll('.nav-item[data-section]').forEach(i => i.classList.toggle('active', i.dataset.section === id));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === `section-${id}`));
  document.getElementById('section-title').textContent = sections[id] || id;
  document.getElementById('sidebar').classList.remove('open');
  if (id === 'overview') setTimeout(initMap, 50);
}

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ===== Stats Rendering =====
function fmtUptime(s) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  return `${h}h ${m}m`;
}
function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b/1048576).toFixed(1)} MB`;
  return `${(b/1073741824).toFixed(2)} GB`;
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderStats(data) {
  setEl('s-uptime',   fmtUptime(data.uptime));
  setEl('s-conns-val', data.currentConns);
  setEl('s-peak',     data.peakConnections);
  setEl('s-rooms',    data.activeRooms);
  setEl('s-msgs',     data.messagesRelayed.toLocaleString());
  setEl('s-files',    data.filesRelayed.toLocaleString());
  setEl('s-bytes',    fmtBytes(data.bytesRelayed));
  setEl('rooms-badge', data.activeRooms);
  renderChart(data.history || []);
  renderBandwidthChart(data.history || []);
  updateKpiAlerts(data);
}

function renderChart(history) {
  const el = document.getElementById('activity-chart');
  if (!history.length) {
    el.innerHTML = '<div class="chart-empty-inner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><span>暫無數據 — 資料收集中</span></div>';
    return;
  }
  const max = Math.max(...history.map(h => h.c), 1);
  el.innerHTML = history.map(h => {
    const pct = Math.max(4, Math.round((h.c / max) * 100));
    const time = new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="chart-bar" style="height:${pct}%" data-tip="${h.c} users @ ${time}"></div>`;
  }).join('');
}

function renderBandwidthChart(history) {
  const el = document.getElementById('bandwidth-chart');
  if (!el) return;
  if (!history.length) {
    el.innerHTML = '<div class="chart-empty-inner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span>暫無傳輸數據</span></div>';
    return;
  }
  const max = Math.max(...history.map(h => h.b ?? 0), 1);
  el.innerHTML = history.map(h => {
    const bytes = h.b ?? 0;
    const pct = Math.max(4, Math.round((bytes / max) * 100));
    const time = new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="bw-chart-bar" style="height:${pct}%" data-tip="${fmtBytes(bytes)} @ ${time}"></div>`;
  }).join('');
}

function updateKpiAlerts(data) {
  const connCard = document.getElementById('kpi-conns');
  if (connCard) {
    connCard.classList.toggle('kpi-warning', data.currentConns > 20 && data.currentConns <= 80);
    connCard.classList.toggle('kpi-danger',  data.currentConns > 80);
  }
  const roomCard = document.getElementById('kpi-rooms');
  if (roomCard) {
    roomCard.classList.toggle('kpi-warning', data.activeRooms > 10 && data.activeRooms <= 30);
    roomCard.classList.toggle('kpi-danger',  data.activeRooms > 30);
  }
}

const cpuHistory = [];

function renderHealth(h) {
  // RAM
  const memPct = h.memory.usedPct;
  const memBar = document.getElementById('h-mem-bar');
  if (memBar) {
    memBar.style.width = memPct + '%';
    memBar.className = 'health-bar' + (memPct > 85 ? ' danger' : memPct > 70 ? ' warning' : '');
  }
  setEl('h-mem-pct', memPct + '%');
  const memSrc = h.memory.source === 'proc' ? ' <small style="color:var(--muted)">(container)</small>' : '';
  const memEl = document.getElementById('h-mem-pct');
  if (memEl) memEl.innerHTML = memPct + '%' + memSrc;
  setEl('h-mem-sub', `${fmtBytes(h.memory.used)} / ${fmtBytes(h.memory.total)}`);

  // CPU — use real cpuUsagePct from os.cpus() sampling, fallback to loadavg estimate
  const cpuPct = (typeof h.cpuUsagePct === 'number') ? h.cpuUsagePct
    : Math.min(100, Math.round(h.loadAvg[0] / h.cpuCount * 100));
  const cpuBar = document.getElementById('h-cpu-bar');
  if (cpuBar) {
    cpuBar.style.width = cpuPct + '%';
    cpuBar.className = 'health-bar' + (cpuPct > 80 ? ' danger' : cpuPct > 60 ? ' warning' : '');
  }
  setEl('h-cpu-pct', `${cpuPct}%`);
  setEl('h-cpu-sub', `${h.cpuCount} cores · Load avg: ${h.loadAvg[0].toFixed(2)} / ${h.loadAvg[1].toFixed(2)} / ${h.loadAvg[2].toFixed(2)}`);

  // Disk
  if (h.disk) {
    const diskPct = h.disk.usedPct;
    const diskBar = document.getElementById('h-disk-bar');
    if (diskBar) {
      diskBar.style.width = diskPct + '%';
      diskBar.className = 'health-bar' + (diskPct > 90 ? ' danger' : diskPct > 75 ? ' warning' : '');
    }
    setEl('h-disk-pct', diskPct + '%');
    setEl('h-disk-sub', `${fmtBytes(h.disk.used)} / ${fmtBytes(h.disk.total)}`);
  } else {
    setEl('h-disk-pct', 'N/A');
    setEl('h-disk-sub', 'Not available on this platform');
  }

  // Heap
  const heapPct = Math.round(h.nodeHeap.used / h.nodeHeap.total * 100);
  const heapBar = document.getElementById('h-heap-bar');
  if (heapBar) {
    heapBar.style.width = heapPct + '%';
    heapBar.className = 'health-bar' + (heapPct > 90 ? ' danger' : heapPct > 75 ? ' warning' : '');
  }
  setEl('h-heap-pct', heapPct + '%');
  setEl('h-heap-sub', `${fmtBytes(h.nodeHeap.used)} / ${fmtBytes(h.nodeHeap.total)}`);

  // Process info table
  if (h.proc) {
    const tbody = document.getElementById('proc-info-tbody');
    if (tbody) {
      const rows = [
        ['Node.js Version', h.proc.version],
        ['Platform',        `${h.proc.platform} / ${h.proc.arch}`],
        ['Process ID',      h.proc.pid],
        ['Process Uptime',  fmtUptime(h.proc.uptime)]
      ];
      tbody.innerHTML = rows.map(([k, v]) => `
        <tr>
          <td style="width:180px;font-weight:600;font-size:.82rem;color:var(--muted)">${k}</td>
          <td style="font-size:.85rem;font-family:monospace">${esc(String(v))}</td>
        </tr>`).join('');
    }
  }

  // CPU history sparkline — use real cpuUsagePct
  cpuHistory.push({ t: Date.now(), v: cpuPct, pct: cpuPct });
  if (cpuHistory.length > 30) cpuHistory.shift();
  renderCpuChart();

  const updEl = document.getElementById('health-updated');
  if (updEl) updEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

function renderCpuChart() {
  const el = document.getElementById('cpu-chart');
  if (!el) return;
  if (!cpuHistory.length) return;
  const max = Math.max(...cpuHistory.map(h => h.pct), 1);
  el.innerHTML = cpuHistory.map(h => {
    const barH = Math.max(4, Math.round((h.pct / max) * 100));
    const time = new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `<div class="cpu-chart-bar" style="height:${barH}%" data-tip="CPU ${h.pct}% @ ${time}"></div>`;
  }).join('');
}

// ===== Rooms =====
let allRooms = [];
let roomsQuery = '';

function renderRooms(rooms) {
  allRooms = rooms.filter(r => r.peerCount > 0);
  document.getElementById('room-count-pill').textContent = `${allRooms.length} room${allRooms.length !== 1 ? 's' : ''}`;
  renderRoomsTable();
}

function renderRoomsTable() {
  const tbody = document.getElementById('rooms-tbody');
  const q = roomsQuery.toLowerCase();
  const list = q
    ? allRooms.filter(r =>
        r.roomId.toLowerCase().includes(q) ||
        r.peers.some(p => p.name.toLowerCase().includes(q)))
    : allRooms;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">${q ? 'No rooms match your search' : 'No active rooms'}</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(r => {
    const geo = r.geo;
    const locHtml = geo
      ? `<span title="${esc(geo.city || '')}${geo.regionName ? ', ' + esc(geo.regionName) : ''}, ${esc(geo.country || '')}">${countryFlag(geo.countryCode)} ${esc(geo.country || '')}</span>`
      : `<span style="color:var(--muted)">—</span>`;
    const duration = r.createdAt ? Math.floor((Date.now() - r.createdAt) / 60000) : null;
    const durationStr = duration !== null ? `<br><small style="color:var(--muted)">${duration < 60 ? duration + 'm' : Math.floor(duration/60) + 'h ' + (duration%60) + 'm'}</small>` : '';
    const banBadge = (r.banCount || 0) > 0
      ? `<button class="btn-xs btn-danger-xs" onclick="openBanModal('${esc(r.roomId)}')">${r.banCount} 筆</button>`
      : `<span style="color:var(--muted)">—</span>`;
    return `
    <tr>
      <td><code>${esc(r.roomId)}</code></td>
      <td><strong>${r.peerCount}</strong></td>
      <td><div class="peer-chips">${r.peers.map(p => `<span class="peer-chip">${esc(p.name)}${['admin','business'].includes(p.role) ? ` <span class="role-badge role-${p.role}" style="font-size:.58rem;padding:1px 5px;">${p.role}</span>` : ''}<span class="peer-chip-actions"><button class="btn-xs" onclick="adminKickPeer('${esc(r.roomId)}','${p.socketId}')">踢</button><button class="btn-xs btn-danger-xs" onclick="adminBanPeer('${esc(r.roomId)}','${p.socketId}','${esc(p.name)}')">封</button></span></span>`).join('')}</div></td>
      <td style="font-size:.82rem">${locHtml}</td>
      <td>${r.createdAt ? timeAgo(r.createdAt) : '—'}${durationStr}</td>
      <td><strong>${r.filesTransferred || 0}</strong></td>
      <td>${banBadge}</td>
      <td><button class="btn-danger" onclick="closeRoom('${r.roomId}')">Close</button></td>
    </tr>`;
  }).join('');
}

document.getElementById('rooms-search').addEventListener('input', e => {
  roomsQuery = e.target.value.trim();
  renderRoomsTable();
});

async function closeRoom(roomId) {
  if (!confirm(`Close room ${roomId} and disconnect all peers?`)) return;
  try {
    await api('DELETE', `/admin/api/rooms/${encodeURIComponent(roomId)}`);
    toast('Room closed', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function adminKickPeer(roomId, socketId) {
  try {
    await api('POST', `/admin/api/rooms/${encodeURIComponent(roomId)}/kick`, { socketId });
    toast('已踢出', 'success');
  } catch (e) { toast(e.message, 'error'); }
}
async function adminBanPeer(roomId, socketId, name) {
  if (!confirm(`封鎖並踢出 ${name}？`)) return;
  try {
    await api('POST', `/admin/api/rooms/${encodeURIComponent(roomId)}/ban`, { socketId });
    toast('已封鎖並踢出', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Room Ban Modal =====
let banModalRoomId = null;

async function openBanModal(roomId) {
  banModalRoomId = roomId;
  document.getElementById('ban-modal-room').textContent = roomId;
  const overlay = document.getElementById('ban-modal-overlay');
  overlay.style.display = 'flex';
  await refreshBanModal();
}

function closeBanModal() {
  document.getElementById('ban-modal-overlay').style.display = 'none';
  banModalRoomId = null;
}

async function refreshBanModal() {
  const body = document.getElementById('ban-modal-body');
  try {
    const data = await api('GET', `/admin/api/rooms/${encodeURIComponent(banModalRoomId)}/bans`);
    if (!data.bans.length) {
      body.innerHTML = `<p style="color:var(--muted);text-align:center;padding:16px 0">此房間目前沒有封鎖記錄</p>`;
      return;
    }
    body.innerHTML = `<table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:4px 8px;font-size:.78rem;color:var(--muted)">類型</th>
        <th style="text-align:left;padding:4px 8px;font-size:.78rem;color:var(--muted)">值</th>
        <th style="padding:4px 8px"></th>
      </tr></thead>
      <tbody>${data.bans.map(entry => {
        const [type, val] = entry.startsWith('user:') ? ['用戶 ID', entry.slice(5)] : ['IP', entry.slice(3)];
        return `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:6px 8px"><span style="font-size:.72rem;padding:2px 6px;border-radius:4px;background:var(--border)">${type}</span></td>
          <td style="padding:6px 8px;font-family:monospace;font-size:.82rem">${esc(val)}</td>
          <td style="padding:6px 8px;text-align:right"><button class="btn-xs btn-danger-xs" onclick="removeRoomBan('${esc(entry)}')">移除</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } catch (e) { body.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`; }
}

async function removeRoomBan(entry) {
  try {
    await api('DELETE', `/admin/api/rooms/${encodeURIComponent(banModalRoomId)}/bans/${encodeURIComponent(entry)}`);
    toast('封鎖已移除', 'success');
    await refreshBanModal();
  } catch (e) { toast(e.message, 'error'); }
}

async function clearAllRoomBans() {
  if (!confirm(`清除 ${banModalRoomId} 的所有封鎖記錄？`)) return;
  try {
    await api('DELETE', `/admin/api/rooms/${encodeURIComponent(banModalRoomId)}/bans`);
    toast('已清除全部封鎖', 'success');
    await refreshBanModal();
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('ban-modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('ban-modal-overlay')) closeBanModal();
});

// ===== Admins =====
function renderAdmins(admins) {
  const tbody = document.getElementById('admins-tbody');
  tbody.innerHTML = admins.map(a => `
    <tr>
      <td>${esc(a.email)}</td>
      <td><span class="role-badge ${a.role === 'super-admin' ? 'role-super' : 'role-admin'}">${a.role}</span></td>
      <td>${new Date(a.createdAt).toLocaleDateString()}</td>
      <td>${a.id !== currentAdmin?.id ? `<button class="btn-danger" onclick="removeAdmin('${a.id}','${esc(a.email)}')">Remove</button>` : '<span style="color:var(--muted);font-size:.78rem">You</span>'}</td>
    </tr>`).join('');
}

async function removeAdmin(id, email) {
  if (!confirm(`Remove admin ${email}?`)) return;
  try {
    await api('DELETE', `/admin/api/admins/${id}`);
    toast('Admin removed', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('open-add-admin').addEventListener('click', () => {
  document.getElementById('add-admin-form').style.display = 'block';
  document.getElementById('open-add-admin').style.display = 'none';
});
document.getElementById('cancel-add-admin').addEventListener('click', () => {
  document.getElementById('add-admin-form').style.display = 'none';
  document.getElementById('open-add-admin').style.display = 'block';
});
document.getElementById('submit-add-admin').addEventListener('click', async () => {
  const email    = document.getElementById('new-admin-email').value.trim();
  const password = document.getElementById('new-admin-pass').value;
  const role     = document.getElementById('new-admin-role').value;
  if (!email || !password) { toast('Email and password required', 'error'); return; }
  try {
    await api('POST', '/admin/api/admins', { email, password, role });
    toast('Admin created', 'success');
    document.getElementById('new-admin-email').value = '';
    document.getElementById('new-admin-pass').value  = '';
    document.getElementById('add-admin-form').style.display = 'none';
    document.getElementById('open-add-admin').style.display = 'block';
  } catch (e) { toast(e.message, 'error'); }
});

// ===== Settings =====
function renderSettings(s) {
  currentSettings = s;
  document.getElementById('set-maxpeers').value        = s.maxPeersPerRoom;
  document.getElementById('set-maxfile').value         = s.maxFileSizeMB;
  document.getElementById('set-vipfile').value         = s.vipFileSizeMB || 2048;
  document.getElementById('set-bizfile').value         = s.businessFileSizeMB || 5120;
  document.getElementById('set-adminfile').value       = s.adminFileSizeMB || 999999;
  document.getElementById('set-default-room').checked  = !!s.defaultCanCustomRoom;
  document.getElementById('set-vip-room').checked      = s.vipCanCustomRoom !== false;
  document.getElementById('set-biz-room').checked      = s.businessCanCustomRoom !== false;
  document.getElementById('set-admin-room').checked    = s.adminCanCustomRoom !== false;
  document.getElementById('set-default-kick').checked  = !!s.defaultCanKickBan;
  document.getElementById('set-vip-kick').checked      = !!s.vipCanKickBan;
  document.getElementById('set-biz-kick').checked      = s.businessCanKickBan !== false;
  document.getElementById('set-admin-kick').checked    = s.adminCanKickBan !== false;
  document.getElementById('set-default-rs').checked    = !!s.defaultCanRoomSettings;
  document.getElementById('set-vip-rs').checked        = s.vipCanRoomSettings !== false;
  document.getElementById('set-biz-rs').checked        = s.businessCanRoomSettings !== false;
  document.getElementById('set-admin-rs').checked      = s.adminCanRoomSettings !== false;
  document.getElementById('set-default-join').checked  = s.defaultCanJoin !== false;
  document.getElementById('set-vip-join').checked      = s.vipCanJoin !== false;
  document.getElementById('set-biz-join').checked      = s.businessCanJoin !== false;
  document.getElementById('set-admin-join').checked    = s.adminCanJoin !== false;
  document.getElementById('set-msgrelay').checked      = s.allowMessageRelay;
  document.getElementById('set-filerelay').checked     = s.allowFileRelay;
  document.getElementById('set-maintenance').checked   = s.maintenanceMode;
}

document.getElementById('save-settings').addEventListener('click', async () => {
  const body = {
    maxPeersPerRoom:         parseInt(document.getElementById('set-maxpeers').value) || 10,
    maxFileSizeMB:           parseInt(document.getElementById('set-maxfile').value) || 500,
    vipFileSizeMB:           parseInt(document.getElementById('set-vipfile').value) || 2048,
    businessFileSizeMB:      parseInt(document.getElementById('set-bizfile').value) || 5120,
    adminFileSizeMB:         parseInt(document.getElementById('set-adminfile').value) || 999999,
    defaultCanCustomRoom:    document.getElementById('set-default-room').checked,
    vipCanCustomRoom:        document.getElementById('set-vip-room').checked,
    businessCanCustomRoom:   document.getElementById('set-biz-room').checked,
    adminCanCustomRoom:      document.getElementById('set-admin-room').checked,
    defaultCanKickBan:       document.getElementById('set-default-kick').checked,
    vipCanKickBan:           document.getElementById('set-vip-kick').checked,
    businessCanKickBan:      document.getElementById('set-biz-kick').checked,
    adminCanKickBan:         document.getElementById('set-admin-kick').checked,
    defaultCanRoomSettings:  document.getElementById('set-default-rs').checked,
    vipCanRoomSettings:      document.getElementById('set-vip-rs').checked,
    businessCanRoomSettings: document.getElementById('set-biz-rs').checked,
    adminCanRoomSettings:    document.getElementById('set-admin-rs').checked,
    defaultCanJoin:          document.getElementById('set-default-join').checked,
    vipCanJoin:              document.getElementById('set-vip-join').checked,
    businessCanJoin:         document.getElementById('set-biz-join').checked,
    adminCanJoin:            document.getElementById('set-admin-join').checked,
    allowMessageRelay:       document.getElementById('set-msgrelay').checked,
    allowFileRelay:          document.getElementById('set-filerelay').checked,
    maintenanceMode:         document.getElementById('set-maintenance').checked,
  };
  try {
    await api('PUT', '/admin/api/settings', body);
    toast('Settings saved', 'success');
  } catch (e) { toast(e.message, 'error'); }
});

// ===== Users =====
const LANG_FLAGS = { en:'🇺🇸','zh-TW':'🇹🇼','zh-CN':'🇨🇳',ja:'🇯🇵',ko:'🇰🇷',es:'🇪🇸',fr:'🇫🇷',de:'🇩🇪',pt:'🇧🇷',it:'🇮🇹',ru:'🇷🇺',th:'🇹🇭',vi:'🇻🇳',id:'🇮🇩' };
let allUsers = [];
let showBannedUsers = false;
let usersQuery = '';

function renderUsers(userList) {
  allUsers = userList;
  const badge = document.getElementById('users-badge');
  badge.textContent = userList.length;
  badge.style.display = userList.length ? 'inline-flex' : 'none';
  document.getElementById('user-count-pill').textContent = `${userList.length} user${userList.length !== 1 ? 's' : ''}`;
  renderUsersTable();
}

function renderUsersTable() {
  const tbody = document.getElementById('users-tbody');
  const q = usersQuery.toLowerCase();
  let list = showBannedUsers ? allUsers.filter(u => u.banned) : allUsers.filter(u => !u.banned);
  if (q) list = list.filter(u =>
    u.email.toLowerCase().includes(q) ||
    (u.name || '').toLowerCase().includes(q));
  if (!list.length) {
    const msg = q ? 'No users match your search' : (showBannedUsers ? 'No banned users' : 'No active users');
    tbody.innerHTML = `<tr><td colspan="11" class="empty-row">${msg}</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(u => {
    const eff = u.effectiveMaxFileSizeMB;
    const effLabel = eff >= 1024 ? `${(eff/1024).toFixed(1)} GB` : `${eff} MB`;
    const customInfo = u.customFileSizeMB != null
      ? `<br><small style="color:var(--primary)">${u.customFileSizeMB >= 1024 ? `${(u.customFileSizeMB/1024).toFixed(1)} GB` : `${u.customFileSizeMB} MB`} (custom)</small>`
      : u.activePromoId ? `<br><small style="color:var(--muted)">via promo</small>` : `<br><small style="color:var(--muted)">default</small>`;
    const promoLabel = u.activePromoId
      ? `<span style="color:var(--success);font-size:.78rem">Active</span>`
      : `<span style="color:var(--muted);font-size:.78rem">None</span>`;
    const statusBadge = u.banned
      ? `<span class="status-banned">Banned</span>`
      : `<span class="status-active">Active</span>`;
    const actions = u.banned
      ? `<button class="btn-sm" onclick="unbanUser('${u.id}','${esc(u.email)}')">Unban</button>`
      : `<button class="btn-sm" onclick="setUserLimit('${u.id}','${esc(u.email)}',${u.customFileSizeMB ?? ''})">Limit</button>
         ${u.customFileSizeMB != null ? `<button class="btn-sm" onclick="clearUserLimit('${u.id}')">Reset</button> ` : ''}
         <button class="btn-danger" onclick="banUser('${u.id}','${esc(u.email)}')">Ban</button>`;
    const langDisplay = u.language
      ? `<span title="${esc(u.language)}">${LANG_FLAGS[u.language] || '🌐'} ${esc(u.language)}</span>`
      : `<span style="color:var(--muted);font-size:.75rem">—</span>`;
    const roomDisplay = u.customRoomId
      ? `<code style="color:var(--primary);font-size:.8rem">${esc(u.customRoomId)}</code>
         <button class="btn-sm" style="margin-left:4px" onclick="clearUserRoom('${u.id}')">✕</button>`
      : `<button class="btn-sm" onclick="setUserRoom('${u.id}','${esc(u.email)}')">Set</button>`;
    const ROLE_COLORS = { admin: '#f59e0b', vip: '#a855f7', business: '#10b981' };
    const permRoleBadge = u.role
      ? `<span style="display:inline-block;padding:1px 8px;border-radius:12px;font-size:.72rem;font-weight:700;background:${ROLE_COLORS[u.role] || '#6b7280'}22;color:${ROLE_COLORS[u.role] || '#6b7280'};border:1px solid ${ROLE_COLORS[u.role] || '#6b7280'}55">${esc(u.role)}</span>`
      : '';
    const promoRoleBadge = u.promoRole
      ? (() => {
          const expired = u.promoRoleExpiresAt && new Date(u.promoRoleExpiresAt) < new Date();
          const expiresStr = u.promoRoleExpiresAt ? new Date(u.promoRoleExpiresAt).toLocaleDateString() : '永久';
          return `<span style="display:inline-block;margin-left:2px;padding:1px 8px;border-radius:12px;font-size:.70rem;font-weight:700;background:${ROLE_COLORS[u.promoRole] || '#6b7280'}15;color:${expired ? '#9ca3af' : (ROLE_COLORS[u.promoRole] || '#6b7280')};border:1px dashed ${ROLE_COLORS[u.promoRole] || '#6b7280'}66" title="臨時角色：${expired ? '已過期' : expiresStr}">📋${esc(u.promoRole)}</span>`;
        })()
      : '';
    const roleDisplay = (u.role || u.promoRole)
      ? `${permRoleBadge}${promoRoleBadge}
         <button class="btn-sm" style="margin-left:2px" onclick="setUserRole('${u.id}','${esc(u.email)}','${esc(u.role || '')}')">✎</button>
         ${u.role ? `<button class="btn-sm" onclick="clearUserRole('${u.id}')">✕</button>` : ''}`
      : `<button class="btn-sm" onclick="setUserRole('${u.id}','${esc(u.email)}','')">Set</button>`;
    const lastSeenDisplay = u.lastSeenAt
      ? `<span title="${new Date(u.lastSeenAt).toLocaleString()}">${timeAgo(new Date(u.lastSeenAt).getTime())}</span>`
      : `<span style="color:var(--muted)">—</span>`;
    const ipDisplay = u.lastIp
      ? `<code style="font-size:.72rem;color:var(--muted)">${esc(u.lastIp)}</code>`
      : `<span style="color:var(--muted)">—</span>`;
    return `
      <tr class="${u.banned ? 'user-banned-row' : ''}">
        <td>
          <div style="font-weight:600;font-size:.85rem">${esc(u.name || u.email)}</div>
          <div style="color:var(--muted);font-size:.75rem">${esc(u.email)}</div>
        </td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td style="font-size:.82rem">${lastSeenDisplay}</td>
        <td style="font-size:.82rem">${langDisplay}</td>
        <td>${roomDisplay}</td>
        <td style="font-size:.82rem">${roleDisplay}</td>
        <td>${effLabel}${customInfo}</td>
        <td>${promoLabel}</td>
        <td>${statusBadge}</td>
        <td>${ipDisplay}</td>
        <td style="white-space:nowrap;display:flex;gap:4px;flex-wrap:wrap">${actions}</td>
      </tr>`;
  }).join('');
}

document.getElementById('show-active-users').addEventListener('click', () => {
  showBannedUsers = false;
  document.getElementById('show-active-users').classList.replace('btn-ghost', 'btn-primary');
  document.getElementById('show-banned-users').classList.replace('btn-primary', 'btn-ghost');
  renderUsersTable();
});
document.getElementById('show-banned-users').addEventListener('click', () => {
  showBannedUsers = true;
  document.getElementById('show-banned-users').classList.replace('btn-ghost', 'btn-primary');
  document.getElementById('show-active-users').classList.replace('btn-primary', 'btn-ghost');
  renderUsersTable();
});

document.getElementById('users-search').addEventListener('input', e => {
  usersQuery = e.target.value.trim();
  renderUsersTable();
});

async function setUserRoom(id, email) {
  const val = prompt(`Custom room ID for ${email} (3–20 letters/numbers, leave empty to clear):`);
  if (val === null) return;
  try {
    await api('PUT', `/admin/api/users/${id}`, { customRoomId: val.trim().toUpperCase() || null });
    toast(val.trim() ? `Room ID set to ${val.trim().toUpperCase()}` : 'Room ID cleared', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function clearUserRoom(id) {
  try {
    await api('PUT', `/admin/api/users/${id}`, { customRoomId: null });
    toast('Room ID cleared', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function setUserRole(id, email, current) {
  const val = prompt(`Role for ${email}\nOptions: admin, vip, business (leave empty to remove):`, current || '');
  if (val === null) return;
  const role = val.trim().toLowerCase() || null;
  if (role && !['admin', 'vip', 'business'].includes(role)) { toast('Invalid role. Use: admin, vip or business', 'error'); return; }
  try {
    await api('PUT', `/admin/api/users/${id}`, { role });
    toast(role ? `Role set to ${role}` : 'Role removed', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function clearUserRole(id) {
  try {
    await api('PUT', `/admin/api/users/${id}`, { role: null });
    toast('Role removed', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function setUserLimit(id, email, current) {
  const val = prompt(`File limit for ${email} (MB). Leave empty to remove custom limit:`, current || '');
  if (val === null) return;
  if (val.trim() === '') { await clearUserLimit(id); return; }
  const mb = parseInt(val);
  if (isNaN(mb) || mb < 1) { toast('Invalid MB value', 'error'); return; }
  try {
    await api('PUT', `/admin/api/users/${id}`, { customFileSizeMB: mb });
    toast(`Limit set to ${mb} MB`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function clearUserLimit(id) {
  try {
    await api('PUT', `/admin/api/users/${id}`, { customFileSizeMB: null });
    toast('Custom limit removed', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function banUser(id, email) {
  const reason = prompt(`Reason for banning ${email} (optional):`);
  if (reason === null) return;
  try {
    await api('PUT', `/admin/api/users/${id}`, { banned: true, banReason: reason || null });
    toast(`${email} has been banned`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function unbanUser(id, email) {
  if (!confirm(`Unban ${email}?`)) return;
  try {
    await api('PUT', `/admin/api/users/${id}`, { banned: false });
    toast(`${email} has been unbanned`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Promo Codes =====
let allPromos = [];
function renderPromos(promos) {
  allPromos = promos;
  const tbody = document.getElementById('promos-tbody');
  if (!promos.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No promo codes yet</td></tr>';
    return;
  }
  tbody.innerHTML = promos.map(p => {
    const mbLabel = p.maxFileSizeMB >= 1024 ? `${(p.maxFileSizeMB/1024).toFixed(1)} GB` : `${p.maxFileSizeMB} MB`;
    const usageLabel = p.usageLimit > 0 ? `${p.usedCount} / ${p.usageLimit}` : `${p.usedCount} / ∞`;
    const expires = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : '—';
    const expired = p.expiresAt && new Date(p.expiresAt) < new Date();
    const roomLabel = p.customRoomId ? `<code style="color:var(--primary);font-size:.8rem">${esc(p.customRoomId)}</code>` : '<span style="color:var(--muted)">—</span>';
    const canCustomLabel = p.canCustomRoom ? '<span style="color:var(--success);font-size:.85rem">✓ 可自訂</span>' : '<span style="color:var(--muted)">—</span>';
    const ROLE_COLORS = { vip: '#a855f7', business: '#10b981' };
    const roleLabel = p.grantRole
      ? `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:.72rem;font-weight:700;background:${ROLE_COLORS[p.grantRole]}22;color:${ROLE_COLORS[p.grantRole]};border:1px solid ${ROLE_COLORS[p.grantRole]}55">${p.grantRole}</span>${p.roleDurationDays ? `<br><small style="color:var(--muted)">${p.roleDurationDays}天</small>` : '<br><small style="color:var(--muted)">永久</small>'}`
      : '<span style="color:var(--muted)">—</span>';
    return `
    <tr>
      <td><code style="font-weight:700;letter-spacing:1px">${esc(p.code)}</code></td>
      <td style="color:var(--muted)">${esc(p.description || '—')}</td>
      <td><strong style="color:var(--primary)">${mbLabel}</strong></td>
      <td>${roleLabel}</td>
      <td>${roomLabel}</td>
      <td>${canCustomLabel}</td>
      <td>${usageLabel}</td>
      <td style="${expired ? 'color:var(--danger)' : ''}">${expires}${expired ? ' ⚠' : ''}</td>
      <td>
        <label class="toggle" title="${p.enabled ? 'Enabled' : 'Disabled'}">
          <input type="checkbox" ${p.enabled ? 'checked' : ''} onchange="togglePromo('${p.id}', this.checked)">
          <span class="slider"></span>
        </label>
      </td>
      <td style="white-space:nowrap">
        <button class="btn-sm" onclick="openEditPromo('${p.id}')">Edit</button>
        <button class="btn-danger" onclick="deletePromo('${p.id}','${esc(p.code)}')">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('open-add-promo').addEventListener('click', () => {
  document.getElementById('add-promo-form').style.display = 'block';
  document.getElementById('open-add-promo').style.display = 'none';
});
document.getElementById('cancel-add-promo').addEventListener('click', () => {
  document.getElementById('add-promo-form').style.display = 'none';
  document.getElementById('open-add-promo').style.display = 'block';
});
document.getElementById('submit-add-promo').addEventListener('click', async () => {
  const code        = document.getElementById('new-promo-code').value.trim().toUpperCase();
  const description = document.getElementById('new-promo-desc').value.trim();
  const maxFileSizeMB = parseInt(document.getElementById('new-promo-mb').value);
  const usageLimit  = parseInt(document.getElementById('new-promo-limit').value) || 0;
  const expiresAt   = document.getElementById('new-promo-expires').value || null;
  const customRoomId = document.getElementById('new-promo-room').value.trim().toUpperCase() || null;
  const canCustomRoom = document.getElementById('new-promo-can-custom-room').checked;
  const grantRole = document.getElementById('new-promo-grant-role').value || null;
  const roleDurationDays = parseInt(document.getElementById('new-promo-role-days').value) || null;
  if (!code || !maxFileSizeMB) { toast('Code and file limit required', 'error'); return; }
  try {
    await api('POST', '/admin/api/promos', { code, description, maxFileSizeMB, usageLimit, expiresAt, customRoomId, canCustomRoom, grantRole, roleDurationDays });
    toast('Promo code created', 'success');
    document.getElementById('new-promo-code').value = '';
    document.getElementById('new-promo-desc').value = '';
    document.getElementById('new-promo-mb').value = '';
    document.getElementById('new-promo-limit').value = '';
    document.getElementById('new-promo-expires').value = '';
    document.getElementById('new-promo-room').value = '';
    document.getElementById('new-promo-can-custom-room').checked = false;
    document.getElementById('new-promo-grant-role').value = '';
    document.getElementById('new-promo-role-days').value = '';
    document.getElementById('add-promo-form').style.display = 'none';
    document.getElementById('open-add-promo').style.display = 'block';
  } catch (e) { toast(e.message, 'error'); }
});

async function togglePromo(id, enabled) {
  try {
    await api('PUT', `/admin/api/promos/${id}`, { enabled });
    toast(enabled ? 'Promo enabled' : 'Promo disabled', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function deletePromo(id, code) {
  if (!confirm(`Delete promo code "${code}"?`)) return;
  try {
    await api('DELETE', `/admin/api/promos/${id}`);
    toast('Promo code deleted', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Feedback =====
let allFeedback = [];
let feedbackFilter = '';

function renderFeedback(items) {
  allFeedback = items;
  const unread = items.filter(f => !f.read).length;
  const badge = document.getElementById('feedback-badge');
  if (badge) { badge.textContent = unread; badge.style.display = unread ? 'inline-flex' : 'none'; }
  setEl('fb-total', items.length);
  setEl('fb-unread', unread);
  const rated = items.filter(f => f.rating);
  setEl('fb-avg-rating', rated.length ? (rated.reduce((s, f) => s + f.rating, 0) / rated.length).toFixed(1) + ' ★' : '—');
  setEl('fb-bug-count', items.filter(f => f.type === 'bug').length);
  renderFeedbackTable();
}

function renderFeedbackTable() {
  const tbody = document.getElementById('feedback-tbody');
  if (!tbody) return;
  const TYPE_LABELS = { feature: '💡 建議', bug: '🐛 問題', compliment: '❤️ 讚美', other: '💬 其他' };
  let list = feedbackFilter ? allFeedback.filter(f => f.type === feedbackFilter) : allFeedback;
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No feedback</td></tr>`; return; }
  tbody.innerHTML = list.map(f => {
    const starsHtml = f.rating ? `<span style="color:#f59e0b;letter-spacing:1px">${'★'.repeat(f.rating)}</span><span style="color:var(--muted)">${'★'.repeat(5-f.rating)}</span>` : '<span style="color:var(--muted)">—</span>';
    return `<tr style="${f.read ? '' : 'font-weight:600;background:rgba(67,97,238,.04)'}">
      <td style="white-space:nowrap;font-size:.78rem">${timeAgo(new Date(f.createdAt).getTime())}</td>
      <td style="font-size:.78rem">${f.userName ? esc(f.userName) : '<span style="color:var(--muted)">訪客</span>'}${f.userEmail ? `<br><span style="color:var(--muted);font-size:.7rem">${esc(f.userEmail)}</span>` : ''}</td>
      <td><span style="font-size:.8rem">${TYPE_LABELS[f.type] || f.type}</span></td>
      <td>${starsHtml}</td>
      <td style="max-width:320px;font-size:.82rem;word-break:break-word">${esc(f.message)}</td>
      <td><span class="status-${f.read ? 'active' : 'banned'}" style="font-size:.72rem">${f.read ? '已讀' : '未讀'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn-sm" onclick="toggleFeedbackRead('${f.id}',${!f.read})">${f.read ? '標為未讀' : '標為已讀'}</button>
        <button class="btn-danger" onclick="deleteFeedback('${f.id}')">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

async function toggleFeedbackRead(id, read) {
  try {
    await api('PUT', `/admin/api/feedback/${id}`, { read });
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteFeedback(id) {
  if (!confirm('Delete this feedback?')) return;
  try {
    await api('DELETE', `/admin/api/feedback/${id}`);
    toast('Deleted', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('clear-all-feedback')?.addEventListener('click', async () => {
  if (!confirm('Clear ALL feedback? This cannot be undone.')) return;
  try {
    await api('DELETE', '/admin/api/feedback?all=true');
    toast('All feedback cleared', 'success');
  } catch (e) { toast(e.message, 'error'); }
});

document.getElementById('feedback-filter')?.addEventListener('change', e => {
  feedbackFilter = e.target.value;
  renderFeedbackTable();
});

// ===== Edit Promo =====
let editPromoId = null;

function openEditPromo(id) {
  const p = allPromos.find(x => x.id === id);
  if (!p) return;
  editPromoId = id;
  document.getElementById('edit-promo-code-label').textContent = p.code;
  document.getElementById('ep-desc').value          = p.description || '';
  document.getElementById('ep-mb').value            = p.maxFileSizeMB || '';
  document.getElementById('ep-limit').value         = p.usageLimit ?? 0;
  document.getElementById('ep-expires').value       = p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0,16) : '';
  document.getElementById('ep-room').value          = p.customRoomId || '';
  document.getElementById('ep-can-custom').checked  = !!p.canCustomRoom;
  document.getElementById('ep-grant-role').value    = p.grantRole || '';
  document.getElementById('ep-role-days').value     = p.roleDurationDays || '';
  document.getElementById('edit-promo-overlay').style.display = 'flex';
}

function closeEditPromo() {
  document.getElementById('edit-promo-overlay').style.display = 'none';
  editPromoId = null;
}

async function saveEditPromo() {
  if (!editPromoId) return;
  const body = {
    description:     document.getElementById('ep-desc').value.trim(),
    maxFileSizeMB:   parseInt(document.getElementById('ep-mb').value) || undefined,
    usageLimit:      parseInt(document.getElementById('ep-limit').value) || 0,
    expiresAt:       document.getElementById('ep-expires').value || null,
    customRoomId:    document.getElementById('ep-room').value.trim().toUpperCase() || null,
    canCustomRoom:   document.getElementById('ep-can-custom').checked,
    grantRole:       document.getElementById('ep-grant-role').value || null,
    roleDurationDays: parseInt(document.getElementById('ep-role-days').value) || null,
  };
  try {
    await api('PUT', `/admin/api/promos/${editPromoId}`, body);
    toast('Promo code updated', 'success');
    closeEditPromo();
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('edit-promo-overlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('edit-promo-overlay')) closeEditPromo();
});

// ===== Global Broadcast =====
document.getElementById('send-broadcast-btn')?.addEventListener('click', async () => {
  const msg = document.getElementById('broadcast-text')?.value.trim();
  const statusEl = document.getElementById('broadcast-status');
  if (!msg) { if (statusEl) { statusEl.textContent = '請輸入訊息'; statusEl.style.color = 'var(--danger)'; } return; }
  const btn = document.getElementById('send-broadcast-btn');
  btn.disabled = true;
  try {
    await api('POST', '/admin/api/broadcast', { message: msg });
    document.getElementById('broadcast-text').value = '';
    if (statusEl) { statusEl.textContent = `✓ 廣播已發送 — ${new Date().toLocaleTimeString()}`; statusEl.style.color = 'var(--success, #10b981)'; }
    toast('廣播已發送', 'success');
  } catch (e) {
    if (statusEl) { statusEl.textContent = e.message; statusEl.style.color = 'var(--danger)'; }
    toast(e.message, 'error');
  } finally { btn.disabled = false; }
});
document.getElementById('broadcast-text')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) document.getElementById('send-broadcast-btn')?.click();
});

// ===== Profile Modal =====
document.getElementById('open-profile-btn')?.addEventListener('click', openProfileModal);

function openProfileModal() {
  const name = currentAdmin?.name || '';
  document.getElementById('profile-name').value = name;
  document.getElementById('profile-password').value = '';
  document.getElementById('profile-error').textContent = '';
  document.getElementById('profile-modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('profile-name')?.focus(), 50);
}

function closeProfileModal() {
  document.getElementById('profile-modal-overlay').style.display = 'none';
}

async function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  const password = document.getElementById('profile-password').value;
  const errEl = document.getElementById('profile-error');
  const btn = document.getElementById('profile-save-btn');
  errEl.textContent = '';
  if (!name && !password) { errEl.textContent = '請輸入名稱或新密碼'; return; }
  btn.disabled = true;
  try {
    const res = await api('PUT', '/admin/api/admins/me', { name: name || undefined, password: password || undefined });
    if (currentAdmin) {
      currentAdmin.name = name || currentAdmin.name;
      const dispEl = document.getElementById('user-display-name');
      if (dispEl) dispEl.textContent = currentAdmin.name || currentAdmin.email.split('@')[0];
      const initEl = document.getElementById('user-initial');
      if (initEl) initEl.textContent = (currentAdmin.name || currentAdmin.email)[0].toUpperCase();
    }
    closeProfileModal();
    toast('個人資料已更新', 'success');
  } catch (e) { errEl.textContent = e.message; }
  finally { btn.disabled = false; }
}

document.getElementById('profile-modal-overlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('profile-modal-overlay')) closeProfileModal();
});

// ===== Utils =====
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}
