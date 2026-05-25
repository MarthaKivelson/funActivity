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

  // Update Config: 1 Spy, 0 Blanks
  hostSocket.emit('update-config', {
    roomCode,
    playerId: hostId,
    config: {
      undercovers: 1,
      blanks: 0
    }
  });

  await wait(500);
  console.log(`[Config Check] Undercover count config: ${roomStates.host.config.undercovers} (Expected: 1)`);

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

  // Find player identities to vote correctly
  const undercoverPlayer = roomStates.host.players.find(p => p.role === 'undercover');
  const civilianPlayers = roomStates.host.players.filter(p => p.role === 'civilian');

  // Let's submit votes dynamically based on role assignment
  const aliceIsUndercover = undercoverPlayer.id === player1Id;
  const bobIsUndercover = undercoverPlayer.id === player2Id;

  let aliceTargetId, bobTargetId;
  let expectedAlicePoints = 0;
  let expectedBobPoints = 0;

  if (aliceIsUndercover) {
    // Alice is spy. She votes for civilian Bob. Bob is civilian => Alice gets 0 points.
    aliceTargetId = player2Id;
    expectedAlicePoints = 0;
  } else {
    // Alice is civilian. She votes for undercover player. Target is undercover => Alice gets 10 points.
    aliceTargetId = undercoverPlayer.id;
    expectedAlicePoints = 10;
  }

  if (bobIsUndercover) {
    // Bob is spy. He votes for civilian Alice. Alice is civilian => Bob gets 0 points.
    bobTargetId = player1Id;
    expectedBobPoints = 0;
  } else {
    // Bob is civilian. He votes for undercover player. Target is undercover => Bob gets 10 points.
    bobTargetId = undercoverPlayer.id;
    expectedBobPoints = 10;
  }

  console.log(`[Vote Submit] Alice (${aliceIsUndercover ? 'spy' : 'civ'}) votes for ${aliceTargetId === undercoverPlayer.id ? 'Spy ' + undercoverPlayer.name : 'Civ Bob'}`);
  aliceSocket.emit('submit-vote', { roomCode, playerId: player1Id, targetId: aliceTargetId });

  console.log(`[Vote Submit] Bob (${bobIsUndercover ? 'spy' : 'civ'}) votes for ${bobTargetId === undercoverPlayer.id ? 'Spy ' + undercoverPlayer.name : 'Civ Alice'}`);
  bobSocket.emit('submit-vote', { roomCode, playerId: player2Id, targetId: bobTargetId });

  // Charlie does not vote => should get 0 points

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

  // Check scoreboard & reports
  console.log('Checking calculated points...');
  const aliceScore = roomStates.host.scores[player1Id];
  const bobScore = roomStates.host.scores[player2Id];
  const charlieScore = roomStates.host.scores[player3Id];

  console.log(` - Alice: Score = ${aliceScore} (Expected: ${expectedAlicePoints})`);
  console.log(` - Bob: Score = ${bobScore} (Expected: ${expectedBobPoints})`);
  console.log(` - Charlie (did not vote): Score = ${charlieScore} (Expected: 0)`);

  if (aliceScore !== expectedAlicePoints || bobScore !== expectedBobPoints || charlieScore !== 0) {
    console.error('FAILED: Points calculation is incorrect.');
    process.exit(1);
  }

  // Check myRoundPoints values sent to individual players
  console.log('Checking individual player myRoundPoints...');
  console.log(` - Alice myRoundPoints = ${roomStates.alice.myRoundPoints} (Expected: ${expectedAlicePoints})`);
  console.log(` - Bob myRoundPoints = ${roomStates.bob.myRoundPoints} (Expected: ${expectedBobPoints})`);
  console.log(` - Charlie myRoundPoints = ${roomStates.charlie.myRoundPoints} (Expected: 0)`);

  if (
    roomStates.alice.myRoundPoints !== expectedAlicePoints ||
    roomStates.bob.myRoundPoints !== expectedBobPoints ||
    roomStates.charlie.myRoundPoints !== 0
  ) {
    console.error('FAILED: Individual player myRoundPoints calculation/payload broadcast is incorrect.');
    process.exit(1);
  }

  // Check report presence
  if (!roomStates.host.currentReport || roomStates.host.currentReport.length === 0) {
    console.error('FAILED: Report was not generated/sent to host.');
    process.exit(1);
  }
  console.log(`[Report Check] Report generated successfully. Rows count: ${roomStates.host.currentReport.length}`);

  // Test next-round transition
  console.log('Host starting next round (moving back to lobby)...');
  hostSocket.emit('next-round', { roomCode, playerId: hostId });
  await wait(1000);

  console.log(`[Next Round Check] Game state: ${roomStates.host.state} (Expected: lobby)`);
  console.log(`[Next Round Check] Alice score preserved: ${roomStates.host.scores[player1Id]} (Expected: ${expectedAlicePoints})`);
  const aliceNextRole = roomStates.host.players.find(p => p.name === 'Alice').role;
  console.log(`[Next Round Check] Alice role cleared: ${aliceNextRole} (Expected: null)`);

  if (roomStates.host.state !== 'lobby' || roomStates.host.scores[player1Id] !== expectedAlicePoints || aliceNextRole !== null) {
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
