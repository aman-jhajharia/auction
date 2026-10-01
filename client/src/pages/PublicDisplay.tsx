import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext.js';
import { TimerRing } from '../components/TimerRing.js';
import { Trophy, Gavel, User, Sparkles } from 'lucide-react';

export const PublicDisplay: React.FC = () => {
  const { state, timer, lastSold } = useSocket();
  const [bidPulse, setBidPulse] = useState(false);

  const currentPlayer = state?.currentPlayer;
  const currentHighestBid = state?.currentHighestBid || 0;
  const status = state?.status || 'READY';

  useEffect(() => {
    if (currentHighestBid > 0) {
      setBidPulse(true);
      const t = setTimeout(() => setBidPulse(false), 600);
      return () => clearTimeout(t);
    }
  }, [currentHighestBid]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#05070c',
        backgroundImage: `
          radial-gradient(circle at 50% 20%, rgba(0, 242, 254, 0.08) 0%, transparent 60%),
          radial-gradient(circle at 80% 80%, rgba(255, 215, 0, 0.05) 0%, transparent 50%),
          linear-gradient(to bottom, #05070c 0%, #080c14 100%)
        `,
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '36px 60px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* 16:9 Presentation Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              boxShadow: '0 0 25px rgba(245, 158, 11, 0.5)',
            }}
          >
            🏀
          </div>
          <div>
            <h1 className="font-display" style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              MUQABLA <span className="gradient-text-gold">2026</span>
            </h1>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Intra-University Basketball Player Auction
            </div>
          </div>
        </div>

        {/* Live Status Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              padding: '8px 20px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              fontSize: '0.9rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: status === 'BIDDING' ? '#00f2fe' : status === 'SOLD' ? '#ffd700' : '#10b981',
                boxShadow: status === 'BIDDING' ? '0 0 12px #00f2fe' : 'none',
              }}
            />
            <span>
              {status === 'BIDDING' && 'LIVE BIDDING IN PROGRESS'}
              {status === 'PLAYER_REVEAL' && 'PLAYER REVEAL'}
              {status === 'PAUSED' && 'BIDDING PAUSED'}
              {status === 'SOLD_PENDING_CONFIRMATION' && 'SOLD PENDING CONFIRMATION'}
              {status === 'SOLD' && 'SOLD!'}
              {status === 'UNSOLD' && 'UNSOLD'}
              {status === 'SETUP' && 'AUCTION SETUP'}
              {status === 'READY' && 'READY FOR NEXT PLAYER'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Center Stage: 16:9 Projector Layout */}
      {currentPlayer ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: '50px',
            alignItems: 'center',
            margin: 'auto 0',
          }}
        >
          {/* LEFT: Massive Player Card */}
          <div
            className="glass-panel"
            style={{
              padding: '48px',
              borderRadius: '28px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'linear-gradient(135deg, rgba(22, 28, 46, 0.8) 0%, rgba(14, 19, 31, 0.9) 100%)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Top Tagline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span className="badge badge-live" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                ON THE AUCTION BLOCK
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                Base Price: <strong style={{ color: 'var(--text-main)' }}>{currentPlayer.base_price} Credits</strong>
              </span>
            </div>

            {/* Player Name */}
            <h2
              className="font-display"
              style={{
                fontSize: '4rem',
                fontWeight: 900,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                marginBottom: '20px',
              }}
            >
              {currentPlayer.name}
            </h2>

            {/* Position, Gender, and Academic Info */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '32px' }}>
              <span
                style={{
                  padding: '8px 20px',
                  borderRadius: '12px',
                  background: 'rgba(0, 242, 254, 0.12)',
                  border: '1px solid rgba(0, 242, 254, 0.3)',
                  color: 'var(--accent-cyan)',
                  fontSize: '1.2rem',
                  fontWeight: 800,
                }}
              >
                {currentPlayer.position}
              </span>
              <span
                style={{
                  padding: '8px 20px',
                  borderRadius: '12px',
                  background: currentPlayer.gender === 'Female' ? 'rgba(244, 114, 182, 0.12)' : 'rgba(96, 165, 250, 0.12)',
                  border: `1px solid ${currentPlayer.gender === 'Female' ? 'rgba(244, 114, 182, 0.3)' : 'rgba(96, 165, 250, 0.3)'}`,
                  color: currentPlayer.gender === 'Female' ? '#f472b6' : '#60a5fa',
                  fontSize: '1.2rem',
                  fontWeight: 800,
                }}
              >
                {currentPlayer.gender}
              </span>
              {currentPlayer.department && (
                <span
                  style={{
                    padding: '8px 20px',
                    borderRadius: '12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    fontSize: '1.1rem',
                  }}
                >
                  {currentPlayer.department}
                </span>
              )}
              {currentPlayer.year && (
                <span
                  style={{
                    padding: '8px 20px',
                    borderRadius: '12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    fontSize: '1.1rem',
                  }}
                >
                  {currentPlayer.year}
                </span>
              )}
            </div>

            {/* Anti-Favouritism Notice */}
            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
              🔒 Anonymous Live Bidding Active • Bidder identities strictly concealed until confirmation
            </div>
          </div>

          {/* RIGHT: Massive Bid Counter & Authoritative Timer */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}>
            {/* Giant Live Bid Display */}
            <div
              className={`glass-panel ${bidPulse ? 'glass-panel-glow' : ''}`}
              style={{
                width: '100%',
                padding: '36px',
                textAlign: 'center',
                borderRadius: '28px',
                border: '1px solid var(--border-glow)',
                transform: bidPulse ? 'scale(1.03)' : 'scale(1)',
                transition: 'transform 0.2s ease, border-color 0.2s ease',
              }}
            >
              <div
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  letterSpacing: '0.15em',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  marginBottom: '10px',
                }}
              >
                CURRENT HIGHEST BID
              </div>
              <div
                className="font-mono gradient-text-gold"
                style={{
                  fontSize: '6.5rem',
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: '-0.04em',
                }}
              >
                {currentHighestBid > 0 ? currentHighestBid : '—'}
              </div>
              <div
                style={{
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  color: '#fbbf24',
                  marginTop: '10px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                CREDITS
              </div>
            </div>

            {/* Giant Countdown Clock */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TimerRing seconds={timer} totalSeconds={10} isPaused={state?.timerPaused} size={180} />
            </div>
          </div>
        </div>
      ) : lastSold ? (
        /* Giant SOLD Celebration Mode */
        <div
          style={{
            textAlign: 'center',
            margin: 'auto 0',
            animation: 'fadeIn 0.5s ease',
          }}
        >
          <div
            style={{
              width: '100px',
              height: '100px',
              margin: '0 auto 24px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #ffd700, #f59e0b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 45px rgba(255, 215, 0, 0.7)',
            }}
          >
            <Gavel size={54} style={{ color: '#07090e' }} />
          </div>

          <h2
            className="font-display gradient-text-gold"
            style={{ fontSize: '5.5rem', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: '14px' }}
          >
            SOLD!
          </h2>

          <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
            {lastSold.player.name}
          </div>

          <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '32px' }}>
            {lastSold.player.position} • {lastSold.player.gender}
          </div>

          {/* Winning Team Reveal */}
          <div
            className="glass-panel"
            style={{
              display: 'inline-block',
              padding: '24px 60px',
              borderRadius: '20px',
              border: '2px solid var(--border-gold)',
              boxShadow: 'var(--shadow-glow-gold)',
            }}
          >
            <div style={{ fontSize: '1rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
              OFFICIALLY SOLD TO
            </div>
            <div className="font-display gradient-text-gold" style={{ fontSize: '2.8rem', fontWeight: 900, marginBottom: '8px' }}>
              {lastSold.winningTeam.name}
            </div>
            <div className="font-mono" style={{ fontSize: '2rem', fontWeight: 800, color: '#fbbf24' }}>
              for {lastSold.soldPrice} Credits
            </div>
          </div>
        </div>
      ) : (
        /* Standby / Waiting Screen */
        <div style={{ textAlign: 'center', margin: 'auto 0' }}>
          <div
            style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 20px',
              borderRadius: '50%',
              background: 'rgba(0, 242, 254, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(0, 242, 254, 0.3)',
            }}
          >
            <Trophy size={42} style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <h2 className="font-display" style={{ fontSize: '3.2rem', fontWeight: 800, marginBottom: '12px' }}>
            BASKETBALL AUCTION ARENA
          </h2>
          <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto' }}>
            Welcome to Muqabla 2026. The auctioneer is preparing the next player for the auction block.
          </p>
        </div>
      )}

      {/* Footer / Fest Credentials */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '20px',
          color: 'var(--text-dim)',
          fontSize: '0.9rem',
        }}
      >
        <div>Muqabla University Sports Festival • 5 Teams • 100 Credits Per Squad</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} style={{ color: 'var(--accent-gold)' }} />
          <span>Live Draft Arena Mode</span>
        </div>
      </div>
    </div>
  );
};
