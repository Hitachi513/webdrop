require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const QRCode   = require('qrcode');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// ===== Storage (Upstash Redis or local files) =====
const DATA_DIR      = path.join(__dirname, 'data');
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_UPSTASH   = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function dbGet(key) {
  if (!USE_UPSTASH) {
    const file = path.join(DATA_DIR, `${key}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }
  try {
    const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const json = await r.json();
    return json.result != null ? JSON.parse(json.result) : null;
  } catch (e) { console.error('dbGet error:', e.message); return null; }
}

function dbSet(key, value) {
  if (!USE_UPSTASH) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, `${key}.json`), JSON.stringify(value, null, 2));
    return;
  }
  fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value))
  }).catch(e => console.error('dbSet error:', e.message));
}

// ===== Runtime state (loaded during init) =====
let JWT_SECRET;
let admins   = [];
let settings = {};
let users    = [];
let promos   = [];

const defaultSettings = {
  maxPeersPerRoom: 10,
  maxFileSizeMB: 500, vipFileSizeMB: 2048, businessFileSizeMB: 5120, adminFileSizeMB: 999999,
  defaultCanCustomRoom: false, vipCanCustomRoom: true, businessCanCustomRoom: true, adminCanCustomRoom: true,
  allowFileRelay: true, allowMessageRelay: true, maintenanceMode: false
};

function saveAdmins()   { dbSet('admins',   admins);   }
function saveSettings() { dbSet('settings', settings); }
function saveUsers()    { dbSet('users',    users);    }
function savePromos()   { dbSet('promos',   promos);   }

// ===== Stats =====
const stats = {
  startTime:        Date.now(),
  totalConnections: 0,
  peakConnections:  0,
  messagesRelayed:  0,
  filesRelayed:     0,
  bytesRelayed:     0
};
const activityHistory = [];
setInterval(() => {
  const entry = { t: Date.now(), c: io.engine.clientsCount, r: rooms.size };
  activityHistory.push(entry);
  if (activityHistory.length > 30) activityHistory.shift();
}, 60000);

function getStats() {
  const cur = io.engine.clientsCount;
  if (cur > stats.peakConnections) stats.peakConnections = cur;
  return {
    uptime:           Math.floor((Date.now() - stats.startTime) / 1000),
    currentConns:     cur,
    peakConnections:  stats.peakConnections,
    activeRooms:      rooms.size,
    totalConnections: stats.totalConnections,
    messagesRelayed:  stats.messagesRelayed,
    filesRelayed:     stats.filesRelayed,
    bytesRelayed:     stats.bytesRelayed,
    history:          activityHistory
  };
}

function getRoomList() {
  return Array.from(rooms.entries()).map(([roomId, peers]) => ({
    roomId,
    peerCount: peers.size,
    peers: Array.from(peers.values()).map(p => p.name),
    createdAt: roomsMeta.get(roomId)?.createdAt || null
  }));
}

function getUserEffectiveLimit(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return settings.maxFileSizeMB;
  if (user.role === 'admin') return settings.adminFileSizeMB || 999999;
  if (user.customFileSizeMB != null) return user.customFileSizeMB;
  if (user.role === 'business') return settings.businessFileSizeMB || settings.maxFileSizeMB;
  if (user.role === 'vip') return settings.vipFileSizeMB || settings.maxFileSizeMB;
  if (!user.activePromoId) return settings.maxFileSizeMB;
  const promo = promos.find(p => p.id === user.activePromoId && p.enabled);
  if (!promo) return settings.maxFileSizeMB;
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return settings.maxFileSizeMB;
  return promo.maxFileSizeMB;
}

const ROOM_ID_RE = /^[A-Z0-9]{3,20}$/;

function getUserList() {
  return users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt,
    activePromoId: u.activePromoId || null,
    customFileSizeMB: u.customFileSizeMB ?? null,
    effectiveMaxFileSizeMB: getUserEffectiveLimit(u.id),
    banned: !!u.banned,
    banReason: u.banReason || null,
    bannedAt: u.bannedAt || null,
    language: u.language || null,
    customRoomId: u.customRoomId || null,
    canCustomRoom: !!u.canCustomRoom,
    role: u.role || null
  }));
}

// ===== Auth Middleware =====
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.adminUser = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}
function requireSuperAdmin(req, res, next) {
  if (req.adminUser.role !== 'super-admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}
function requireUser(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    if (payload.type !== 'user') return res.status(401).json({ error: 'Invalid token' });
    req.user = payload;
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

// ===== Express Middleware =====
app.use(express.json());

app.use((req, res, next) => {
  if (settings.maintenanceMode
    && !req.path.startsWith('/admin')
    && !req.path.startsWith('/socket.io')
    && !req.path.startsWith('/api/')) {
    return res.status(503).send('<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:80px"><h1>🔧 Under Maintenance</h1><p>WebDrop is temporarily unavailable. Please try again soon.</p></body></html>');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

// ===== QR endpoint =====
app.get('/qr', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).send('URL required');
    const buf = await QRCode.toBuffer(url, { width: 256, margin: 2, color: { dark: '#000', light: '#fff' } });
    res.type('png').send(buf);
  } catch { res.status(500).send('QR generation failed'); }
});

// ===== Config endpoint =====
app.get('/api/config', (req, res) => {
  res.json({ googleAuth: !!GOOGLE_CLIENT_ID, googleClientId: GOOGLE_CLIENT_ID || null });
});

// ===== User Auth API =====
app.post('/api/auth/google', async (req, res) => {
  if (!googleClient) return res.status(501).json({ error: 'Google auth not configured' });
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'ID token required' });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    let user = users.find(u => u.googleId === p.sub || u.email?.toLowerCase() === p.email.toLowerCase());
    if (!user) {
      user = { id: crypto.randomUUID(), email: p.email, name: p.name || p.email.split('@')[0], googleId: p.sub, passwordHash: null, activePromoId: null, customFileSizeMB: null, banned: false, banReason: null, bannedAt: null, language: null, customRoomId: null, canCustomRoom: false, role: null, createdAt: new Date().toISOString() };
      users.push(user);
      saveUsers();
      adminNsp.emit('users', getUserList());
    } else if (!user.googleId) {
      user.googleId = p.sub;
      saveUsers();
    }
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, type: 'user' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, activePromoId: user.activePromoId, effectiveMaxFileSizeMB: getUserEffectiveLimit(user.id), customRoomId: user.customRoomId || null, canCustomRoom: !!user.canCustomRoom, role: user.role || null } });
  } catch (e) { console.error('Google auth error:', e.message); res.status(401).json({ error: 'Invalid Google token' }); }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (users.find(u => u.email?.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: 'Email already registered' });
    const user = {
      id: crypto.randomUUID(),
      email,
      name: name || email.split('@')[0],
      googleId: null,
      passwordHash: await bcrypt.hash(password, 10),
      activePromoId: null,
      customFileSizeMB: null,
      banned: false,
      banReason: null,
      bannedAt: null,
      language: null,
      customRoomId: null,
      canCustomRoom: false,
      role: null,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    saveUsers();
    adminNsp.emit('users', getUserList());
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, type: 'user' }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, activePromoId: null, effectiveMaxFileSizeMB: settings.maxFileSizeMB, customRoomId: null, canCustomRoom: false, role: null } });
  } catch (e) { console.error('Register error:', e.message); res.status(500).json({ error: 'Registration failed' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.banned) return res.status(403).json({ error: `Account suspended: ${user.banReason || 'Contact support'}` });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, type: 'user' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, activePromoId: user.activePromoId, effectiveMaxFileSizeMB: getUserEffectiveLimit(user.id), customRoomId: user.customRoomId || null, canCustomRoom: !!user.canCustomRoom, role: user.role || null } });
  } catch (e) { console.error('Login error:', e.message); res.status(500).json({ error: 'Login failed' }); }
});

app.get('/api/auth/me', requireUser, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, email: user.email, name: user.name, activePromoId: user.activePromoId, effectiveMaxFileSizeMB: getUserEffectiveLimit(user.id), language: user.language || null, customRoomId: user.customRoomId || null, canCustomRoom: !!user.canCustomRoom, role: user.role || null });
});

app.put('/api/auth/profile', requireUser, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (req.body.language !== undefined) user.language = req.body.language || null;
  saveUsers();
  adminNsp.emit('users', getUserList());
  res.json({ ok: true });
});

app.post('/api/auth/redeem', requireUser, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Promo code required' });
  const promo = promos.find(p => p.code.toUpperCase() === code.trim().toUpperCase() && p.enabled);
  if (!promo) return res.status(404).json({ error: 'Invalid or disabled promo code' });
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return res.status(400).json({ error: 'Promo code has expired' });
  if (promo.usageLimit > 0 && promo.usedCount >= promo.usageLimit) return res.status(400).json({ error: 'Promo code usage limit reached' });
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.activePromoId = promo.id;
  if (promo.customRoomId) user.customRoomId = promo.customRoomId;
  if (promo.canCustomRoom) user.canCustomRoom = true;
  promo.usedCount++;
  saveUsers();
  savePromos();
  adminNsp.emit('promos', promos);
  adminNsp.emit('users', getUserList());
  res.json({ ok: true, promo: { code: promo.code, description: promo.description, maxFileSizeMB: promo.maxFileSizeMB, customRoomId: promo.customRoomId || null, canCustomRoom: !!promo.canCustomRoom }, effectiveMaxFileSizeMB: getUserEffectiveLimit(user.id), customRoomId: user.customRoomId || null, canCustomRoom: !!user.canCustomRoom });
});

app.put('/api/auth/room', requireUser, (req, res) => {
  try {
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.canCustomRoom) return res.status(403).json({ error: 'No permission to set custom room ID' });
    const { roomId } = req.body || {};
    if (!roomId) return res.status(400).json({ error: 'Room ID is required' });
    const id = roomId.toUpperCase().trim();
    if (!ROOM_ID_RE.test(id)) return res.status(400).json({ error: 'Room ID must be 3–20 uppercase letters/numbers' });
    if (users.some(u => u.id !== user.id && u.customRoomId === id)) return res.status(409).json({ error: 'Room ID already taken' });
    user.customRoomId = id;
    saveUsers();
    adminNsp.emit('users', getUserList());
    res.json({ ok: true, customRoomId: id });
  } catch (e) { console.error('PUT /api/auth/room error:', e); res.status(500).json({ error: 'Internal server error' }); }
});

// ===== Admin API =====
app.post('/admin/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const admin = admins.find(a => a.email.toLowerCase() === email.toLowerCase());
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, admin: { id: admin.id, email: admin.email, role: admin.role } });
  } catch (e) { console.error('Admin login error:', e.message); res.status(500).json({ error: 'Login failed' }); }
});

app.get('/admin/api/stats',    requireAdmin, (req, res) => res.json(getStats()));
app.get('/admin/api/rooms',    requireAdmin, (req, res) => res.json(getRoomList()));
app.get('/admin/api/admins',   requireAdmin, (req, res) => res.json(admins.map(({ passwordHash, ...a }) => a)));
app.get('/admin/api/settings', requireAdmin, (req, res) => res.json(settings));
app.get('/admin/api/promos',   requireAdmin, (req, res) => res.json(promos));
app.get('/admin/api/users',    requireAdmin, (req, res) => res.json(getUserList()));

app.put('/admin/api/users/:id', requireAdmin, (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { customFileSizeMB, banned, banReason, customRoomId, role } = req.body || {};
  if (customFileSizeMB !== undefined) {
    user.customFileSizeMB = customFileSizeMB === null ? null : parseInt(customFileSizeMB);
  }
  if (banned !== undefined) {
    user.banned = !!banned;
    if (banned) {
      user.banReason = banReason || null;
      user.bannedAt  = new Date().toISOString();
      io.sockets.sockets.forEach(s => {
        if (s.userId === user.id) {
          s.emit('account-banned', { reason: user.banReason });
          s.disconnect(true);
        }
      });
    } else {
      user.banReason = null;
      user.bannedAt  = null;
    }
  }
  if (customRoomId !== undefined) {
    if (customRoomId === null || customRoomId === '') {
      user.customRoomId = null;
    } else {
      const id = customRoomId.toUpperCase().trim();
      if (!ROOM_ID_RE.test(id)) return res.status(400).json({ error: 'Room ID must be 3–20 uppercase letters/numbers' });
      if (users.some(u => u.id !== req.params.id && u.customRoomId === id)) return res.status(409).json({ error: 'Room ID already assigned to another user' });
      user.customRoomId = id;
      // Notify the user's active socket(s) to switch rooms in real-time
      io.sockets.sockets.forEach(s => {
        if (s.userId === user.id) s.emit('admin-switch-room', { roomId: id });
      });
    }
  }
  if (role !== undefined) {
    const allowed = [null, '', 'admin', 'vip', 'business'];
    const normalized = role || null;
    if (!allowed.includes(normalized)) return res.status(400).json({ error: 'Invalid role' });
    user.role = normalized;
    const canRoomKey = normalized ? `${normalized}CanCustomRoom` : 'defaultCanCustomRoom';
    user.canCustomRoom = !!(settings[canRoomKey] ?? (normalized !== null));
    const newLimit = getUserEffectiveLimit(user.id);
    io.sockets.sockets.forEach(s => {
      if (s.userId === user.id) {
        s.userRole = normalized;
        s.effectiveMaxFileSizeMB = newLimit;
        s.emit('role-updated', { role: normalized, effectiveMaxFileSizeMB: newLimit, canCustomRoom: !!user.canCustomRoom });
      }
    });
  }
  saveUsers();
  adminNsp.emit('users', getUserList());
  res.json({ ok: true });
});

app.put('/admin/api/settings', requireAdmin, requireSuperAdmin, (req, res) => {
  settings = { ...settings, ...req.body };
  saveSettings();
  io.emit('settings-updated', { maintenanceMode: settings.maintenanceMode });
  adminNsp.emit('settings', settings);
  if (settings.maintenanceMode) {
    io.sockets.sockets.forEach(s => s.disconnect(true));
  }
  res.json(settings);
});

app.post('/admin/api/admins', requireAdmin, requireSuperAdmin, async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (admins.find(a => a.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: 'Admin already exists' });
  const newAdmin = { id: Date.now().toString(), email, passwordHash: await bcrypt.hash(password, 10), role: role === 'super-admin' ? 'super-admin' : 'admin', createdAt: new Date().toISOString() };
  admins.push(newAdmin);
  saveAdmins();
  const { passwordHash, ...safe } = newAdmin;
  adminNsp.emit('admins', admins.map(({ passwordHash: h, ...a }) => a));
  res.status(201).json(safe);
});

app.delete('/admin/api/admins/:id', requireAdmin, requireSuperAdmin, (req, res) => {
  const { id } = req.params;
  if (id === req.adminUser.id) return res.status(400).json({ error: 'Cannot remove yourself' });
  const idx = admins.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Admin not found' });
  const superAdmins = admins.filter(a => a.role === 'super-admin');
  if (superAdmins.length === 1 && admins[idx].role === 'super-admin') return res.status(400).json({ error: 'Cannot remove the last super-admin' });
  admins.splice(idx, 1);
  saveAdmins();
  adminNsp.emit('admins', admins.map(({ passwordHash, ...a }) => a));
  res.json({ ok: true });
});

app.delete('/admin/api/rooms/:roomId', requireAdmin, (req, res) => {
  const { roomId } = req.params;
  if (!rooms.has(roomId)) return res.status(404).json({ error: 'Room not found' });
  io.in(roomId).emit('room-closed', { reason: 'Closed by admin' });
  io.in(roomId).disconnectSockets(true);
  rooms.delete(roomId);
  roomsMeta.delete(roomId);
  adminNsp.emit('rooms', getRoomList());
  res.json({ ok: true });
});

// Admin Promo CRUD
app.post('/admin/api/promos', requireAdmin, requireSuperAdmin, (req, res) => {
  const { code, description, maxFileSizeMB, usageLimit, expiresAt, customRoomId, canCustomRoom } = req.body || {};
  if (!code || !maxFileSizeMB) return res.status(400).json({ error: 'Code and maxFileSizeMB required' });
  if (promos.find(p => p.code.toUpperCase() === code.trim().toUpperCase())) return res.status(409).json({ error: 'Promo code already exists' });
  const rid = customRoomId ? customRoomId.toUpperCase().trim() : null;
  if (rid && !ROOM_ID_RE.test(rid)) return res.status(400).json({ error: 'Room ID must be 3–20 uppercase letters/numbers' });
  const promo = { id: crypto.randomUUID(), code: code.trim().toUpperCase(), description: description || '', maxFileSizeMB: parseInt(maxFileSizeMB), usageLimit: parseInt(usageLimit) || 0, usedCount: 0, expiresAt: expiresAt || null, customRoomId: rid || null, canCustomRoom: !!canCustomRoom, enabled: true, createdAt: new Date().toISOString() };
  promos.push(promo);
  savePromos();
  adminNsp.emit('promos', promos);
  res.status(201).json(promo);
});

app.put('/admin/api/promos/:id', requireAdmin, requireSuperAdmin, (req, res) => {
  const promo = promos.find(p => p.id === req.params.id);
  if (!promo) return res.status(404).json({ error: 'Promo not found' });
  const { description, maxFileSizeMB, usageLimit, expiresAt, enabled, customRoomId, canCustomRoom } = req.body || {};
  if (description !== undefined) promo.description = description;
  if (maxFileSizeMB !== undefined) promo.maxFileSizeMB = parseInt(maxFileSizeMB);
  if (usageLimit !== undefined) promo.usageLimit = parseInt(usageLimit);
  if (expiresAt !== undefined) promo.expiresAt = expiresAt || null;
  if (enabled !== undefined) promo.enabled = !!enabled;
  if (canCustomRoom !== undefined) promo.canCustomRoom = !!canCustomRoom;
  if (customRoomId !== undefined) {
    const rid = customRoomId ? customRoomId.toUpperCase().trim() : null;
    if (rid && !ROOM_ID_RE.test(rid)) return res.status(400).json({ error: 'Room ID must be 3–20 uppercase letters/numbers' });
    promo.customRoomId = rid || null;
  }
  savePromos();
  adminNsp.emit('promos', promos);
  res.json(promo);
});

app.delete('/admin/api/promos/:id', requireAdmin, requireSuperAdmin, (req, res) => {
  const idx = promos.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Promo not found' });
  promos.splice(idx, 1);
  savePromos();
  adminNsp.emit('promos', promos);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

// ===== Global error handler (prevents unhandled errors from crashing the server) =====
app.use((err, req, res, next) => {
  console.error('Unhandled route error:', err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

// ===== Admin Socket Namespace =====
const adminNsp = io.of('/admin');
adminNsp.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try { socket.adminUser = jwt.verify(token, JWT_SECRET); next(); }
  catch { next(new Error('Invalid token')); }
});
adminNsp.on('connection', (socket) => {
  try {
    socket.emit('stats',    getStats());
    socket.emit('rooms',    getRoomList());
    socket.emit('admins',   admins.map(({ passwordHash, ...a }) => a));
    socket.emit('settings', settings);
    socket.emit('promos',   promos);
    socket.emit('users',    getUserList());
  } catch (e) { console.error('Admin socket init error:', e.message); }

  const tick = setInterval(() => {
    try {
      socket.emit('stats', getStats());
      socket.emit('rooms', getRoomList());
    } catch (e) { console.error('Admin tick error:', e.message); }
  }, 2000);

  socket.on('disconnect', () => clearInterval(tick));
});

// ===== Main Socket.io =====
const rooms     = new Map();
const roomsMeta = new Map();
let publicUrl   = null;
let tunnelProc  = null;

io.use((socket, next) => {
  if (settings.maintenanceMode) return next(new Error('Under maintenance'));
  socket.effectiveMaxFileSizeMB = settings.maxFileSizeMB;
  const userToken = socket.handshake.auth?.userToken;
  if (userToken) {
    try {
      const payload = jwt.verify(userToken, JWT_SECRET);
      if (payload.type === 'user') {
        const user = users.find(u => u.id === payload.id);
        if (user?.banned) return next(new Error('Your account has been suspended'));
        socket.userId = payload.id;
        socket.userRole = user?.role || null;
        socket.effectiveMaxFileSizeMB = getUserEffectiveLimit(payload.id);
      }
    } catch {}
  }
  next();
});

io.on('connection', (socket) => {
  stats.totalConnections++;
  if (io.engine.clientsCount > stats.peakConnections) stats.peakConnections = io.engine.clientsCount;
  socket.currentRoom = null;
  if (publicUrl) socket.emit('tunnel-url', publicUrl);

  socket.on('join-room', ({ roomId, name }) => {
    if (socket.currentRoom) {
      const room = rooms.get(socket.currentRoom);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) { rooms.delete(socket.currentRoom); roomsMeta.delete(socket.currentRoom); }
        else socket.to(socket.currentRoom).emit('peer-left', socket.id);
      }
      socket.leave(socket.currentRoom);
    }
    const existing = rooms.get(roomId);
    if (existing && existing.size >= settings.maxPeersPerRoom) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    if (!rooms.has(roomId)) { rooms.set(roomId, new Map()); roomsMeta.set(roomId, { createdAt: Date.now() }); }
    const room = rooms.get(roomId);
    const existingPeers = Array.from(room.entries()).map(([id, info]) => ({ id, name: info.name, role: info.role || null }));
    room.set(socket.id, { name, role: socket.userRole || null });
    socket.join(roomId);
    socket.currentRoom = roomId;
    socket.emit('room-joined', { roomId, peers: existingPeers });
    socket.to(roomId).emit('peer-joined', { id: socket.id, name, role: socket.userRole || null });
    adminNsp.emit('rooms', getRoomList());
  });

  socket.on('offer',         ({ to, offer })     => io.to(to).emit('offer',         { from: socket.id, offer }));
  socket.on('answer',        ({ to, answer })    => io.to(to).emit('answer',        { from: socket.id, answer }));
  socket.on('ice-candidate', ({ to, candidate }) => io.to(to).emit('ice-candidate', { from: socket.id, candidate }));

  socket.on('relay-msg', ({ to, text }) => {
    if (!settings.allowMessageRelay) { socket.emit('relay-error', { error: 'Message relay is disabled' }); return; }
    stats.messagesRelayed++;
    io.to(to).emit('relay-msg', { from: socket.id, text });
    adminNsp.emit('stats', getStats());
  });
  socket.on('relay-file-start', ({ to, meta }) => {
    if (!settings.allowFileRelay) { socket.emit('relay-error', { error: 'File relay is disabled' }); return; }
    const maxBytes = socket.effectiveMaxFileSizeMB * 1024 * 1024;
    if (meta.size > maxBytes) { socket.emit('relay-error', { error: `File exceeds ${socket.effectiveMaxFileSizeMB} MB limit` }); return; }
    io.to(to).emit('relay-file-start', { from: socket.id, meta });
  });
  socket.on('relay-file-chunk', ({ to, chunk }) => {
    const size = Buffer.isBuffer(chunk) ? chunk.length : (chunk?.byteLength || 0);
    stats.bytesRelayed += size;
    io.to(to).emit('relay-file-chunk', { from: socket.id, chunk });
  });
  socket.on('relay-file-end', ({ to, fileId, name }) => {
    stats.filesRelayed++;
    io.to(to).emit('relay-file-end', { from: socket.id, fileId, name });
    adminNsp.emit('stats', getStats());
  });

  socket.on('disconnect', () => {
    if (socket.currentRoom) {
      const room = rooms.get(socket.currentRoom);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) { rooms.delete(socket.currentRoom); roomsMeta.delete(socket.currentRoom); }
        else socket.to(socket.currentRoom).emit('peer-left', socket.id);
      }
      adminNsp.emit('rooms', getRoomList());
    }
  });
});

// ===== Tunnel =====
function startCloudflareTunnel(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], { stdio: ['ignore','pipe','pipe'] });
    tunnelProc = proc;
    let resolved = false;
    const check = d => {
      if (resolved) return;
      const m = d.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) { resolved = true; resolve(m[0]); }
    };
    proc.stdout.on('data', check);
    proc.stderr.on('data', check);
    proc.on('error', e => { if (!resolved) reject(e); });
    proc.on('exit', code => {
      if (!resolved) reject(new Error(`cloudflared exited ${code}`));
      else { publicUrl = null; io.emit('tunnel-url', null); setTimeout(() => startTunnel(port), 3000); }
    });
    setTimeout(() => { if (!resolved) reject(new Error('Timeout')); }, 30000);
  });
}
async function startTunnel(port) {
  if (process.env.PUBLIC_URL) {
    publicUrl = process.env.PUBLIC_URL.replace(/\/$/, '');
    console.log(`\nPublic URL (env): ${publicUrl}\n`);
    io.emit('tunnel-url', publicUrl);
    return;
  }
  // On cloud platforms, skip tunnel — clients use window.location.origin
  if (process.env.RENDER || process.env.NODE_ENV === 'production') {
    console.log('Cloud environment detected, skipping tunnel.');
    return;
  }
  try {
    publicUrl = await startCloudflareTunnel(port);
    console.log(`\nPublic URL: ${publicUrl}\n`);
    io.emit('tunnel-url', publicUrl);
    return;
  } catch (e) { console.warn('cloudflared:', e.message); }
  try {
    const lt = require('localtunnel');
    const tunnel = await lt({ port });
    publicUrl = tunnel.url;
    console.log(`\nPublic URL (lt): ${publicUrl}\n`);
    io.emit('tunnel-url', publicUrl);
    tunnel.on('close', () => { publicUrl = null; io.emit('tunnel-url', null); setTimeout(() => startTunnel(port), 5000); });
  } catch (e) { console.warn('All tunnels failed:', e.message); io.emit('tunnel-url', null); }
}

// ===== Init =====
async function init() {
  // JWT Secret
  const storedSecret = await dbGet('jwt_secret');
  if (storedSecret) {
    JWT_SECRET = storedSecret;
  } else {
    JWT_SECRET = crypto.randomBytes(48).toString('hex');
    dbSet('jwt_secret', JWT_SECRET);
  }

  // Admins
  const storedAdmins = await dbGet('admins');
  if (Array.isArray(storedAdmins) && storedAdmins.length) {
    admins = storedAdmins;
  } else {
    if (storedAdmins && !Array.isArray(storedAdmins)) console.error('admins from DB was not an array, resetting:', typeof storedAdmins);
    admins = [{
      id: '1',
      email: 'sh1154252@gmail.com',
      passwordHash: bcrypt.hashSync('Hh1040714.0714', 10),
      role: 'super-admin',
      createdAt: new Date().toISOString()
    }];
    saveAdmins();
    console.log('Created default admin account.');
  }

  // Settings
  const storedSettings = await dbGet('settings');
  settings = { ...defaultSettings, ...(Array.isArray(storedSettings) || typeof storedSettings !== 'object' ? {} : (storedSettings || {})) };
  settings.maintenanceMode = false;

  // Users & Promos
  const rawUsers = await dbGet('users');
  users  = Array.isArray(rawUsers) ? rawUsers : [];
  if (rawUsers && !Array.isArray(rawUsers)) console.error('users from DB was not an array, resetting:', typeof rawUsers);
  const rawPromos = await dbGet('promos');
  promos = Array.isArray(rawPromos) ? rawPromos : [];

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`WebDrop running at http://localhost:${PORT}`);
    console.log(`Admin panel   at http://localhost:${PORT}/admin`);
    startTunnel(PORT);
  });
}

init().catch(err => { console.error('Startup failed:', err); process.exit(1); });
process.on('exit',   () => { if (tunnelProc) tunnelProc.kill(); });
process.on('SIGINT', () => { if (tunnelProc) tunnelProc.kill(); process.exit(); });
