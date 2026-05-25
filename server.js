import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WORD_PAIRS } from './src/words.js';
import * as XLSX from 'xlsx';

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

// API route for Excel export (must be defined before fallback route)
app.get('/api/rooms/:roomCode/rounds/:roundNumber/export', (req, res) => {
  const { roomCode, roundNumber } = req.params;
  const { playerId } = req.query;
  
  const room = rooms[roomCode];
  if (!room) {
    return res.status(404).send('Room not found');
  }

  const isHost = room.hostId === playerId;
  const isPlayerInRoom = room.players.some(p => p.id === playerId);

  if (!isHost && (!isPlayerInRoom || !room.allowPlayerDownloads)) {
    return res.status(403).send('Forbidden: You are not authorized to download this report');
  }

  const rnd = parseInt(roundNumber, 10);
  const reportRows = room.reports ? room.reports[rnd] : null;
  if (!reportRows || reportRows.length === 0) {
    return res.status(404).send('Report not found for this round');
  }

  // Format data for sheet
  const sheetData = reportRows.map(row => ({
    'Round': row.round,
    'VoterName': row.voterName,
    'SecretWord': row.voterWord || '',
    'PlayerRole': row.voterRole || '',
    'TimeTakenToVote(Seconds)': row.timeTakenToVote !== null ? `${row.timeTakenToVote.toFixed(2)} secs` : 'No Vote',
    'VotedPlayerName': row.votedPlayerName,
    'VotedPlayerRole': row.votedPlayerRole || '',
    'PointsAwarded': row.pointsAwarded,
    'MrWhiteBonusPointsAwarded': row.mrWhiteBonusPointsAwarded || 0,
    'TotalPointsAfterRound': row.cumulativePoints
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Round ${rnd}`);

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  // Format filename YYYYMMDD_HHMM
  const dateObj = new Date(reportRows[0].votingEndTime);
  const YYYY = dateObj.getFullYear();
  const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
  const DD = String(dateObj.getDate()).padStart(2, '0');
  const HH = String(dateObj.getHours()).padStart(2, '0');
  const MIN = String(dateObj.getMinutes()).padStart(2, '0');
  const dateStr = `${YYYY}${MM}${DD}_${HH}${MIN}`;

  const filename = `VotingRound_${rnd}_${dateStr}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

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
      
      // Reveal role only if:
      // 1. It is the player themselves
      // 2. The recipient is the host
      // 3. The player is the host (everyone knows who the host is)
      const shouldRevealRole = isSelf || isRecipientHost || p.role === 'host';
      
      // Reveal word only if:
      // 1. It is the player themselves
      // 2. The recipient is the host
      const shouldRevealWord = isSelf || isRecipientHost;

      return {
        id: p.id,
        name: p.name,
        isConnected: p.isConnected,
        role: shouldRevealRole ? p.role : null,
        word: shouldRevealWord ? p.word : null
      };
    });

    const isHost = player.id === room.hostId;

    // Calculate points earned by this specific player in the current round
    let myRoundPoints = 0;
    if (room.state === 'voting-ended' && room.reports && room.reports[room.roundNumber]) {
      const myRow = room.reports[room.roundNumber].find(row => row.voterId === player.id);
      if (myRow) {
        myRoundPoints = myRow.pointsAwarded;
      }
    }

    const payload = {
      code: room.code,
      hostId: room.hostId,
      state: room.state,
      config: room.config,
      players: sanitizedPlayers,
      roundNumber: room.roundNumber || 0,
      scores: room.scores || {},
      showScoreboard: true,
      myRoundPoints,
      mrWhiteGuesses: room.mrWhiteGuesses || {},
      allowPlayerDownloads: room.allowPlayerDownloads || false,
      currentVoting: room.currentVoting ? {
        startTime: room.currentVoting.startTime,
        endTime: room.currentVoting.endTime,
        duration: room.currentVoting.duration,
        secondsLeft: room.currentVoting.secondsLeft,
        votesCount: Object.keys(room.currentVoting.votes).length,
        votedPlayerIds: Object.keys(room.currentVoting.votes),
        votes: isHost ? room.currentVoting.votes : null
      } : null,
      currentReport: isHost ? (room.reports ? room.reports[room.roundNumber] : null) : null
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
        blanks: 0,
        votingDuration: 60
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
      wordPair: null,
      roundNumber: 0,
      scores: {},
      showScoreboard: false,
      allowPlayerDownloads: false,
      reports: {},
      currentVoting: null,
      mrWhiteGuesses: {}
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
      if (!room.scores) room.scores = {};
      if (room.scores[playerId] === undefined) {
        room.scores[playerId] = 0;
      }
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
      if (!room.scores) room.scores = {};
      room.scores[playerId] = 0;
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

    // Increment round number
    room.roundNumber = (room.roundNumber || 0) + 1;

    room.state = 'reveal';
    console.log(`Game started/re-dealt in room ${roomCode} for round ${room.roundNumber}. Civ word: ${civWord}, Spy word: ${spyWord}`);
    broadcastRoomState(roomCode);
  });

  // 5. Restart Game (Host only)
  socket.on('restart-game', ({ roomCode, playerId }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== playerId) return;

    room.state = 'lobby';
    room.wordPair = null;
    room.roundNumber = 0;
    room.scores = {};
    room.reports = {};
    room.showScoreboard = false;
    room.allowPlayerDownloads = false;
    room.currentVoting = null;
    room.mrWhiteGuesses = {};

    if (room.votingIntervalId) {
      clearInterval(room.votingIntervalId);
      room.votingIntervalId = null;
    }

    // Reset player states
    room.players.forEach(p => {
      p.role = p.id === room.hostId ? 'host' : null;
      p.word = null;
    });

    console.log(`Room restarted to lobby: ${roomCode}. All scores, round reports, and configurations reset.`);
    broadcastRoomState(roomCode);
  });

  // 6. Start Voting (Host only)
  socket.on('start-voting', ({ roomCode, playerId }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== playerId) return;
    if (room.state !== 'reveal') return;

    if (!room.roundNumber || room.roundNumber === 0) {
      room.roundNumber = 1;
    }

    const duration = room.config.votingDuration || 60;
    const startTime = Date.now();
    const endTime = startTime + duration * 1000;

    room.state = 'voting';
    room.currentVoting = {
      startTime,
      endTime,
      duration,
      secondsLeft: duration,
      votes: {} // voterId -> { targetId, timestamp }
    };

    if (room.votingIntervalId) {
      clearInterval(room.votingIntervalId);
    }

    room.votingIntervalId = setInterval(() => {
      const currentRoom = rooms[roomCode];
      if (!currentRoom || currentRoom.state !== 'voting') {
        if (currentRoom && currentRoom.votingIntervalId) {
          clearInterval(currentRoom.votingIntervalId);
          currentRoom.votingIntervalId = null;
        }
        return;
      }

      const left = Math.max(0, Math.ceil((currentRoom.currentVoting.endTime - Date.now()) / 1000));
      currentRoom.currentVoting.secondsLeft = left;

      if (left <= 0) {
        clearInterval(currentRoom.votingIntervalId);
        currentRoom.votingIntervalId = null;
        processVotingEnded(roomCode);
      } else {
        broadcastRoomState(roomCode);
      }
    }, 1000);

    console.log(`Voting started in room ${roomCode} for round ${room.roundNumber}. Duration: ${duration}s`);
    broadcastRoomState(roomCode);
  });

  // 7. Submit Vote
  socket.on('submit-vote', ({ roomCode, playerId, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'voting') return;

    // Check if voter exists and is not host
    const voter = room.players.find(p => p.id === playerId);
    if (!voter || voter.id === room.hostId) return;

    // Target cannot be self
    if (targetId === playerId) return;

    // Record vote
    room.currentVoting.votes[playerId] = {
      targetId,
      timestamp: Date.now()
    };

    console.log(`Player ${voter.name} voted for ${targetId} in room ${roomCode}`);
    broadcastRoomState(roomCode);
  });

  // 8. End Voting Now (Host override)
  socket.on('end-voting-now', ({ roomCode, playerId }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== playerId) return;
    if (room.state !== 'voting') return;

    console.log(`Host ${playerId} forced end voting in room ${roomCode}`);
    if (room.votingIntervalId) {
      clearInterval(room.votingIntervalId);
      room.votingIntervalId = null;
    }
    processVotingEnded(roomCode);
  });

  // 9. Extend Voting (+15s)
  socket.on('extend-voting', ({ roomCode, playerId }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== playerId) return;
    if (room.state !== 'voting') return;

    room.currentVoting.endTime += 15000;
    room.currentVoting.secondsLeft = Math.max(0, Math.ceil((room.currentVoting.endTime - Date.now()) / 1000));

    console.log(`Voting extended by 15s in room ${roomCode}`);
    broadcastRoomState(roomCode);
  });

  // 10. Evaluate Mr. White Guess (Host only)
  socket.on('evaluate-mr-white-guess', ({ roomCode, playerId, guessResult, bonusPoints }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== playerId) return;
    if (room.state !== 'voting-ended') return;

    // Check if there is any Blank (Mr. White) player in the room
    const hasBlank = room.players.some(p => p.role === 'blank');
    if (!hasBlank) return;

    // Prevent multiple submissions
    if (room.mrWhiteGuesses && room.mrWhiteGuesses[room.roundNumber] && room.mrWhiteGuesses[room.roundNumber].evaluated) {
      console.log(`Mr. White guess already evaluated in room ${roomCode} for round ${room.roundNumber}`);
      return;
    }

    const pointsValue = parseInt(bonusPoints, 10) || 15;
    const isCorrect = guessResult === 'Correct';

    // Store guess result
    if (!room.mrWhiteGuesses) room.mrWhiteGuesses = {};
    room.mrWhiteGuesses[room.roundNumber] = {
      evaluated: true,
      result: isCorrect ? 'Correct' : 'Incorrect',
      bonusPoints: isCorrect ? pointsValue : 0
    };

    // If correct, award bonus points to all blank players and update cumulative score
    if (isCorrect) {
      room.players.forEach(p => {
        if (p.role === 'blank') {
          if (!room.scores) room.scores = {};
          room.scores[p.id] = (room.scores[p.id] || 0) + pointsValue;
        }
      });
    }

    // Update the existing round report rows
    if (room.reports && room.reports[room.roundNumber]) {
      const reports = room.reports[room.roundNumber];
      reports.forEach(row => {
        const player = room.players.find(p => p.id === row.voterId);
        const isBlank = player && player.role === 'blank';
        row.mrWhiteGuessResult = isCorrect ? 'Correct' : 'Incorrect';
        row.mrWhiteBonusPointsAwarded = (isBlank && isCorrect) ? pointsValue : 0;
        row.cumulativePoints = room.scores[row.voterId] || 0;
      });
    }

    console.log(`Mr. White guess evaluated in room ${roomCode} for round ${room.roundNumber}. Result: ${isCorrect ? 'Correct' : 'Incorrect'} (+${isCorrect ? pointsValue : 0} pts)`);
    broadcastRoomState(roomCode);
  });


  // 12. Next Round (Host only)
  socket.on('next-round', ({ roomCode, playerId }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== playerId) return;

    room.state = 'lobby';
    room.wordPair = null;
    room.currentVoting = null;

    if (room.votingIntervalId) {
      clearInterval(room.votingIntervalId);
      room.votingIntervalId = null;
    }

    // Reset player roles/words for lobby, preserve scores
    room.players.forEach(p => {
      p.role = p.id === room.hostId ? 'host' : null;
      p.word = null;
    });

    console.log(`Room ${roomCode} moved to Next Round lobby. Scores preserved.`);
    broadcastRoomState(roomCode);
  });

  // 13. Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    Object.keys(rooms).forEach(roomCode => {
      const room = rooms[roomCode];
      const player = room.players.find(p => p.socketId === socket.id);
      
      if (player) {
        player.isConnected = false;
        console.log(`Player left (disconnected): ${player.name} in room ${roomCode}`);
        
        // Clean up voting interval if all players are disconnected
        if (room.players.every(p => !p.isConnected)) {
          if (room.votingIntervalId) {
            clearInterval(room.votingIntervalId);
            room.votingIntervalId = null;
          }
        }
        
        broadcastRoomState(roomCode);
      }
    });
  });
});

// Helper function to process voting end
function processVotingEnded(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.state !== 'voting') return;

  room.state = 'voting-ended';
  if (room.votingIntervalId) {
    clearInterval(room.votingIntervalId);
    room.votingIntervalId = null;
  }

  // Initialize mrWhiteGuesses entry for this round with default 'Incorrect' result
  if (!room.mrWhiteGuesses) room.mrWhiteGuesses = {};
  room.mrWhiteGuesses[room.roundNumber] = {
    evaluated: false,
    result: 'Incorrect',
    bonusPoints: 0
  };

  const { votes, startTime, endTime } = room.currentVoting;
  const activePlayers = room.players.filter(p => p.id !== room.hostId);
  const roundReportRows = [];

  activePlayers.forEach(voter => {
    const vote = votes[voter.id];
    let target = null;
    let pointsAwarded = 0;
    let votedPlayerName = 'No Vote';
    let votedPlayerRole = '';
    let timeTakenToVote = null;

    if (vote) {
      timeTakenToVote = Math.max(0, parseFloat(((vote.timestamp - startTime) / 1000).toFixed(2)));
      if (vote.targetId) {
        target = room.players.find(p => p.id === vote.targetId);
      }
    }

    if (target) {
      votedPlayerName = target.name;
      if (target.role === 'undercover') {
        pointsAwarded = 10;
      } else if (target.role === 'blank') {
        pointsAwarded = 5;
      } else {
        pointsAwarded = 0;
      }
      votedPlayerRole = target.role === 'blank' ? 'Mr White' : (target.role.charAt(0).toUpperCase() + target.role.slice(1));
    }

    // Ensure score exists
    if (!room.scores) room.scores = {};
    if (room.scores[voter.id] === undefined) {
      room.scores[voter.id] = 0;
    }
    room.scores[voter.id] += pointsAwarded;

    roundReportRows.push({
      round: room.roundNumber,
      votingStartTime: startTime,
      votingEndTime: endTime,
      timeTakenToVote,
      voterName: voter.name,
      voterId: voter.id,
      voterRole: voter.role ? (voter.role === 'blank' ? 'Mr White' : (voter.role.charAt(0).toUpperCase() + voter.role.slice(1))) : '',
      voterWord: voter.word || '',
      votedPlayerName,
      votedPlayerId: target ? target.id : 'no_vote',
      votedPlayerRole,
      pointsAwarded,
      mrWhiteGuessResult: 'Incorrect',
      mrWhiteBonusPointsAwarded: 0,
      cumulativePoints: room.scores[voter.id]
    });
  });

  if (!room.reports) room.reports = {};
  room.reports[room.roundNumber] = roundReportRows;

  console.log(`Voting processed and ended in room ${roomCode} for round ${room.roundNumber}.`);
  broadcastRoomState(roomCode);
}

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
