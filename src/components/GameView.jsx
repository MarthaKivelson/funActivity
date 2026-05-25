import React, { useState } from 'react';
import { Award, RotateCcw, LogOut, Users, RefreshCw, Timer, CheckCircle, Vote, Download, Settings } from 'lucide-react';
import WordReveal from './WordReveal';

export default function GameView({ socket, roomState, playerId, isHost, showToast, onLeave }) {
  const { code, players, hostId, state, currentVoting, currentReport, roundNumber } = roomState;
  
  // Find self player object
  const me = players.find(p => p.id === playerId);
  
  // Players list excluding host
  const participants = players.filter(p => p.id !== hostId);

  // Voting Selection State
  const [selectedTargetId, setSelectedTargetId] = useState('');
  // Show aggregate vote count toggle for host
  const [showAggregateCounts, setShowAggregateCounts] = useState(false);

  // Host Action Handlers
  const handleDealNewWords = () => {
    socket.emit('start-game', { roomCode: code, playerId });
    showToast('Dealt new words!');
  };

  const handleRestartGame = () => {
    if (window.confirm('Are you sure you want to return to the lobby and RESET all scores?')) {
      socket.emit('restart-game', { roomCode: code, playerId });
    }
  };

  const handleStartVoting = () => {
    socket.emit('start-voting', { roomCode: code, playerId });
    showToast('Voting started!');
  };

  const handleEndVotingNow = () => {
    socket.emit('end-voting-now', { roomCode: code, playerId });
    showToast('Ending voting...');
  };

  const handleExtendVoting = () => {
    socket.emit('extend-voting', { roomCode: code, playerId });
    showToast('Extended voting by 15s!');
  };

  const handleNextRound = () => {
    socket.emit('next-round', { roomCode: code, playerId });
  };

  const handleDownloadReport = () => {
    window.location.href = `/api/rooms/${code}/rounds/${roundNumber}/export?playerId=${playerId}`;
  };

  const handleVoteSubmit = (targetId) => {
    setSelectedTargetId(targetId);
    socket.emit('submit-vote', { roomCode: code, playerId, targetId });
    showToast('Vote submitted!');
  };

  const updateConfig = (key, value) => {
    if (!isHost) return;
    const newConfig = { ...roomState.config, [key]: value };
    socket.emit('update-config', {
      roomCode: code,
      playerId,
      config: newConfig
    });
  };

  // Helper to compute aggregate votes count
  const getAggregateVotes = () => {
    const counts = {};
    if (currentVoting && currentVoting.votes) {
      Object.values(currentVoting.votes).forEach(vote => {
        if (vote && vote.targetId) {
          counts[vote.targetId] = (counts[vote.targetId] || 0) + 1;
        }
      });
    }
    return counts;
  };
  const voteCounts = getAggregateVotes();

  // Render Host Panel Controls
  const renderHostPanel = () => {
    if (!isHost) return null;

    if (state === 'reveal') {
      return (
        <div className="host-dashboard card" style={{ marginTop: '2.5rem' }}>
          <div className="host-dash-title">
            <Award size={20} /> Host Control Deck (Round {roundNumber})
          </div>

          {/* Voting Duration configuration */}
          <div className="config-section" style={{ background: 'rgba(255,255,255,0.02)', marginBottom: '1.5rem' }}>
            <div className="host-dash-title" style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              <Settings size={18} /> Voting Settings
            </div>
            <div className="config-row">
              <div className="config-info">
                <span className="config-title">Voting Duration</span>
                <span className="config-desc">Timer length (15s - 300s)</span>
              </div>
              <div className="config-controls">
                <button 
                  type="button" 
                  className="btn-counter" 
                  disabled={(roomState.config.votingDuration || 60) <= 15}
                  onClick={() => updateConfig('votingDuration', Math.max(15, (roomState.config.votingDuration || 60) - 15))}
                >
                  -
                </button>
                <span className="counter-value" style={{ minWidth: '3.5rem', textAlign: 'center' }}>
                  {roomState.config.votingDuration || 60}s
                </span>
                <button 
                  type="button" 
                  className="btn-counter" 
                  disabled={(roomState.config.votingDuration || 60) >= 300}
                  onClick={() => updateConfig('votingDuration', Math.min(300, (roomState.config.votingDuration || 60) + 15))}
                >
                  +
                </button>
              </div>
            </div>
          </div>
          
          {/* Moderation Details */}
          <div className="mb-4">
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              Secret Roles & Words
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

          {/* Action Triggers */}
          <div className="flex-col" style={{ gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={handleDealNewWords}>
              <RefreshCw size={18} /> Deal New Words
            </button>
            <button className="btn btn-secondary" onClick={handleStartVoting}>
              <Vote size={18} /> Start Voting Phase
            </button>
            <button className="btn btn-outline btn-danger" onClick={handleRestartGame}>
              <RotateCcw size={18} /> Return to Lobby (Reset Game)
            </button>
          </div>
        </div>
      );
    }

    if (state === 'voting') {
      return (
        <div className="host-dashboard card" style={{ marginTop: '2.5rem' }}>
          <div className="host-dash-title">
            <Award size={20} /> Host Control Deck (Voting Phase)
          </div>

          {/* Voting progress counts */}
          <div className="mb-4 text-center">
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Votes Collected: <span className="bold" style={{ color: 'var(--color-success)' }}>{currentVoting ? currentVoting.votesCount : 0}</span> / {participants.length}
            </p>
          </div>

          {/* Toggle show aggregate votes */}
          <div className="toggle-group" style={{ marginBottom: '1rem' }}>
            <label>Show Aggregate Vote Counts (Host-Only)</label>
            <span className="switch">
              <input 
                type="checkbox" 
                checked={showAggregateCounts} 
                onChange={(e) => setShowAggregateCounts(e.target.checked)}
              />
              <span className="slider"></span>
            </span>
          </div>

          <div className="timer-actions">
            <button className="btn btn-outline" onClick={handleExtendVoting}>
              Extend +15s
            </button>
            <button className="btn btn-outline btn-danger" onClick={handleEndVotingNow}>
              End Voting Now
            </button>
          </div>
        </div>
      );
    }

    return null; // For 'voting-ended', we show summary panel in main view
  };

  return (
    <div className="game-container">
      {/* 1. Header Banner */}
      <div className="card text-center" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Room</span>
          <h2 style={{ margin: 0, fontSize: '1.25rem', letterSpacing: '0.05em' }}>{code}</h2>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Round {roundNumber}</span>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-primary)' }}>
            {state === 'reveal' ? 'REVEALING WORDS' : state === 'voting' ? 'VOTING PHASE' : 'VOTING ENDED'}
          </h2>
        </div>
        <button className="btn btn-outline" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={onLeave}>
          <LogOut size={16} /> Leave
        </button>
      </div>

      {/* 2. REVEAL STATE VIEW */}
      {state === 'reveal' && (
        <div className="fadeIn">
          {/* Private Reveal Panel */}
          {me && me.id !== hostId && <WordReveal player={me} />}

          {/* Discussion Instructions */}
          <div className="card text-center" style={{ background: 'rgba(6, 182, 212, 0.05)', borderColor: 'var(--color-secondary-glow)' }}>
            <h3 style={{ color: 'var(--color-secondary)', marginBottom: '0.5rem' }}>💬 Describe & Discuss</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Describe your secret word to the group out loud (e.g. over Teams call).
              Civilians try to identify the Undercovers, while spies try to blend in!
            </p>
          </div>
        </div>
      )}

      {/* 3. VOTING STATE VIEW */}
      {state === 'voting' && currentVoting && (
        <div className="fadeIn">
          {/* Countdown timer */}
          <div className="timer-container">
            <Timer size={20} />
            <span className="timer-text">
              Voting ends in: {currentVoting.secondsLeft}s
            </span>
          </div>
          <div className="timer-bar-bg" style={{ marginBottom: '1.5rem', marginTop: '-1rem' }}>
            <div 
              className="timer-bar-fill" 
              style={{ width: `${(currentVoting.secondsLeft / currentVoting.duration) * 100}%` }}
            />
          </div>

          {/* Player Voting UX */}
          {me && me.id !== hostId ? (
            <div className="card">
              <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem', textAlign: 'center' }}>
                Cast Your Vote
              </h2>
              <p className="italic text-center" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
                Select the player you suspect is NOT a Civilian.
              </p>

              <div className="voting-section">
                {participants
                  .filter(p => p.id !== playerId) // cannot vote for self
                  .map(p => {
                    const isSelected = selectedTargetId === p.id;
                    
                    return (
                      <div 
                        key={p.id} 
                        className={`vote-option ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleVoteSubmit(p.id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontWeight: 600 }}>{p.name}</span>
                        </div>
                        <div className="vote-radio">
                          <span className="vote-radio-inner" />
                        </div>
                      </div>
                    );
                  })}
              </div>

              {selectedTargetId ? (
                <div className="text-center" style={{ color: 'var(--color-success)', fontSize: '0.85rem' }}>
                  <CheckCircle size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.25rem' }} />
                  Vote submitted for <span className="bold">{players.find(p => p.id === selectedTargetId)?.name}</span>. You can change your vote until time ends.
                </div>
              ) : (
                <p className="italic text-center" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Choose one player above to submit your vote.
                </p>
              )}
            </div>
          ) : (
            <div className="card text-center">
              <h2>Voting Is In Progress</h2>
              <p className="italic" style={{ color: 'var(--text-muted)' }}>
                Players are casting their secret votes.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4. VOTING ENDED STATE VIEW */}
      {state === 'voting-ended' && (
        <div className="fadeIn">
          {/* Confirmed screen */}
          <div className="card text-center" style={{ borderColor: 'var(--color-success-glow)', background: 'rgba(16, 185, 129, 0.05)' }}>
            <h2 className="win-title civilians" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
              Voting Closed
            </h2>
            <p className="italic" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              All votes have been collected and processed by the server.
            </p>
          </div>

          {/* Cheer message if player scored points in the round */}
          {!isHost && roomState.myRoundPoints > 0 && (
            <div className="card text-center fadeIn" style={{ borderColor: 'var(--color-success-glow)', background: 'rgba(16, 185, 129, 0.1)', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.75rem', color: 'var(--color-success)', marginBottom: '0.5rem' }}>
                🎉 Cheers!
              </h2>
              <p style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                You voted correctly and earned <span style={{ color: 'var(--color-secondary)' }}>+{roomState.myRoundPoints} pts</span> this round!
              </p>
            </div>
          )}

          {/* Host Summary Dashboard */}
          {isHost && (
            <div className="card">
              <h2 style={{ fontSize: '1.15rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📊 Round {roundNumber} Summary
              </h2>

              <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                <table className="score-table">
                  <thead>
                    <tr>
                      <th>Voter</th>
                      <th>Voter Role</th>
                      <th>Voted For</th>
                      <th>Target Role</th>
                      <th>Time</th>
                      <th style={{ textAlign: 'right' }}>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport && currentReport.map((row, idx) => (
                      <tr key={idx}>
                        <td className="bold">{row.voterName}</td>
                        <td>
                          {row.voterRole ? (
                            <span className={`role-badge ${row.voterRole.toLowerCase()}`}>
                              {row.voterRole}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ color: row.votedPlayerName === 'No Vote' ? 'var(--color-danger)' : 'inherit' }}>
                          {row.votedPlayerName}
                        </td>
                        <td>
                          {row.votedPlayerRole ? (
                            <span className={`role-badge ${row.votedPlayerRole.toLowerCase()}`}>
                              {row.votedPlayerRole}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {row.timeTakenToVote !== null ? `${row.timeTakenToVote}s` : <span style={{ color: 'var(--color-danger)' }}>No Vote</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--color-secondary)' }}>
                          +{row.pointsAwarded}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action and Download deck */}
              <div className="flex-col" style={{ gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={handleDownloadReport}>
                  <Download size={18} /> Download Round Report (.xlsx)
                </button>
                <button className="btn btn-primary" onClick={handleNextRound}>
                  <RefreshCw size={18} /> Next Round (Preserve Scores)
                </button>
                <button className="btn btn-outline btn-danger" onClick={handleRestartGame}>
                  <RotateCcw size={18} /> End Game / Return to Lobby
                </button>
              </div>
            </div>
          )}

          {/* Scoreboard displayed unconditionally if scores are present */}
          {Object.keys(roomState.scores || {}).length > 0 && (
            <div className="card">
              <h2 style={{ fontSize: '1.15rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                🏆 Scoreboard (Cumulative)
              </h2>
              <div className="table-container">
                <table className="score-table">
                  <thead>
                    <tr>
                      <th>Player Name</th>
                      <th style={{ textAlign: 'right' }}>Total Score</th>
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
        </div>
      )}

      {/* 5. General Player Status Directory */}
      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={16} /> Active Players ({participants.length})
        </h3>
        <div className="players-list">
          {participants.map((p) => {
            const hasVoted = state === 'voting' && currentVoting && currentVoting.votedPlayerIds.includes(p.id);
            const votesReceived = voteCounts[p.id] || 0;
            
            return (
              <div key={p.id} className={`player-tag ${hasVoted ? 'voted' : ''}`} style={{ justifyContent: 'space-between' }}>
                <div className="player-name-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                  <div className={`status-dot ${p.isConnected ? 'online' : 'offline'}`} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                  {p.id === playerId && <span className="badge badge-you">You</span>}
                  
                  {state === 'voting' && isHost && showAggregateCounts && votesReceived > 0 && (
                    <span style={{ color: 'var(--color-primary)', fontWeight: 'bold', fontSize: '0.85em' }}>
                      ({votesReceived} {votesReceived === 1 ? 'vote' : 'votes'})
                    </span>
                  )}

                  {/* Host view of player's secret info */}
                  {isHost && p.role && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                      <span className={`role-badge ${p.role}`} style={{ fontSize: '0.6rem', padding: '1px 4px' }}>
                        {p.role}
                      </span>
                      <span style={{ color: 'var(--color-secondary)', fontSize: '0.8rem', fontWeight: 600, fontStyle: 'italic' }}>
                        {p.role === 'blank' ? 'Blank' : `"${p.word}"`}
                      </span>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {hasVoted && (
                    <span className="badge" style={{ background: 'var(--color-success)', color: 'white' }}>
                      Voted
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Host panel bottom element */}
      {renderHostPanel()}
    </div>
  );
}
