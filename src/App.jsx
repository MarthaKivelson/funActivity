import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import JoinRoom from './components/JoinRoom';
import Lobby from './components/Lobby';
import GameView from './components/GameView';

// Establish socket connection (proxied to server.js in dev, or same host in prod)
const socket = io();

// Helper to generate a unique random ID
function generateUniqueId() {
  return 'player_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export default function App() {
  const [playerId, setPlayerId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomState, setRoomState] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // 1. Initialize persistent playerId
  useEffect(() => {
    let id = sessionStorage.getItem('undercover_player_id');
    if (!id) {
      id = generateUniqueId();
      sessionStorage.setItem('undercover_player_id', id);
    }
    setPlayerId(id);

    // Read stored room code & check for reconnection
    const storedCode = sessionStorage.getItem('undercover_room_code');
    const storedName = sessionStorage.getItem('undercover_player_name');
    if (storedCode && storedName && id) {
      console.log(`Attempting reconnect for room: ${storedCode}, player: ${storedName}`);
      socket.emit('join-room', {
        roomCode: storedCode,
        name: storedName,
        playerId: id
      });
    }
  }, []);

  // 2. Setup Socket Listeners
  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
      // If we got disconnected and re-established connection, try to rejoin
      const storedCode = sessionStorage.getItem('undercover_room_code');
      const storedName = sessionStorage.getItem('undercover_player_name');
      const id = sessionStorage.getItem('undercover_player_id');
      if (storedCode && storedName && id) {
        socket.emit('join-room', {
          roomCode: storedCode,
          name: storedName,
          playerId: id
        });
      }
    });

    socket.on('room-created', ({ roomCode }) => {
      setRoomCode(roomCode);
      sessionStorage.setItem('undercover_room_code', roomCode);
      
      const hostName = sessionStorage.getItem('undercover_player_name') || 'Host';
      const id = sessionStorage.getItem('undercover_player_id');
      
      socket.emit('join-room', {
        roomCode,
        name: hostName,
        playerId: id
      });
    });

    socket.on('join-success', ({ roomCode, playerId, isHost }) => {
      setRoomCode(roomCode);
      setIsHost(isHost);
      sessionStorage.setItem('undercover_room_code', roomCode);
      setError('');
    });

    socket.on('room-update', (updatedState) => {
      setRoomState(updatedState);
      // Double check if player is host (re-verify on updates)
      const id = sessionStorage.getItem('undercover_player_id');
      setIsHost(updatedState.hostId === id);
    });

    socket.on('error-msg', (msg) => {
      setError(msg);
      // Clear error after 5 seconds
      setTimeout(() => {
        setError((prev) => (prev === msg ? '' : prev));
      }, 5000);
    });

    return () => {
      socket.off('connect');
      socket.off('room-created');
      socket.off('join-success');
      socket.off('room-update');
      socket.off('error-msg');
    };
  }, []);

  // Helper to trigger toast messages
  const showToast = (message) => {
    setToast(message);
    setTimeout(() => {
      setToast('');
    }, 2000);
  };

  // Leave room logic
  const handleLeaveRoom = () => {
    sessionStorage.removeItem('undercover_room_code');
    setRoomCode('');
    setRoomState(null);
    setIsHost(false);
  };

  return (
    <div className="app-container">
      {/* Toast Alert */}
      {toast && <div className="toast">{toast}</div>}

      {/* Connection / Game Errors */}
      {error && (
        <div 
          className="card" 
          style={{ 
            borderColor: 'var(--color-danger)', 
            background: 'rgba(244, 63, 94, 0.1)', 
            padding: '1rem', 
            marginBottom: '1rem',
            textAlign: 'center'
          }}
        >
          <p style={{ color: 'var(--color-danger)', fontWeight: 'bold' }}>⚠️ {error}</p>
        </div>
      )}

      {/* Navigation Header */}
      <header className="text-center mb-6">
        <h1>Undercover</h1>
        <p className="subtitle">The Secret Word Party Game</p>
      </header>

      {/* Main View Router */}
      {!roomCode ? (
        <JoinRoom socket={socket} playerId={playerId} />
      ) : !roomState ? (
        <div className="card text-center">
          <h2>Connecting to room...</h2>
          <p className="italic">Re-establishing connection with Room {roomCode}</p>
          <button className="btn btn-outline" style={{ marginTop: '1.5rem' }} onClick={handleLeaveRoom}>
            Cancel and Return
          </button>
        </div>
      ) : roomState.state === 'lobby' ? (
        <Lobby 
          socket={socket} 
          roomState={roomState} 
          playerId={playerId} 
          isHost={isHost} 
          showToast={showToast}
          onLeave={handleLeaveRoom}
        />
      ) : (
        <GameView 
          socket={socket} 
          roomState={roomState} 
          playerId={playerId} 
          isHost={isHost} 
          showToast={showToast}
          onLeave={handleLeaveRoom}
        />
      )}
    </div>
  );
}
