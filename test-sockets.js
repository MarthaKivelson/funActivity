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

  // Host restarts game back to lobby
  console.log('Host restarting game back to lobby...');
  hostSocket.emit('restart-game', { roomCode, playerId: hostId });

  await wait(1000);
  console.log(`[Restart Check] Game state is: ${roomStates.host.state} (Expected: lobby)`);
  if (roomStates.host.state !== 'lobby') {
    console.error('FAILED: Game did not return to lobby state.');
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
