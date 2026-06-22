const { io } = require('socket.io-client');
const BASE_URL = 'http://localhost:3000';
const ROOM = 'QDBG' + Date.now().toString(36).slice(-4).toUpperCase();
const delay = ms => new Promise(r => setTimeout(r, ms));
const waitFor = (s, ev, ms=5000) => new Promise((res,rej) => {
  const t = setTimeout(()=>rej(new Error(`timeout '${ev}'`)),ms);
  s.once(ev, (...a) => { clearTimeout(t); res(a); });
});

(async () => {
  const host = io(BASE_URL, { transports: ['websocket'] });
  const j1   = io(BASE_URL, { transports: ['websocket'] });
  const j2   = io(BASE_URL, { transports: ['websocket'] });

  // Log EVERYTHING from j2
  j2.onAny((ev, ...a) => console.log('  [j2 event]', ev, JSON.stringify(a).slice(0,150)));

  await delay(600);
  console.log(`Room: ${ROOM}`);

  // Host joins
  host.emit('join-room', { roomId: ROOM, name: 'Host' });
  await waitFor(host, 'room-joined');
  console.log('Host joined');

  // J1 joins → pending
  j1.emit('join-room', { roomId: ROOM, name: 'J1' });
  const [[_p1],[req1]] = await Promise.all([waitFor(j1,'join-pending'), waitFor(host,'join-request')]);
  console.log('J1 pending, req1.id=', req1.requestId);

  // J2 joins → pending
  j2.emit('join-room', { roomId: ROOM, name: 'J2' });
  const [[_p2],[req2]] = await Promise.all([waitFor(j2,'join-pending'), waitFor(host,'join-request')]);
  console.log('J2 pending, req2.id=', req2.requestId);

  // Approve J1
  console.log('Approving J1...');
  host.emit('approve-join', { requestId: req1.requestId });
  const [j1joined] = await waitFor(j1, 'room-joined');
  console.log('J1 joined, peers:', j1joined.peers.map(p=>p.name));

  // Approve J2
  console.log('Approving J2... (req2.requestId=', req2.requestId, ')');
  host.emit('approve-join', { requestId: req2.requestId });

  // Wait to see what j2 receives
  await delay(4000);
  console.log('Done waiting for j2');

  host.disconnect(); j1.disconnect(); j2.disconnect();
  process.exit(0);
})();
