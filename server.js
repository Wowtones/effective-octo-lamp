const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync('index.html'));
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // roomName -> { board: Uint8Array, clients: Set }

function getRoom(name) {
  if (!rooms.has(name)) {
    rooms.set(name, { board: new Uint8Array(128 * 128), clients: new Set() });
  }
  return rooms.get(name);
}

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);

    if (msg.type === 'join') {
      currentRoom = getRoom(msg.room);
      currentRoom.clients.add(ws);

      // Send initial canvas and user count
      ws.send(JSON.stringify({
        type: 'init',
        board: Array.from(currentRoom.board),
        users: currentRoom.clients.size
      }));

      // Notify others in room of new count
      broadcast(currentRoom, { type: 'users', count: currentRoom.clients.size });
    }

    if (msg.type === 'draw' && currentRoom) {
      // Save pixels in memory
      msg.pixels.forEach(p => {
        currentRoom.board[p.y * 128 + p.x] = p.c;
      });
      // Broadcast to all other users in this room
      for (const client of currentRoom.clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(raw);
        }
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      currentRoom.clients.delete(ws);
      broadcast(currentRoom, { type: 'users', count: currentRoom.clients.size });
    }
  });
});

function broadcast(room, data) {
  const json = JSON.stringify(data);
  for (const client of room.clients) {
    if (client.readyState === 1) client.send(json);
  }
}

server.listen(8080, () => {
  console.log('Online at http://localhost:8080');
});
