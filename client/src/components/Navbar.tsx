import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useSocket } from '../context/SocketContext.js';
import { sounds } from '../utils/soundEffects.js';
import { Volume2, VolumeX, LogOut, Shield, Trophy, Tv, Radio } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const [soundOn, setSoundOn] = useState(sounds.enabled);

  const toggleSound = () => {
    sounds.enabled = !soundOn;
    setSoundOn(!soundOn);
  };

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 28px',
      borderBottom: '1px solid var(--border-subtle)',
      backgroundColor: 'rgba(7, 9, 14, 0.85)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      {/* Brand & Fest Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '22px',
          boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)'
        }}>
          🏀
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="font-display" style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              MUQABLA <span className="gradient-text-gold">2026</span>
            </span>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.08)',
              color: 'var(--text-muted)',
              letterSpacing: '0.08em'
            }}>
              LIVE DRAFT
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Basketball Player Auction Platform
          </div>
        </div>
      </div>

      {/* Connection & User Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Real-time sync indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          background: connected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: connected ? '#10b981' : '#ef4444',
          border: `1px solid ${connected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`
        }}>
          <Radio size={14} className={connected ? 'pulse-glow' : ''} />
          <span>{connected ? 'LIVE SYNCED' : 'OFFLINE'}</span>
        </div>

        {/* Sound toggle */}
        <button
          onClick={toggleSound}
          title={soundOn ? 'Mute Stadium Audio' : 'Unmute Audio'}
          className="btn btn-secondary"
          style={{ padding: '8px 12px', borderRadius: '8px' }}
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} style={{ color: 'var(--text-dim)' }} />}
        </button>

        {/* Role Badge */}
        {user && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '10px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.85rem',
            fontWeight: 600
          }}>
            {user.role === 'ADMIN' && (
              <>
                <Shield size={16} style={{ color: 'var(--accent-purple)' }} />
                <span>Admin Console</span>
              </>
            )}
            {user.role === 'CAPTAIN' && (
              <>
                <Trophy size={16} style={{ color: 'var(--accent-gold)' }} />
                <span>{user.team?.name || 'Team Captain'}</span>
              </>
            )}
            {user.role === 'DISPLAY' && (
              <>
                <Tv size={16} style={{ color: 'var(--accent-cyan)' }} />
                <span>Projector Screen</span>
              </>
            )}
          </div>
        )}

        {/* Logout */}
        {user && (
          <button
            onClick={logout}
            className="btn btn-secondary"
            title="Log Out"
            style={{ padding: '8px 12px', borderRadius: '8px' }}
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </header>
  );
};
