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
  document.getElementById('user-initial').textContent    = admin.email[0].toUpperCase();
  connectAdminSocket();
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
      showDashboard({ email: payload.email, role: payload.role, id: payload.id });
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

  adminSocket.on('stats',    renderStats);
  adminSocket.on('rooms',    renderRooms);
  adminSocket.on('users',    renderUsers);
  adminSocket.on('admins',   renderAdmins);
  adminSocket.on('settings', renderSettings);
  adminSocket.on('promos',   renderPromos);
}

// ===== Navigation =====
const sections = { overview: 'Overview', rooms: 'Live Rooms', users: 'Users', admins: 'Admins', promos: 'Promo Codes', settings: 'Settings' };

document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', () => switchSection(item.dataset.section));
});

function switchSection(id) {
  document.querySelectorAll('.nav-item[data-section]').forEach(i => i.classList.toggle('active', i.dataset.section === id));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === `section-${id}`));
  document.getElementById('section-title').textContent = sections[id] || id;
  document.getElementById('sidebar').classList.remove('open');
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

function renderStats(data) {
  document.getElementById('s-uptime').textContent    = fmtUptime(data.uptime);
  document.getElementById('s-conns-val').textContent = data.currentConns;
  document.getElementById('s-peak').textContent      = data.peakConnections;
  document.getElementById('s-rooms').textContent     = data.activeRooms;
  document.getElementById('s-msgs').textContent      = data.messagesRelayed.toLocaleString();
  document.getElementById('s-files').textContent     = data.filesRelayed.toLocaleString();
  document.getElementById('s-bytes').textContent     = fmtBytes(data.bytesRelayed);
  document.getElementById('rooms-badge').textContent = data.activeRooms;
  renderChart(data.history || []);
}

function renderChart(history) {
  const el = document.getElementById('activity-chart');
  if (!history.length) { el.innerHTML = '<div class="chart-empty">Collecting data...</div>'; return; }
  const max = Math.max(...history.map(h => h.c), 1);
  el.innerHTML = history.map(h => {
    const pct = Math.max(4, Math.round((h.c / max) * 100));
    const time = new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="chart-bar" style="height:${pct}%" data-tip="${h.c} users @ ${time}"></div>`;
  }).join('');
}

// ===== Rooms =====
let allRooms = [];
let roomsQuery = '';

function renderRooms(rooms) {
  allRooms = rooms;
  document.getElementById('room-count-pill').textContent = `${rooms.length} room${rooms.length !== 1 ? 's' : ''}`;
  renderRoomsTable();
}

function renderRoomsTable() {
  const tbody = document.getElementById('rooms-tbody');
  const q = roomsQuery.toLowerCase();
  const list = q
    ? allRooms.filter(r =>
        r.roomId.toLowerCase().includes(q) ||
        r.peers.some(p => p.toLowerCase().includes(q)))
    : allRooms;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">${q ? 'No rooms match your search' : 'No active rooms'}</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(r => `
    <tr>
      <td><code>${r.roomId}</code></td>
      <td><strong>${r.peerCount}</strong></td>
      <td><div class="peer-chips">${r.peers.map(p => `<span class="peer-chip">${esc(p)}</span>`).join('')}</div></td>
      <td>${r.createdAt ? timeAgo(r.createdAt) : '—'}</td>
      <td><button class="btn-danger" onclick="closeRoom('${r.roomId}')">Close</button></td>
    </tr>`).join('');
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
  document.getElementById('set-maxpeers').value      = s.maxPeersPerRoom;
  document.getElementById('set-maxfile').value       = s.maxFileSizeMB;
  document.getElementById('set-msgrelay').checked    = s.allowMessageRelay;
  document.getElementById('set-filerelay').checked   = s.allowFileRelay;
  document.getElementById('set-maintenance').checked = s.maintenanceMode;
}

document.getElementById('save-settings').addEventListener('click', async () => {
  const body = {
    maxPeersPerRoom:    parseInt(document.getElementById('set-maxpeers').value) || 10,
    maxFileSizeMB:      parseInt(document.getElementById('set-maxfile').value) || 500,
    allowMessageRelay:  document.getElementById('set-msgrelay').checked,
    allowFileRelay:     document.getElementById('set-filerelay').checked,
    maintenanceMode:    document.getElementById('set-maintenance').checked
  };
  try {
    await api('PUT', '/admin/api/settings', body);
    toast('Settings saved', 'success');
  } catch (e) { toast(e.message, 'error'); }
});

// ===== Users =====
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
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">${msg}</td></tr>`;
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
    return `
      <tr class="${u.banned ? 'user-banned-row' : ''}">
        <td>
          <div style="font-weight:600;font-size:.85rem">${esc(u.name || u.email)}</div>
          <div style="color:var(--muted);font-size:.75rem">${esc(u.email)}</div>
        </td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td>${effLabel}${customInfo}</td>
        <td>${promoLabel}</td>
        <td>${statusBadge}</td>
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
function renderPromos(promos) {
  const tbody = document.getElementById('promos-tbody');
  if (!promos.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No promo codes yet</td></tr>';
    return;
  }
  tbody.innerHTML = promos.map(p => {
    const mbLabel = p.maxFileSizeMB >= 1024 ? `${(p.maxFileSizeMB/1024).toFixed(1)} GB` : `${p.maxFileSizeMB} MB`;
    const usageLabel = p.usageLimit > 0 ? `${p.usedCount} / ${p.usageLimit}` : `${p.usedCount} / ∞`;
    const expires = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : '—';
    const expired = p.expiresAt && new Date(p.expiresAt) < new Date();
    return `
    <tr>
      <td><code style="font-weight:700;letter-spacing:1px">${esc(p.code)}</code></td>
      <td style="color:var(--muted)">${esc(p.description || '—')}</td>
      <td><strong style="color:var(--primary)">${mbLabel}</strong></td>
      <td>${usageLabel}</td>
      <td style="${expired ? 'color:var(--danger)' : ''}">${expires}${expired ? ' ⚠' : ''}</td>
      <td>
        <label class="toggle" title="${p.enabled ? 'Enabled' : 'Disabled'}">
          <input type="checkbox" ${p.enabled ? 'checked' : ''} onchange="togglePromo('${p.id}', this.checked)">
          <span class="slider"></span>
        </label>
      </td>
      <td><button class="btn-danger" onclick="deletePromo('${p.id}','${esc(p.code)}')">Delete</button></td>
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
  if (!code || !maxFileSizeMB) { toast('Code and file limit required', 'error'); return; }
  try {
    await api('POST', '/admin/api/promos', { code, description, maxFileSizeMB, usageLimit, expiresAt });
    toast('Promo code created', 'success');
    document.getElementById('new-promo-code').value = '';
    document.getElementById('new-promo-desc').value = '';
    document.getElementById('new-promo-mb').value = '';
    document.getElementById('new-promo-limit').value = '';
    document.getElementById('new-promo-expires').value = '';
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
