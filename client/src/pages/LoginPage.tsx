import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Shield, Trophy, Tv, AlertCircle, Lock, User, Eye, EyeOff } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const success = await login(username, password);
    if (!success) {
      setError('Invalid username or password. Please verify credentials.');
    }
    setLoading(false);
  };

  const handleSelectLoginId = (loginId: string) => {
    setUsername(loginId);
    setError(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '480px',
          width: '100%',
          padding: '40px',
          borderRadius: '24px',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Fest Brand Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              marginBottom: '16px',
              boxShadow: '0 0 25px rgba(245, 158, 11, 0.45)',
            }}
          >
            🏀
          </div>
          <h1
            className="font-display"
            style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '6px' }}
          >
            MUQABLA <span className="gradient-text-gold">2026</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Live Basketball Player Auction Platform
          </p>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#f87171',
              fontSize: '0.85rem',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Secure Credentials Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
              USERNAME / CAPTAIN LOGIN ID
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '14px', top: '13px', color: 'var(--text-dim)' }} />
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. ashmit_curry or admin"
                style={{ width: '100%', paddingLeft: '40px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
              PASSWORD
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '14px', top: '13px', color: 'var(--text-dim)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{ width: '100%', paddingLeft: '40px', paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '12px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', marginTop: '8px', fontSize: '1rem' }}
          >
            {loading ? 'Authenticating...' : 'Enter Live Auction Portal'}
          </button>
        </form>

        {/* Captain & Role Quick ID Helper (No passwords exposed) */}
        <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--text-dim)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '14px',
              textAlign: 'center',
            }}
          >
            Select Login ID to autofill username
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <button
              type="button"
              onClick={() => handleSelectLoginId('admin')}
              className="btn btn-secondary"
              style={{ padding: '8px 12px', fontSize: '0.8rem', justifyContent: 'flex-start' }}
            >
              <Shield size={14} style={{ color: 'var(--accent-purple)' }} />
              <span>Admin: admin</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectLoginId('display')}
              className="btn btn-secondary"
              style={{ padding: '8px 12px', fontSize: '0.8rem', justifyContent: 'flex-start' }}
            >
              <Tv size={14} style={{ color: 'var(--accent-cyan)' }} />
              <span>Display: display</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[
              { id: 'ashmit_curry', name: 'Ashmit' },
              { id: 'vansh_baby', name: 'Vansh' },
              { id: 'divyanshu_lebron', name: 'Divyanshu' },
              { id: 'champ_chirayu', name: 'Chirayu' },
              { id: 'parth_gangsta', name: 'Parth' },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectLoginId(c.id)}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.75rem', justifyContent: 'space-between' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Trophy size={13} style={{ color: 'var(--accent-gold)' }} />
                  <span style={{ fontWeight: 600 }}>Team {c.name}</span>
                </div>
                <span className="font-mono" style={{ color: 'var(--text-dim)' }}>{c.id}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
