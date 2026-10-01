import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useSocket } from '../context/SocketContext.js';
import { TimerRing } from '../components/TimerRing.js';
import {
  Trophy,
  Users,
  Coins,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Clock,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';

export const CaptainDashboard: React.FC = () => {
  const { user } = useAuth();
  const { state, timer, placeBid, bidError, clearBidError } = useSocket();
  const [customBid, setCustomBid] = useState<string>('');

  if (!state) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        Connecting to Muqabla Live Auction Feed...
      </div>
    );
  }

  const squadSummary = state.yourSquadSummary;
  const currentPlayer = state.currentPlayer;
  const currentHighestBid = state.currentHighestBid || 0;
  const yourHighestBid = state.yourHighestBid || 0;
  const isYourBidHighest = state.isYourBidHighest || false;
  const maxLegalBid = state.maxLegalBid || 0;
  const canBid = state.canBid;
  const minNextBid = state.minNextBid || 1;
  const isBiddingActive = state.status === 'BIDDING';

  const handleQuickIncrement = (inc: number) => {
    const nextAmount = currentHighestBid === 0 ? minNextBid + (inc - 1) : currentHighestBid + inc;
    if (nextAmount <= maxLegalBid) {
      placeBid(nextAmount);
    }
  };

  const handleCustomBidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(customBid);
    if (!isNaN(val) && val >= minNextBid) {
      placeBid(val);
      setCustomBid('');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px 60px' }}>
      {/* Top Banner / Team Identifier */}
      <div
        className="glass-panel"
        style={{
          padding: '24px 28px',
          marginBottom: '24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          borderLeft: '4px solid var(--accent-gold)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Trophy size={20} style={{ color: 'var(--accent-gold)' }} />
            <h1 className="font-display" style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {squadSummary?.team?.name || user?.team?.name || 'Captain Portal'}
            </h1>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Captain: <strong style={{ color: 'var(--text-main)' }}>{squadSummary?.captain_name || user?.team?.captain_name}</strong> • Muqabla 2026 Live Draft
          </div>
        </div>

        {/* Live Squad Health Meters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {/* Credits Meter */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Credits Remaining
            </div>
            <div className="font-mono gradient-text-gold" style={{ fontSize: '1.8rem', fontWeight: 800 }}>
              {squadSummary?.credits_remaining ?? 100}
              <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}> / 100</span>
            </div>
          </div>

          {/* Squad Size Meter */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Squad Size
            </div>
            <div className="font-mono" style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
              {squadSummary?.total_squad_size ?? 2}
              <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}> / 8</span>
            </div>
          </div>

          {/* Female Status Badge */}
          <div>
            {squadSummary?.female_requirement_satisfied ? (
              <span className="badge badge-valid">
                <CheckCircle2 size={13} />
                Female Requirement Met ({squadSummary.female_count})
              </span>
            ) : (
              <span className="badge badge-warning">
                <AlertTriangle size={13} />
                Female Player Required (0)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Rejection Alert Toast */}
      {bidError && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 18px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={20} />
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{bidError}</span>
          </div>
          <button
            onClick={clearBidError}
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Bidding Arena & Private Squad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(280px, 1fr)', gap: '24px' }}>
        {/* LEFT COLUMN: LIVE AUCTION BLOCK */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '28px' }}>
            {currentPlayer ? (
              <div>
                {/* Status bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span className={`badge ${isBiddingActive ? 'badge-live' : 'badge-retained'}`}>
                    {state.status === 'BIDDING' && '🔥 LIVE BIDDING OPEN'}
                    {state.status === 'PLAYER_REVEAL' && '👀 PLAYER REVEAL'}
                    {state.status === 'PAUSED' && '⏸ BIDDING PAUSED'}
                    {state.status === 'SOLD_PENDING_CONFIRMATION' && '⏳ SOLD PENDING CONFIRMATION'}
                    {state.status === 'SOLD' && '🔨 PLAYER SOLD'}
                    {state.status === 'UNSOLD' && '❌ PLAYER UNSOLD'}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Base Price: <strong style={{ color: 'var(--text-main)' }}>{currentPlayer.base_price} Credits</strong>
                  </span>
                </div>

                {/* Player Profile */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' }}>
                  <div>
                    <h2 className="font-display" style={{ fontSize: '2.2rem', fontWeight: 900, marginBottom: '6px' }}>
                      {currentPlayer.name}
                    </h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.85rem' }}>
                      <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                        {currentPlayer.position}
                      </span>
                      <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: currentPlayer.gender === 'Female' ? '#f472b6' : '#60a5fa', fontWeight: 600 }}>
                        {currentPlayer.gender}
                      </span>
                      {currentPlayer.department && (
                        <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                          {currentPlayer.department}
                        </span>
                      )}
                      {currentPlayer.year && (
                        <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                          {currentPlayer.year}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Countdown Timer */}
                  <TimerRing seconds={timer} totalSeconds={10} isPaused={state.timerPaused} size={110} />
                </div>

                {/* Live Current Bid Box (ANONYMOUS — Anti-Favouritism Mechanism) */}
                <div
                  style={{
                    background: 'rgba(7, 9, 14, 0.7)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '16px',
                    padding: '20px',
                    marginBottom: '24px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px',
                  }}
                >
                  {/* Anonymous Current Highest Bid */}
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                      Current Highest Bid
                    </div>
                    <div className="font-mono gradient-text-gold" style={{ fontSize: '2.5rem', fontWeight: 900 }}>
                      {currentHighestBid > 0 ? currentHighestBid : '—'}
                      <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600, marginLeft: '6px' }}>Credits</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                      Bidder identity is anonymous
                    </div>
                  </div>

                  {/* Your Team's Current Bid */}
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                      Your Current Bid
                    </div>
                    <div className="font-mono" style={{ fontSize: '2.5rem', fontWeight: 900, color: isYourBidHighest ? '#10b981' : 'var(--text-main)' }}>
                      {yourHighestBid > 0 ? yourHighestBid : '—'}
                      <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600, marginLeft: '6px' }}>Credits</span>
                    </div>
                    <div>
                      {isYourBidHighest ? (
                        <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} /> You are current highest!
                        </span>
                      ) : yourHighestBid > 0 ? (
                        <span style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 700 }}>
                          Outbid
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No bid placed yet</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Legal Bid Constraint Indicator */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 18px',
                    borderRadius: '12px',
                    background: 'var(--bg-tertiary)',
                    marginBottom: '20px',
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={16} style={{ color: 'var(--accent-cyan)' }} />
                    <span style={{ color: 'var(--text-muted)' }}>Your Max Legal Bid:</span>
                    <strong className="font-mono" style={{ color: 'var(--accent-cyan)', fontSize: '1.05rem' }}>
                      {maxLegalBid} Credits
                    </strong>
                  </div>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                    Reserves {squadSummary ? squadSummary.credits_remaining - maxLegalBid : 0} credits for rules
                  </span>
                </div>

                {/* Controlled Bidding Interface (Chips + Custom Input) */}
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '10px' }}>
                    QUICK BID INCREMENTS
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                    {[1, 2, 5, 10].map((inc) => {
                      const target = currentHighestBid === 0 ? minNextBid + (inc - 1) : currentHighestBid + inc;
                      const disabled = !isBiddingActive || !canBid || target > maxLegalBid || isYourBidHighest;
                      return (
                        <button
                          key={inc}
                          disabled={disabled}
                          onClick={() => handleQuickIncrement(inc)}
                          className="bid-chip"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '10px 6px',
                          }}
                        >
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>+{inc}</span>
                          <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>{target}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Jump Bid Input */}
                  <form onSubmit={handleCustomBidSubmit} style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="number"
                      placeholder={`Enter bid (min ${minNextBid})`}
                      value={customBid}
                      min={minNextBid}
                      max={maxLegalBid}
                      disabled={!isBiddingActive || !canBid || isYourBidHighest}
                      onChange={(e) => setCustomBid(e.target.value)}
                      style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700 }}
                    />
                    <button
                      type="submit"
                      disabled={!isBiddingActive || !canBid || isYourBidHighest || !customBid || Number(customBid) < minNextBid || Number(customBid) > maxLegalBid}
                      className="btn btn-primary"
                      style={{ padding: '0 24px', fontSize: '0.95rem' }}
                    >
                      <ArrowUpRight size={18} />
                      Place Bid
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              /* Waiting State */
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <Clock size={48} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                <h3 className="font-display" style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '6px' }}>
                  Waiting for Administrator
                </h3>
                <p style={{ fontSize: '0.9rem' }}>
                  Next player will appear on this block as soon as the administrator reveals them.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: MY PRIVATE SQUAD & BUDGET SUMMARY */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                My Squad Roster
              </h3>
              <span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                {squadSummary?.total_squad_size ?? 2} / 8 Players
              </span>
            </div>

            {/* Squad List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Captain */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: 'rgba(255, 215, 0, 0.08)',
                  border: '1px solid rgba(255, 215, 0, 0.25)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {squadSummary?.captain_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Captain ({squadSummary?.team?.captain_gender})
                  </div>
                </div>
                <span className="badge badge-retained" style={{ fontSize: '0.7rem' }}>
                  CAPTAIN
                </span>
              </div>

              {/* Retained Player */}
              {squadSummary?.retained_player && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      {squadSummary.retained_player.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {squadSummary.retained_player.position} • {squadSummary.retained_player.gender}
                    </div>
                  </div>
                  <span className="badge badge-retained" style={{ fontSize: '0.7rem' }}>
                    RETAINED — FREE
                  </span>
                </div>
              )}

              {/* Purchased Players */}
              {squadSummary?.purchased_players && squadSummary.purchased_players.length > 0 ? (
                squadSummary.purchased_players.map((p: any) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {p.position} • {p.gender}
                      </div>
                    </div>
                    <span className="font-mono" style={{ fontWeight: 700, color: 'var(--accent-gold)' }}>
                      {p.sold_price} cr
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '16px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  No auctioned players purchased yet (minimum 3 required)
                </div>
              )}
            </div>

            {/* Squad Rules Checklist */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                Squad Validation Rules
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {squadSummary?.total_squad_size >= 5 ? (
                    <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                  ) : (
                    <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                  )}
                  <span>Minimum 5 players: <strong>{squadSummary?.total_squad_size} / 5</strong></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {squadSummary?.female_requirement_satisfied ? (
                    <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                  ) : (
                    <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                  )}
                  <span>Compulsory female player: <strong>{squadSummary?.female_count >= 1 ? 'Yes ✓' : 'Required ⚠'}</strong></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                  <span>Maximum 8 players capacity</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
