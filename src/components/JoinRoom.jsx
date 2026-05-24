import React, { useState, useEffect } from 'react';
import { LogIn, PlusCircle } from 'lucide-react';

export default function JoinRoom({ socket, playerId }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isJoinMode, setIsJoinMode] = useState(true);

  // Load cached name from sessionStorage and url params on mount
  useEffect(() => {
    const cachedName = sessionStorage.getItem('undercover_player_name');
    if (cachedName) {
      setName(cachedName);
    }

    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('code');
    if (codeFromUrl) {
      setRoomCode(codeFromUrl.toUpperCase());
      setIsJoinMode(true);
    }
  }, []);

  const handleSaveName = (val) => {
    setName(val);
    sessionStorage.setItem('undercover_player_name', val);
  };

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // Save name to localStorage
    handleSaveName(name.trim());
    
    // Emit create-room
    socket.emit('create-room', {
      hostName: name.trim(),
      hostId: playerId
    });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!name.trim() || !roomCode.trim()) return;

    // Save name to localStorage
    handleSaveName(name.trim());
    
    // Emit join-room
    socket.emit('join-room', {
      roomCode: roomCode.trim().toUpperCase(),
      name: name.trim(),
      playerId: playerId
    });
  };

  return (
    <div className="card">
      <div className="flex-row-center mb-6" style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
        <button 
          type="button" 
          className={`btn ${isJoinMode ? 'btn-primary' : 'btn-outline'}`} 
          style={{ flex: 1, padding: '0.75rem' }}
          onClick={() => setIsJoinMode(true)}
        >
          <LogIn size={18} /> Join Room
        </button>
        <button 
          type="button" 
          className={`btn ${!isJoinMode ? 'btn-primary' : 'btn-outline'}`} 
          style={{ flex: 1, padding: '0.75rem' }}
          onClick={() => setIsJoinMode(false)}
        >
          <PlusCircle size={18} /> Create Room
        </button>
      </div>

      {isJoinMode ? (
        <form onSubmit={handleJoinRoom} className="flex-col">
          <div className="input-group">
            <label className="input-label">Your Name</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="e.g. Alice" 
              maxLength={15}
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required
            />
          </div>
          
          <div className="input-group">
            <label className="input-label">Room Code</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="4-LETTER CODE" 
              maxLength={4}
              style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
              value={roomCode} 
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())} 
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-secondary" 
            disabled={!name.trim() || roomCode.length < 4}
            style={{ marginTop: '1rem' }}
          >
            Enter Room
          </button>
        </form>
      ) : (
        <form onSubmit={handleCreateRoom} className="flex-col">
          <div className="input-group">
            <label className="input-label">Host Name</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="e.g. GameMaster" 
              maxLength={15}
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required
            />
          </div>
          
          <p className="italic text-center" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.5rem 0 1.5rem' }}>
            As the host, you will configure rules, assign secret words, moderate voting rounds, and declare winners.
          </p>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={!name.trim()}
          >
            Create New Game
          </button>
        </form>
      )}
    </div>
  );
}
