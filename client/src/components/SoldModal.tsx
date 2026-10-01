import React from 'react';
import { Gavel, Award, X } from 'lucide-react';

interface SoldModalProps {
  soldData: {
    player: {
      name: string;
      position: string;
      gender: string;
      department?: string;
    };
    winningTeam: {
      name: string;
    };
    soldPrice: number;
  } | null;
  onClose: () => void;
}

export const SoldModal: React.FC<SoldModalProps> = ({ soldData, onClose }) => {
  if (!soldData) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 12, 0.88)',
        backdropFilter: 'blur(12px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '560px',
          width: '100%',
          padding: '40px',
          textAlign: 'center',
          position: 'relative',
          border: '2px solid var(--border-gold)',
          boxShadow: 'var(--shadow-glow-gold)',
          borderRadius: '24px',
          background: 'linear-gradient(180deg, rgba(22, 28, 46, 0.95) 0%, rgba(14, 19, 31, 0.98) 100%)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
          }}
        >
          <X size={22} />
        </button>

        {/* Championship Hammer & Badge */}
        <div
          style={{
            width: '84px',
            height: '84px',
            margin: '0 auto 20px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #ffd700, #f59e0b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 35px rgba(255, 215, 0, 0.6)',
          }}
        >
          <Gavel size={42} style={{ color: '#07090e' }} />
        </div>

        <div
          className="font-display"
          style={{
            fontSize: '1rem',
            fontWeight: 800,
            letterSpacing: '0.2em',
            color: '#fbbf24',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}
        >
          HAMMER HAS FALLEN
        </div>

        <h1
          className="font-display gradient-text-gold"
          style={{
            fontSize: '3.5rem',
            fontWeight: 900,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            marginBottom: '16px',
          }}
        >
          SOLD!
        </h1>

        {/* Player Name */}
        <div
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            color: 'var(--text-main)',
            marginBottom: '6px',
          }}
        >
          {soldData.player.name}
        </div>

        <div
          style={{
            fontSize: '1rem',
            color: 'var(--text-muted)',
            marginBottom: '28px',
          }}
        >
          {soldData.player.position} • {soldData.player.gender}
          {soldData.player.department ? ` • ${soldData.player.department}` : ''}
        </div>

        {/* Winning Details Card */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '28px',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
            Winning Team
          </div>
          <div
            className="font-display gradient-text-gold"
            style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '14px' }}
          >
            {soldData.winningTeam.name}
          </div>

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '14px 0' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Award size={20} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>Winning Bid:</span>
            <span className="font-mono" style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fbbf24' }}>
              {soldData.soldPrice}
            </span>
            <span style={{ fontSize: '1rem', color: '#fbbf24', fontWeight: 600 }}>Credits</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="btn btn-gold"
          style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
        >
          Continue Live Auction
        </button>
      </div>
    </div>
  );
};
