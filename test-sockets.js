import { io } from 'socket.io-client';

console.log('Starting Simplified Undercover Game Socket Integration Test...');

const SERVER_URL = 'http://localhost:5000';

// Helper to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
  const hostId = 'id_host_gm';
  const player1Id = 'id_player_alice';
  const player2Id = 'id_player_bob';
  const player3Id = 'id_player_charlie';

  let roomCode = '';
  let roomStates = { host: null, alice: null, bob: null, charlie: null };

  // Connect Host
  const hostSocket = io(SERVER_URL);
  
  hostSocket.on('room-created', ({ roomCode: code }) => {
    roomCode = code;
    console.log(`[Host] Created room: ${roomCode}`);
  });

  hostSocket.on('room-update', (state) => {
    roomStates.host = state;
  });

  hostSocket.on('error-msg', (msg) => {
    console.error(`[Host Error]: ${msg}`);
  });

  // Wait for host connection
  await wait(500);
  
  // Host creates room
  hostSocket.emit('create-room', {
    hostName: 'GameMaster',
    hostId: hostId
  });

  // Wait for room creation
  await wait(500);

  if (!roomCode) {
    console.error('FAILED: Room was not created.');
    process.exit(1);
  }

  // Connect Players
  const aliceSocket = io(SERVER_URL);
  const bobSocket = io(SERVER_URL);
  const charlieSocket = io(SERVER_URL);

  aliceSocket.on('room-update', (state) => { roomStates.alice = state; });
  bobSocket.on('room-update', (state) => { roomStates.bob = state; });
  charlieSocket.on('room-update', (state) => { roomStates.charlie = state; });

  aliceSocket.on('join-success', () => console.log('[Alice] Joined room successfully'));
  bobSocket.on('join-success', () => console.log('[Bob] Joined room successfully'));
  charlieSocket.on('join-success', () => console.log('[Charlie] Joined room successfully'));

  await wait(500);

  // Emit join actions
  aliceSocket.emit('join-room', { roomCode, name: 'Alice', playerId: player1Id });
  bobSocket.emit('join-room', { roomCode, name: 'Bob', playerId: player2Id });
  charlieSocket.emit('join-room', { roomCode, name: 'Charlie', playerId: player3Id });

  // Wait for joins to finalize
  await wait(1000);

  console.log(`[Lobby Check] Connected player count: ${roomStates.host.players.length} (Expected: 4, Host + 3 Players)`);
  if (roomStates.host.players.length !== 4) {
    console.error('FAILED: Players did not join correctly.');
    process.exit(1);
  }

  // Update Config: 1 Spy, 1 Mr. White (Blank)
  hostSocket.emit('update-config', {
    roomCode,
    playerId: hostId,
    config: {
      undercovers: 1,
      blanks: 1
    }
  });

  await wait(500);
  console.log(`[Config Check] Undercover count config: ${roomStates.host.config.undercovers} (Expected: 1)`);
  console.log(`[Config Check] Blank count config: ${roomStates.host.config.blanks} (Expected: 1)`);

  // Start game / Deal words
  console.log('Host starting game (dealing words)...');
  hostSocket.emit('start-game', { roomCode, playerId: hostId });

  await wait(1000);

  console.log(`[State Check] Current game state: ${roomStates.host.state} (Expected: reveal)`);
  if (roomStates.host.state !== 'reveal') {
    console.error('FAILED: State is not in reveal.');
    process.exit(1);
  }

  // Inspect private words & roles
  const playersInGame = roomStates.host.players.filter(p => p.role !== 'host');
  console.log('Player Roles & Words assignment:');
  playersInGame.forEach(p => {
    console.log(` - ${p.name}: Role = ${p.role}, Word = "${p.word}"`);
  });

  // Verify secret word masking (Alice shouldn't see Bob's word or role)
  const aliceViewOfBob = roomStates.alice.players.find(p => p.name === 'Bob');
  console.log(`[Security Check] Alice's view of Bob: Role = ${aliceViewOfBob.role}, Word = ${aliceViewOfBob.word} (Expected: null, null)`);
  if (aliceViewOfBob.role !== null || aliceViewOfBob.word !== null) {
    console.error('FAILED: Information leakage! Players can see other players\' private info.');
    process.exit(1);
  }

  // 4a. Host starts voting
  console.log('Host starting voting...');
  hostSocket.emit('start-voting', { roomCode, playerId: hostId });
  await wait(500);

  console.log(`[State Check] Game state after starting voting: ${roomStates.host.state} (Expected: voting)`);
  if (roomStates.host.state !== 'voting') {
    console.error('FAILED: State did not transition to voting.');
    process.exit(1);
  }

  // Find player roles dynamically
  const undercoverPlayer = roomStates.host.players.find(p => p.role === 'undercover');
  const blankPlayer = roomStates.host.players.find(p => p.role === 'blank');
  const civilianPlayer = roomStates.host.players.find(p => p.role === 'civilian');

  // Map IDs to names/sockets for voting
  const playerSockets = {
    [player1Id]: aliceSocket,
    [player2Id]: bobSocket,
    [player3Id]: charlieSocket
  };

  const playerNames = {
    [player1Id]: 'Alice',
    [player2Id]: 'Bob',
    [player3Id]: 'Charlie'
  };

  // Submit votes:
  // - Civilian votes for Undercover (10 points)
  // - Blank votes for Undercover (10 points)
  // - Undercover votes for Civilian (0 points)
  console.log(`[Vote Submit] ${playerNames[civilianPlayer.id]} (Civilian) votes for Undercover ${undercoverPlayer.name}`);
  playerSockets[civilianPlayer.id].emit('submit-vote', { roomCode, playerId: civilianPlayer.id, targetId: undercoverPlayer.id });

  console.log(`[Vote Submit] ${playerNames[blankPlayer.id]} (Mr. White) votes for Undercover ${undercoverPlayer.name}`);
  playerSockets[blankPlayer.id].emit('submit-vote', { roomCode, playerId: blankPlayer.id, targetId: undercoverPlayer.id });

  console.log(`[Vote Submit] ${playerNames[undercoverPlayer.id]} (Undercover) votes for Civilian ${civilianPlayer.name}`);
  playerSockets[undercoverPlayer.id].emit('submit-vote', { roomCode, playerId: undercoverPlayer.id, targetId: civilianPlayer.id });

  await wait(500);

  // Host ends voting early
  console.log('Host force closing voting...');
  hostSocket.emit('end-voting-now', { roomCode, playerId: hostId });
  await wait(1000);

  console.log(`[State Check] Game state after ending voting: ${roomStates.host.state} (Expected: voting-ended)`);
  if (roomStates.host.state !== 'voting-ended') {
    console.error('FAILED: State did not transition to voting-ended.');
    process.exit(1);
  }

  // Check initial scores from voting (before Mr. White guess evaluation)
  console.log('Checking initial calculated points (voting only)...');
  const civVotingScore = roomStates.host.scores[civilianPlayer.id];
  const undercoverVotingScore = roomStates.host.scores[undercoverPlayer.id];
  const blankVotingScore = roomStates.host.scores[blankPlayer.id];

  console.log(` - Civilian (${playerNames[civilianPlayer.id]}): Score = ${civVotingScore} (Expected: 10)`);
  console.log(` - Undercover (${playerNames[undercoverPlayer.id]}): Score = ${undercoverVotingScore} (Expected: 0)`);
  console.log(` - Mr. White (${playerNames[blankPlayer.id]}): Score = ${blankVotingScore} (Expected: 10)`);

  if (civVotingScore !== 10 || undercoverVotingScore !== 0 || blankVotingScore !== 10) {
    console.error('FAILED: Initial voting points calculation is incorrect.');
    process.exit(1);
  }

  // Host evaluates Mr. White's guess as Correct (+15 pts)
  console.log('Host evaluating Mr. White guess as Correct (+15 points)...');
  hostSocket.emit('evaluate-mr-white-guess', {
    roomCode,
    playerId: hostId,
    guessResult: 'Correct',
    bonusPoints: 15
  });
  await wait(1000);

  // Verify updated scores including guess bonus
  console.log('Checking scores after guess evaluation...');
  const civFinalScore = roomStates.host.scores[civilianPlayer.id];
  const undercoverFinalScore = roomStates.host.scores[undercoverPlayer.id];
  const blankFinalScore = roomStates.host.scores[blankPlayer.id];

  console.log(` - Civilian (${playerNames[civilianPlayer.id]}): Score = ${civFinalScore} (Expected: 10)`);
  console.log(` - Undercover (${playerNames[undercoverPlayer.id]}): Score = ${undercoverFinalScore} (Expected: 0)`);
  console.log(` - Mr. White (${playerNames[blankPlayer.id]}): Score = ${blankFinalScore} (Expected: 25)`);

  if (civFinalScore !== 10 || undercoverFinalScore !== 0 || blankFinalScore !== 25) {
    console.error('FAILED: Final points calculation including guess bonus is incorrect.');
    process.exit(1);
  }

  // Check report content for correct columns and values
  console.log('Checking generated round report data...');
  if (!roomStates.host.currentReport || roomStates.host.currentReport.length !== 3) {
    console.error('FAILED: Round report not generated or length mismatch.');
    process.exit(1);
  }

  const blankReportRow = roomStates.host.currentReport.find(r => r.voterId === blankPlayer.id);
  const civReportRow = roomStates.host.currentReport.find(r => r.voterId === civilianPlayer.id);

  console.log(` - Blank report row result: ${blankReportRow.mrWhiteGuessResult} (Expected: Correct)`);
  console.log(` - Blank report row bonus awarded: ${blankReportRow.mrWhiteBonusPointsAwarded} (Expected: 15)`);
  console.log(` - Blank report row cumulativePoints: ${blankReportRow.cumulativePoints} (Expected: 25)`);
  console.log(` - Civilian report row result: ${civReportRow.mrWhiteGuessResult} (Expected: Correct)`);
  console.log(` - Civilian report row bonus awarded: ${civReportRow.mrWhiteBonusPointsAwarded} (Expected: 0)`);
  console.log(` - Civilian report row cumulativePoints: ${civReportRow.cumulativePoints} (Expected: 10)`);

  if (
    blankReportRow.mrWhiteGuessResult !== 'Correct' ||
    blankReportRow.mrWhiteBonusPointsAwarded !== 15 ||
    blankReportRow.cumulativePoints !== 25 ||
    civReportRow.mrWhiteGuessResult !== 'Correct' ||
    civReportRow.mrWhiteBonusPointsAwarded !== 0 ||
    civReportRow.cumulativePoints !== 10
  ) {
    console.error('FAILED: Report row formatting/bonus mapping is incorrect.');
    process.exit(1);
  }

  // Test next-round transition
  console.log('Host starting next round (moving back to lobby)...');
  hostSocket.emit('next-round', { roomCode, playerId: hostId });
  await wait(1000);

  console.log(`[Next Round Check] Game state: ${roomStates.host.state} (Expected: lobby)`);
  console.log(`[Next Round Check] Mr. White score preserved: ${roomStates.host.scores[blankPlayer.id]} (Expected: 25)`);
  const aliceNextRole = roomStates.host.players.find(p => p.name === 'Alice').role;
  console.log(`[Next Round Check] Alice role cleared: ${aliceNextRole} (Expected: null)`);

  if (roomStates.host.state !== 'lobby' || roomStates.host.scores[blankPlayer.id] !== 25 || aliceNextRole !== null) {
    console.error('FAILED: Next round did not initialize correctly.');
    process.exit(1);
  }

  // Host restarts game back to lobby (resets all cumulative scores)
  console.log('Host restarting game back to lobby (full restart)...');
  hostSocket.emit('restart-game', { roomCode, playerId: hostId });

  await wait(1000);
  console.log(`[Restart Check] Game state is: ${roomStates.host.state} (Expected: lobby)`);
  if (roomStates.host.state !== 'lobby') {
    console.error('FAILED: Game did not return to lobby state.');
    process.exit(1);
  }

  console.log(`[Restart Check] Scoreboard cleared: ${Object.keys(roomStates.host.scores).length} entries (Expected: 0)`);
  if (Object.keys(roomStates.host.scores).length !== 0) {
    console.error('FAILED: Scores were not cleared on restart.');
    process.exit(1);
  }

  console.log('SUCCESS: All integration tests passed! Masking is secure and dealing/re-lobby cycles works.');

  // Clean up
  hostSocket.disconnect();
  aliceSocket.disconnect();
  bobSocket.disconnect();
  charlieSocket.disconnect();
  
  process.exit(0);
}

runTest().catch(err => {
  console.error('Test threw an error:', err);
  process.exit(1);
});
