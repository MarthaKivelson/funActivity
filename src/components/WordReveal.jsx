import React, { useState } from 'react';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';

export default function WordReveal({ player }) {
  const [isRevealed, setIsRevealed] = useState(false);

  // Fallback check if player role hasn't populated yet
  if (!player) return null;

  const { role, word } = player;

  const handleRevealStart = () => {
    setIsRevealed(true);
  };

  const handleRevealEnd = () => {
    setIsRevealed(false);
  };

  const toggleReveal = () => {
    setIsRevealed(!isRevealed);
  };

  // Determine what message to show when revealed
  const getRevealContent = () => {
    if (role === 'blank') {
      return (
        <div className="word-box-inner flex-col text-center" style={{ gap: '0.5rem' }}>
          <ShieldAlert size={28} style={{ color: 'var(--color-danger)', margin: '0 auto' }} />
          <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--color-danger)', fontWeight: 700 }}>
            Blank Role
          </span>
          <span className="reveal-word-text" style={{ color: 'var(--color-danger)', textShadow: 'none' }}>
            No Word!
          </span>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Try to blend in. Pay attention to what others describe!
          </p>
        </div>
      );
    }

    return (
      <div className="word-box-inner flex-col text-center">
        <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
          Your Secret Word
        </span>
        <span className="reveal-word-text">
          {word}
        </span>
      </div>
    );
  };

  return (
    <div className="reveal-wrapper">
      <h2>Secret Word Reveal</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Make sure no one is looking at your screen, then reveal your word.
      </p>

      <div className="reveal-btn-container">
        <button
          type="button"
          className={`reveal-btn ${isRevealed ? 'active' : ''}`}
          // Mouse/Touch triggers for hold-to-reveal
          onMouseDown={handleRevealStart}
          onMouseUp={handleRevealEnd}
          onMouseLeave={handleRevealEnd}
          onTouchStart={(e) => {
            e.preventDefault(); // Prevent context menu trigger
            handleRevealStart();
          }}
          onTouchEnd={handleRevealEnd}
          // Alternative fallback for accessibility / click toggle
          onClick={toggleReveal}
          title="Press/Hold to reveal your secret word"
        >
          {isRevealed ? (
            <>
              {getRevealContent()}
              <span className="reveal-instruction" style={{ marginTop: '0.75rem', fontSize: '0.75rem' }}>
                Release to hide
              </span>
            </>
          ) : (
            <>
              <EyeOff size={36} style={{ color: 'var(--color-primary)', marginBottom: '0.5rem' }} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Press & Hold</span>
              <span className="reveal-instruction" style={{ marginTop: '0.25rem' }}>
                to reveal privately
              </span>
            </>
          )}
        </button>
      </div>

      <p className="italic text-center" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
        You can also tap the button to toggle, but remember to hide it before describing!
      </p>
    </div>
  );
}
