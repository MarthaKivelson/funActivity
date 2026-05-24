import React from 'react';
import { Award, RotateCcw, LogOut, Users, RefreshCw } from 'lucide-react';
import WordReveal from './WordReveal';

export default function GameView({ socket, roomState, playerId, isHost, showToast, onLeave }) {
  const { code, players } = roomState;
  
  // Find self player object
  const me = players.find(p => p.id === playerId);
  
  // Players list excluding host
  const participants = players.filter(p => p.role !== 'host');

  // Host Action Handlers
  const handleDealNewWords = () => {
    socket.emit('start-game', { roomCode: code, playerId });
    showToast('Dealt new words!');
  };

  const handleRestartGame = () => {
    if (window.confirm('Are you sure you want to return to the lobby?')) {
      socket.emit('restart-game', { roomCode: code, playerId });
    }
  };

  // Render Host Panel Controls
  const renderHostPanel = () => {
    if (!isHost) return null;

    return (
      <div className="host-dashboard card" style={{ marginTop: '2rem' }}>
        <div className="host-dash-title">
          <Award size={20} /> Host Control Deck
        </div>
        
        {/* Real-time word reveal for host only */}
        <div className="mb-4">
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            Secret Roles & Words (Moderator Log)
          </h3>
          <div className="host-role-summary-list">
            {participants.map(p => (
              <div key={p.id} className="host-role-item">
                <span className="bold">{p.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className={`role-badge ${p.role}`}>{p.role}</span>
                  <span className="italic font-semibold" style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>
                    {p.role === 'blank' ? 'Blank' : `"${p.word}"`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Phase control actions */}
        <div className="flex-col" style={{ gap: '0.75rem' }}>
          <button className="btn btn-primary" onClick={handleDealNewWords}>
            <RefreshCw size={18} /> Deal New Words
          </button>
          <button className="btn btn-outline btn-danger" onClick={handleRestartGame}>
            <RotateCcw size={18} /> Return to Lobby
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="game-container">
      {/* 1. Header Banner */}
      <div className="card text-center" style={{ padding: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Room</span>
          <h2 style={{ margin: 0, fontSize: '1.25rem', letterSpacing: '0.05em' }}>{code}</h2>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Status</span>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-primary)' }}>
            REVEALING WORDS
          </h2>
        </div>
        <button className="btn btn-outline" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={onLeave}>
          <LogOut size={16} /> Leave
        </button>
      </div>

      {/* 2. Main Gameplay Sections */}
      <div className="fadeIn">
        {/* Private Reveal Panel */}
        {me && me.role !== 'host' && <WordReveal player={me} />}

        {/* Discussion Instructions */}
        <div className="card text-center" style={{ background: 'rgba(6, 182, 212, 0.05)', borderColor: 'var(--color-secondary-glow)' }}>
          <h3 style={{ color: 'var(--color-secondary)', marginBottom: '0.5rem' }}>💬 Describe & Discuss</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Describe your secret word to the group out loud (e.g. over Teams call).
            Civilians try to identify the Undercovers, while spies try to blend in!
          </p>
        </div>
      </div>

      {/* 3. General Player Status Directory */}
      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={16} /> Active Players ({participants.length})
        </h3>
        <div className="players-list">
          {participants.map((p) => (
            <div key={p.id} className="player-tag">
              <div className="player-name-wrapper">
                <div className={`status-dot ${p.isConnected ? 'online' : 'offline'}`} />
                <span>{p.name}</span>
                {p.id === playerId && <span className="badge badge-you">You</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Host panel bottom element */}
      {renderHostPanel()}
    </div>
  );
}
