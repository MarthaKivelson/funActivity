import React from 'react';
import { Users, Settings, Play, LogOut, Copy } from 'lucide-react';

export default function Lobby({ socket, roomState, playerId, isHost, showToast, onLeave }) {
  const { code, config, players, hostId } = roomState;
  
  // Players excluding the host (these are the active participants who get assigned roles)
  const activePlayers = players.filter(p => p.id !== hostId);
  
  const handleCopyLink = () => {
    // Generate joinable URL
    const url = `${window.location.origin}/?code=${code}`;
    navigator.clipboard.writeText(url)
      .then(() => showToast('Share link copied to clipboard!'))
      .catch(() => showToast('Failed to copy. Code is ' + code));
  };

  const updateConfig = (key, value) => {
    if (!isHost) return;
    const newConfig = { ...config, [key]: value };
    socket.emit('update-config', {
      roomCode: code,
      playerId,
      config: newConfig
    });
  };

  const handleStartGame = () => {
    if (!isHost) return;
    socket.emit('start-game', {
      roomCode: code,
      playerId
    });
  };

  // Safe checks for configuration counters
  const minUndercovers = 1;
  const maxUndercovers = Math.max(1, activePlayers.length - config.blanks - 1);
  const minBlanks = 0;
  const maxBlanks = Math.min(2, Math.max(0, activePlayers.length - config.undercovers - 1));

  return (
    <div className="card">
      {/* Room code and invitation section */}
      <div className="room-code-banner">
        <span className="room-code-label">Room Invitation Link</span>
        <div className="room-code-display">
          <span>{code}</span>
          <button className="room-code-copy" onClick={handleCopyLink} title="Copy shareable link">
            <Copy size={20} />
          </button>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Share code or click copy icon to share URL
        </p>
      </div>

      {/* Configuration Panel */}
      {isHost && (
        <div className="config-section">
          <div className="host-dash-title" style={{ fontSize: '0.95rem' }}>
            <Settings size={18} /> Game Settings
          </div>
          
          {/* Undercovers Settings */}
          <div className="config-row">
            <div className="config-info">
              <span className="config-title">Undercovers</span>
              <span className="config-desc">Configurable spies</span>
            </div>
            <div className="config-controls">
              <button 
                type="button" 
                className="btn-counter" 
                disabled={config.undercovers <= minUndercovers}
                onClick={() => updateConfig('undercovers', config.undercovers - 1)}
              >
                -
              </button>
              <span className="counter-value">{config.undercovers}</span>
              <button 
                type="button" 
                className="btn-counter" 
                disabled={config.undercovers >= maxUndercovers}
                onClick={() => updateConfig('undercovers', config.undercovers + 1)}
              >
                +
              </button>
            </div>
          </div>

          {/* Blanks Settings */}
          <div className="config-row">
            <div className="config-info">
              <span className="config-title">Blank Roles</span>
              <span className="config-desc">Players with no word (0-2)</span>
            </div>
            <div className="config-controls">
              <button 
                type="button" 
                className="btn-counter" 
                disabled={config.blanks <= minBlanks}
                onClick={() => updateConfig('blanks', config.blanks - 1)}
              >
                -
              </button>
              <span className="counter-value">{config.blanks}</span>
              <button 
                type="button" 
                className="btn-counter" 
                disabled={config.blanks >= maxBlanks}
                onClick={() => updateConfig('blanks', config.blanks + 1)}
              >
                +
              </button>
            </div>
          </div>

          {/* Voting Duration Settings */}
          <div className="config-row">
            <div className="config-info">
              <span className="config-title">Voting Duration</span>
              <span className="config-desc">Timer length (15s - 300s)</span>
            </div>
            <div className="config-controls">
              <button 
                type="button" 
                className="btn-counter" 
                disabled={(config.votingDuration || 60) <= 15}
                onClick={() => updateConfig('votingDuration', Math.max(15, (config.votingDuration || 60) - 15))}
              >
                -
              </button>
              <span className="counter-value" style={{ minWidth: '3.5rem', textAlign: 'center' }}>
                {config.votingDuration || 60}s
              </span>
              <button 
                type="button" 
                className="btn-counter" 
                disabled={(config.votingDuration || 60) >= 300}
                onClick={() => updateConfig('votingDuration', Math.min(300, (config.votingDuration || 60) + 15))}
              >
                +
              </button>
            </div>
          </div>



        </div>
      )}

      {/* Lobby Players List */}
      <h2 style={{ fontSize: '1.1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Users size={18} /> Players in Lobby ({players.length})
      </h2>
      
      <div className="players-list mb-6" style={{ marginTop: '1rem' }}>
        {players.map((p) => {
          const isPlayerSelf = p.id === playerId;
          const isPlayerHost = p.id === hostId;
          return (
            <div key={p.id} className={`player-tag ${isPlayerHost ? 'host' : ''}`}>
              <div className="player-name-wrapper">
                <div className={`status-dot ${p.isConnected ? 'online' : 'offline'}`} />
                <span>
                  {p.name} <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '0.9em' }}>{isPlayerHost ? '(Host)' : '(Player)'}</span>
                </span>
                {isPlayerSelf && <span className="badge badge-you">You</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scoreboard Section */}
      {Object.keys(roomState.scores || {}).length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🏆 Cumulative Scoreboard
          </h2>
          <div className="table-container">
            <table className="score-table">
              <thead>
                <tr>
                  <th>Player Name</th>
                  <th style={{ textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {players
                  .filter(p => p.id !== hostId)
                  .map(p => (
                    <tr key={p.id}>
                      <td>
                        {p.name} {p.id === playerId ? <span className="badge badge-you">You</span> : ''}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--color-secondary)' }}>
                        {roomState.scores[p.id] || 0} pts
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions Footer */}
      <div className="flex-col" style={{ gap: '0.75rem' }}>
        {isHost ? (
          <button 
            className="btn btn-primary" 
            onClick={handleStartGame} 
            disabled={activePlayers.length < 3}
          >
            <Play size={18} /> Start Game
          </button>
        ) : (
          <div className="card text-center" style={{ margin: 0, padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
            <p className="italic" style={{ color: 'var(--text-muted)' }}>
              Waiting for Host to start the game. {activePlayers.length < 3 ? '(Need at least 3 players)' : ''}
            </p>
          </div>
        )}
        
        <button className="btn btn-outline btn-danger" onClick={onLeave}>
          <LogOut size={18} /> Leave Room
        </button>
      </div>
    </div>
  );
}
