import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WORD_PAIRS } from './src/words.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files in production
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Game state in-memory database
// rooms[roomCode] = { code, hostId, state, config, players, wordPair }
// config: { undercovers, blanks }
// players: array of { id, socketId, name, role, word, isConnected }
const rooms = {};

// Helper to generate unique 4-character uppercase room codes
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ01233456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]);
  return code;
}

// Helper to shuffle an array
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Broadcast clean state to room participants
function broadcastRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.players.forEach((player) => {
    if (!player.socketId) return;

    // Sanitize players array for this specific player to prevent word/role leaks
    const sanitizedPlayers = room.players.map((p) => {
      const isSelf = p.id === player.id;
      const isRecipientHost = player.id === room.hostId;
      
      // Reveal role/word only if:
      // 1. It is the player themselves
      // 2. The recipient is the host
      const shouldReveal = isSelf || isRecipientHost;

      return {
        id: p.id,
        name: p.name,
        isConnected: p.isConnected,
        role: shouldReveal ? p.role : null,
        word: shouldReveal ? p.word : null
      };
    });

    const payload = {
      code: room.code,
      hostId: room.hostId,
      state: room.state,
      config: room.config,
      players: sanitizedPlayers
    };

    io.to(player.socketId).emit('room-update', payload);
  });
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. Create Room (Host)
  socket.on('create-room', ({ hostName, hostId }) => {
    const roomCode = generateRoomCode();
    
    rooms[roomCode] = {
      code: roomCode,
      hostId: hostId,
      state: 'lobby',
      config: {
        undercovers: 1,
        blanks: 0
      },
      players: [
        {
          id: hostId,
          socketId: socket.id,
          name: hostName || 'Host',
          role: 'host',
          word: null,
          isConnected: true
        }
      ],
      wordPair: null
    };

    socket.join(roomCode);
    console.log(`Room created: ${roomCode} by host: ${hostName} (${hostId})`);
    
    // Send success event
    socket.emit('room-created', { roomCode });
    broadcastRoomState(roomCode);
  });

  // 2. Join / Reconnect Room
  socket.on('join-room', ({ roomCode, name, playerId }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('error-msg', 'Room not found.');
      return;
    }

    // Check if player is already in the room (reconnection)
    let player = room.players.find(p => p.id === playerId);

    if (player) {
      // Reconnection
      player.socketId = socket.id;
      player.isConnected = true;
      if (name) player.name = name; // Update name if changed
      socket.join(roomCode);
      console.log(`Player reconnected: ${player.name} (${playerId}) in room ${roomCode}`);
    } else {
      // New join
      if (room.state !== 'lobby') {
        socket.emit('error-msg', 'Game has already started. Cannot join now.');
        return;
      }
      if (room.players.length >= 25) { // Host (1) + 24 players = 25
        socket.emit('error-msg', 'Room is full (max 24 players).');
        return;
      }

      player = {
        id: playerId,
        socketId: socket.id,
        name: name,
        role: null,
        word: null,
        isConnected: true
      };

      room.players.push(player);
      socket.join(roomCode);
      console.log(`Player joined: ${name} (${playerId}) in room ${roomCode}`);
    }

    // Acknowledge join
    socket.emit('join-success', { roomCode, playerId, isHost: room.hostId === playerId });
    broadcastRoomState(roomCode);
  });

  // 3. Update Configuration (Host only)
  socket.on('update-config', ({ roomCode, playerId, config }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== playerId) return;

    room.config = {
      ...room.config,
      ...config
    };

    broadcastRoomState(roomCode);
  });

  // 4. Start Game / Deal Words (Host only)
  socket.on('start-game', ({ roomCode, playerId }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== playerId) return;

    // Filter out the host for role assignment
    const activePlayers = room.players.filter(p => p.id !== room.hostId);
    
    if (activePlayers.length < 3) {
      socket.emit('error-msg', 'Need at least 3 players (excluding host) to start.');
      return;
    }

    const { undercovers, blanks } = room.config;
    const totalPlayers = activePlayers.length;

    if (undercovers + blanks >= totalPlayers) {
      socket.emit('error-msg', 'Too many Undercovers/Blanks for this player count.');
      return;
    }

    // Choose random word pair
    const wordPair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
    // Randomize which is civilian and which is undercover
    const isSwapped = Math.random() < 0.5;
    const civWord = isSwapped ? wordPair.undercover : wordPair.civilian;
    const spyWord = isSwapped ? wordPair.civilian : wordPair.undercover;

    room.wordPair = { civilian: civWord, undercover: spyWord };

    // Build role pool
    const roles = [];
    for (let i = 0; i < undercovers; i++) roles.push('undercover');
    for (let i = 0; i < blanks; i++) roles.push('blank');
    const civilianCount = totalPlayers - undercovers - blanks;
    for (let i = 0; i < civilianCount; i++) roles.push('civilian');

    // Shuffle roles
    const shuffledRoles = shuffleArray(roles);

    // Assign roles & words to active players
    activePlayers.forEach((p, idx) => {
      p.role = shuffledRoles[idx];

      if (p.role === 'civilian') {
        p.word = civWord;
      } else if (p.role === 'undercover') {
        p.word = spyWord;
      } else if (p.role === 'blank') {
        p.word = ''; // No word
      }
    });

    room.state = 'reveal';
    console.log(`Game started/re-dealt in room ${roomCode}. Civ word: ${civWord}, Spy word: ${spyWord}`);
    broadcastRoomState(roomCode);
  });

  // 5. Restart Game (Host only)
  socket.on('restart-game', ({ roomCode, playerId }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== playerId) return;

    room.state = 'lobby';
    room.wordPair = null;

    // Reset player states
    room.players.forEach(p => {
      p.role = p.id === room.hostId ? 'host' : null;
      p.word = null;
    });

    console.log(`Room restarted to lobby: ${roomCode}`);
    broadcastRoomState(roomCode);
  });

  // 6. Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Find room where socket belongs
    Object.keys(rooms).forEach(roomCode => {
      const room = rooms[roomCode];
      const player = room.players.find(p => p.socketId === socket.id);
      
      if (player) {
        player.isConnected = false;
        console.log(`Player left (disconnected): ${player.name} in room ${roomCode}`);
        broadcastRoomState(roomCode);
      }
    });
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
