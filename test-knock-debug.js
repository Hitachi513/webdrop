const { io } = require('socket.io-client');
const URL  = 'http://localhost:3000';
const ROOM = 'DEBUGROOM' + Date.now().toString(36).toUpperCase().slice(-4);

function connect() {
  const s = io(URL, { transports: ['websocket'] });
  ['connect','disconnect','connect_error','room-joined','join-pending','join-rejected','join-request','error','room-reserved','room-banned'].forEach(ev => {
    s.onAny((event, ...args) => {
      console.log(`  [${s.id?.slice(-4) || '????'}] ${event}`, JSON.stringify(args).slice(0, 120));
    });
  });
  return s;
}

(async () => {
  const host   = connect();
  const joiner = connect();

  await new Promise(r => setTimeout(r, 1000));
  console.log(`\nRoom: ${ROOM}\nHost:   ${host.id}\nJoiner: ${joiner.id}\n`);

  console.log('--- host joins ---');
  host.emit('join-room', { roomId: ROOM, name: 'Host' });
  await new Promise(r => setTimeout(r, 1000));

  console.log('--- joiner joins ---');
  joiner.emit('join-room', { roomId: ROOM, name: 'Joiner' });
  await new Promise(r => setTimeout(r, 3000));

  host.disconnect();
  joiner.disconnect();
  process.exit(0);
})();
