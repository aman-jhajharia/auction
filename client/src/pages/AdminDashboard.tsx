import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext.js';
import { useAuth } from '../context/AuthContext.js';
import { TimerRing } from '../components/TimerRing.js';
import {
  Play,
  Pause,
  RotateCcw,
  Gavel,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download,
  Users,
  Search,
  Trash2,
  Edit,
  ArrowRight,
  Shield,
  XCircle,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { state, timer, adminAction } = useSocket();
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState<'AUCTION' | 'TEAMS' | 'PLAYERS' | 'LOGS'>('AUCTION');
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [playersFilter, setPlayersFilter] = useState<string>('ALL');
  const [playerSearch, setPlayerSearch] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState<string>('');

  // Add Player modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPlayer, setNewPlayer] = useState({
    name: '',
    gender: 'Male',
    position: 'Guard',
    base_price: 3,
    department: 'CSE',
    year: '3rd Year',
  });

  const currentPlayer = state?.currentPlayer;
  const currentHighestBid = state?.currentHighestBid || 0;
  const currentHighestTeamName = state?.currentHighestTeamName;
  const teamSummaries = state?.teamSummaries || [];
  const recentBids = state?.recentBids || [];
  const status = state?.status || 'SETUP';
  const canUndo = state?.canUndo;

  // Fetch full players list for admin
  const fetchPlayers = async () => {
    try {
      const res = await fetch(`/api/players?status=${playersFilter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAllPlayers(data.players || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch audit logs
  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/logs?eventType=${logFilter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'PLAYERS') fetchPlayers();
    if (activeTab === 'LOGS') fetchLogs();
  }, [activeTab, playersFilter, logFilter]);

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newPlayer),
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewPlayer({ name: '', gender: 'Male', position: 'Guard', base_price: 3, department: 'CSE', year: '3rd Year' });
        fetchPlayers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePlayer = async (id: string) => {
    if (!confirm('Are you sure you want to remove this player from the auction?')) return;
    try {
      await fetch(`/api/players/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchPlayers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevealPlayer = (playerId: string) => {
    adminAction('admin:reveal_player', { playerId });
    setActiveTab('AUCTION');
  };

  const filteredPlayers = allPlayers.filter((p) =>
    p.name.toLowerCase().includes(playerSearch.toLowerCase()) ||
    p.position.toLowerCase().includes(playerSearch.toLowerCase())
  );

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 28px 80px' }}>
      {/* Top Header & Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 className="font-display" style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
            Administrator Command Center
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Authoritative Auction Control • Full Concurrency Audit • 5-Team Management
          </p>
        </div>

        {/* Tab Controls */}
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px' }}>
          {[
            { id: 'AUCTION', label: 'Live Auction Block' },
            { id: 'TEAMS', label: '5-Team Overview' },
            { id: 'PLAYERS', label: 'Player Pool' },
            { id: 'LOGS', label: 'Audit Logs & CSV' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="btn"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                background: activeTab === tab.id ? 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))' : 'transparent',
                color: activeTab === tab.id ? '#07090e' : 'var(--text-muted)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ================= TAB 1: LIVE AUCTION BLOCK ================= */}
      {activeTab === 'AUCTION' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
          {/* Main Control Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <span className="badge badge-live" style={{ fontSize: '0.85rem' }}>
                  STATE: {status}
                </span>

                {status === 'SETUP' && (
                  <button onClick={() => adminAction('admin:start_auction')} className="btn btn-gold">
                    <Play size={16} /> Lock Config & Start Auction
                  </button>
                )}
              </div>

              {currentPlayer ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' }}>
                    <div>
                      <h2 className="font-display" style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '6px' }}>
                        {currentPlayer.name}
                      </h2>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.9rem' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                          {currentPlayer.position}
                        </span>
                        <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: currentPlayer.gender === 'Female' ? '#f472b6' : '#60a5fa', fontWeight: 700 }}>
                          {currentPlayer.gender}
                        </span>
                        <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                          Base Price: {currentPlayer.base_price} Credits
                        </span>
                        {currentPlayer.department && (
                          <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                            {currentPlayer.department} ({currentPlayer.year})
                          </span>
                        )}
                      </div>
                    </div>

                    <TimerRing seconds={timer} totalSeconds={10} isPaused={state?.timerPaused} size={110} />
                  </div>

                  {/* Highest Bid Card with FULL Bidder Identity for Admin */}
                  <div
                    style={{
                      background: 'rgba(7, 9, 14, 0.8)',
                      border: '1px solid var(--border-glow)',
                      borderRadius: '16px',
                      padding: '24px',
                      marginBottom: '28px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '20px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        CURRENT HIGHEST BID
                      </div>
                      <div className="font-mono gradient-text-gold" style={{ fontSize: '3rem', fontWeight: 900 }}>
                        {currentHighestBid > 0 ? currentHighestBid : '0'}
                        <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Credits</span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        CURRENT HIGHEST BIDDER
                      </div>
                      <div className="font-display" style={{ fontSize: '1.8rem', fontWeight: 800, color: currentHighestTeamName ? 'var(--accent-cyan)' : 'var(--text-dim)' }}>
                        {currentHighestTeamName || 'No Bids Yet'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                        Visible ONLY to Administrator
                      </div>
                    </div>
                  </div>

                  {/* Comprehensive Auction Controls */}
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>
                      ADMINISTRATIVE CONTROLS
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {status === 'PLAYER_REVEAL' && (
                        <button onClick={() => adminAction('admin:start_bidding')} className="btn btn-primary">
                          <Play size={16} /> Open 10s Bidding Window
                        </button>
                      )}

                      {status === 'BIDDING' && (
                        <>
                          <button onClick={() => adminAction('admin:pause_auction')} className="btn btn-secondary">
                            <Pause size={16} /> Pause Bidding
                          </button>
                          <button onClick={() => adminAction('admin:extend_timer', { seconds: 5 })} className="btn btn-secondary">
                            <Clock size={16} /> +5s Extend
                          </button>
                          <button onClick={() => adminAction('admin:extend_timer', { seconds: 10 })} className="btn btn-secondary">
                            <Clock size={16} /> +10s Extend
                          </button>
                        </>
                      )}

                      {status === 'PAUSED' && (
                        <button onClick={() => adminAction('admin:resume_auction')} className="btn btn-primary">
                          <Play size={16} /> Resume Bidding
                        </button>
                      )}

                      {(status === 'SOLD_PENDING_CONFIRMATION' || (status === 'BIDDING' && currentHighestBid > 0)) && (
                        <button onClick={() => adminAction('admin:confirm_sold')} className="btn btn-gold">
                          <Gavel size={16} /> Confirm SOLD to {currentHighestTeamName || 'Leader'}
                        </button>
                      )}

                      {status !== 'SOLD' && (
                        <button onClick={() => adminAction('admin:mark_unsold')} className="btn btn-danger">
                          <XCircle size={16} /> Mark UNSOLD
                        </button>
                      )}

                      {canUndo && (
                        <button onClick={() => adminAction('admin:undo_sale')} className="btn btn-danger">
                          <RotateCcw size={16} /> Undo Last Sale (Refund Credits)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  <Gavel size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                  <h3 className="font-display" style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '6px' }}>
                    No Player Currently on Block
                  </h3>
                  <p style={{ fontSize: '0.9rem', marginBottom: '20px' }}>
                    Select the next player from the Player Pool queue to start the auction.
                  </p>
                  <button onClick={() => setActiveTab('PLAYERS')} className="btn btn-primary">
                    Open Player Pool & Select Next
                  </button>
                </div>
              )}
            </div>

            {/* Quick Next In Queue Drawer */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h3 className="font-display" style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                  Upcoming Available Players
                </h3>
                <button onClick={() => setActiveTab('PLAYERS')} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                  View All
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {allPlayers
                  .filter((p) => p.status === 'AVAILABLE')
                  .slice(0, 4)
                  .map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: 'var(--bg-secondary)',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div>
                        <strong style={{ display: 'block' }}>{p.name}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {p.position} • {p.gender} • Base: {p.base_price} cr
                        </span>
                      </div>
                      <button
                        onClick={() => handleRevealPlayer(p.id)}
                        disabled={status === 'BIDDING'}
                        className="btn btn-primary"
                        style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                      >
                        Put on Block
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Live Full Bidding History on Current Player */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <h3 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '6px' }}>
              Live Bid Audit History
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '16px' }}>
              Unfiltered real-time record of all bids on this player.
            </p>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px' }}>
              {recentBids.length > 0 ? (
                recentBids.map((b: any) => (
                  <div
                    key={b.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: b.status === 'ACCEPTED' ? 'rgba(0, 242, 254, 0.06)' : 'rgba(239, 68, 68, 0.08)',
                      border: `1px solid ${b.status === 'ACCEPTED' ? 'rgba(0, 242, 254, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ color: b.status === 'ACCEPTED' ? 'var(--accent-cyan)' : '#f87171' }}>
                        {b.team_name}
                      </strong>
                      <span className="font-mono" style={{ fontWeight: 800, fontSize: '1rem', color: b.status === 'ACCEPTED' ? '#fbbf24' : 'var(--text-dim)' }}>
                        {b.amount} cr
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>Capt: {b.captain_name}</span>
                      <span className={`badge ${b.status === 'ACCEPTED' ? 'badge-valid' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                        {b.status}
                      </span>
                    </div>

                    {b.rejection_reason && (
                      <div style={{ fontSize: '0.7rem', color: '#f87171', marginTop: '4px' }}>
                        Reason: {b.rejection_reason}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  No bids placed yet on this player.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: LIVE 5-TEAM OVERVIEW ================= */}
      {activeTab === 'TEAMS' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
          {teamSummaries.map((summary: any) => (
            <div
              key={summary.team.id}
              className="glass-panel"
              style={{
                padding: '24px',
                borderTop: `4px solid ${summary.is_valid ? '#10b981' : '#f59e0b'}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Team header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <h3 className="font-display" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                      {summary.team.name}
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Capt: {summary.captain_name} ({summary.team.captain_gender})
                    </div>
                  </div>
                  <span className={`badge ${summary.is_valid ? 'badge-valid' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                    {summary.is_valid ? 'VALID ✓' : 'INCOMPLETE ⚠'}
                  </span>
                </div>

                {/* Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px', background: 'var(--bg-secondary)', padding: '12px', borderRadius: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CREDITS LEFT</div>
                    <div className="font-mono gradient-text-gold" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                      {summary.credits_remaining}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Spent: {summary.credits_spent}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SQUAD SIZE</div>
                    <div className="font-mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                      {summary.total_squad_size} / 8
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Min: 5</div>
                  </div>
                </div>

                {/* Female Requirement */}
                <div style={{ marginBottom: '16px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: summary.female_requirement_satisfied ? '#10b981' : '#f87171' }}>
                    {summary.female_requirement_satisfied ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    <span style={{ fontWeight: 600 }}>
                      Female Count: {summary.female_count} {summary.female_requirement_satisfied ? '(Satisfied)' : '(Required!)'}
                    </span>
                  </div>
                </div>

                {/* Roster List */}
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  ROSTER BREAKDOWN
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Captain */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '0.8rem' }}>
                    <span>Capt: {summary.captain_name}</span>
                    <span style={{ color: 'var(--text-dim)' }}>0 cr</span>
                  </div>

                  {/* Retained */}
                  {summary.retained_player && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '0.8rem' }}>
                      <span>Ret: {summary.retained_player.name}</span>
                      <span className="badge badge-retained" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>FREE</span>
                    </div>
                  )}

                  {/* Purchased */}
                  {summary.purchased_players.map((p: any) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '0.8rem' }}>
                      <span>{p.name} ({p.gender === 'Female' ? 'F' : 'M'})</span>
                      <strong style={{ color: '#fbbf24' }}>{p.sold_price} cr</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Max Legal Bid on Current Player */}
              {currentPlayer && (
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Max Legal Bid:</span>
                    <strong className="font-mono" style={{ color: summary.can_bid_on_current_player ? 'var(--accent-cyan)' : '#f87171' }}>
                      {summary.max_legal_bid_on_current_player} cr
                    </strong>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ================= TAB 3: PLAYER POOL MANAGEMENT ================= */}
      {activeTab === 'PLAYERS' && (
        <div className="glass-panel" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  placeholder="Search player by name or position..."
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  style={{ paddingLeft: '38px', width: '100%' }}
                />
              </div>

              <select value={playersFilter} onChange={(e) => setPlayersFilter(e.target.value)}>
                <option value="ALL">All Statuses</option>
                <option value="AVAILABLE">Available</option>
                <option value="RETAINED">Retained</option>
                <option value="SOLD">Sold</option>
                <option value="UNSOLD">Unsold</option>
              </select>
            </div>

            <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
              <Plus size={16} /> Add New Player
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px' }}>Name</th>
                  <th style={{ padding: '12px' }}>Gender</th>
                  <th style={{ padding: '12px' }}>Position</th>
                  <th style={{ padding: '12px' }}>Base Price</th>
                  <th style={{ padding: '12px' }}>Dept / Year</th>
                  <th style={{ padding: '12px' }}>Status</th>
                  <th style={{ padding: '12px' }}>Sold To</th>
                  <th style={{ padding: '12px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px', fontWeight: 700 }}>{p.name}</td>
                    <td style={{ padding: '12px', color: p.gender === 'Female' ? '#f472b6' : '#60a5fa' }}>{p.gender}</td>
                    <td style={{ padding: '12px' }}>{p.position}</td>
                    <td style={{ padding: '12px', fontFamily: 'var(--font-mono)' }}>{p.base_price} cr</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{p.department || '—'} {p.year ? `(${p.year})` : ''}</td>
                    <td style={{ padding: '12px' }}>
                      <span
                        className="badge"
                        style={{
                          background:
                            p.status === 'AVAILABLE'
                              ? 'rgba(0, 242, 254, 0.1)'
                              : p.status === 'SOLD'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : p.status === 'RETAINED'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(239, 68, 68, 0.1)',
                          color:
                            p.status === 'AVAILABLE'
                              ? 'var(--accent-cyan)'
                              : p.status === 'SOLD'
                              ? '#34d399'
                              : p.status === 'RETAINED'
                              ? '#fbbf24'
                              : '#f87171',
                        }}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--accent-gold)' }}>
                      {p.sold_team_name ? `${p.sold_team_name} (${p.sold_price} cr)` : '—'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {(p.status === 'AVAILABLE' || p.status === 'UNSOLD') && (
                          <button
                            onClick={() => handleRevealPlayer(p.id)}
                            disabled={status === 'BIDDING'}
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          >
                            Auction
                          </button>
                        )}
                        {p.status === 'AVAILABLE' && (
                          <button
                            onClick={() => handleDeletePlayer(p.id)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', color: '#f87171' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 4: AUDIT LOGS & CSV EXPORT ================= */}
      {activeTab === 'LOGS' && (
        <div className="glass-panel" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
            <div>
              <h3 className="font-display" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                Chronological Audit Trail
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Permanent audit record of all bids, sales, admin decisions, and rejected attempts.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <select value={logFilter} onChange={(e) => setLogFilter(e.target.value)}>
                <option value="">All Events</option>
                <option value="BID_ACCEPTED">Accepted Bids</option>
                <option value="BID_REJECTED">Rejected Bids</option>
                <option value="SALE_CONFIRMED">Sales</option>
                <option value="SALE_UNDONE">Undone Sales</option>
                <option value="AUCTION_STARTED">Auction Started</option>
              </select>

              <a
                href="/api/logs/export/csv"
                target="_blank"
                rel="noreferrer"
                className="btn btn-gold"
                style={{ textDecoration: 'none' }}
              >
                <Download size={16} /> Export CSV
              </a>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px' }}>Time</th>
                  <th style={{ padding: '10px' }}>Event</th>
                  <th style={{ padding: '10px' }}>Actor</th>
                  <th style={{ padding: '10px' }}>Player</th>
                  <th style={{ padding: '10px' }}>Team</th>
                  <th style={{ padding: '10px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(l.timestamp).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        className="badge"
                        style={{
                          fontSize: '0.7rem',
                          background: l.event_type.includes('REJECTED') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0, 242, 254, 0.1)',
                          color: l.event_type.includes('REJECTED') ? '#f87171' : 'var(--accent-cyan)',
                        }}
                      >
                        {l.event_type}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontWeight: 600 }}>{l.actor}</td>
                    <td style={{ padding: '10px' }}>{l.player_name || l.player_id || '—'}</td>
                    <td style={{ padding: '10px', color: '#fbbf24' }}>{l.team_name || l.team_id || '—'}</td>
                    <td style={{ padding: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {l.details_json}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Player Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 100,
          }}
        >
          <div className="glass-panel" style={{ maxWidth: '480px', width: '100%', padding: '32px' }}>
            <h3 className="font-display" style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '20px' }}>
              Add Player to Auction Pool
            </h3>

            <form onSubmit={handleAddPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Player Name
                </label>
                <input
                  type="text"
                  required
                  value={newPlayer.name}
                  onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Gender
                  </label>
                  <select
                    value={newPlayer.gender}
                    onChange={(e) => setNewPlayer({ ...newPlayer, gender: e.target.value as any })}
                    style={{ width: '100%' }}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Position
                  </label>
                  <select
                    value={newPlayer.position}
                    onChange={(e) => setNewPlayer({ ...newPlayer, position: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="Point Guard">Point Guard</option>
                    <option value="Shooting Guard">Shooting Guard</option>
                    <option value="Small Forward">Small Forward</option>
                    <option value="Power Forward">Power Forward</option>
                    <option value="Center">Center</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Base Price (Credits)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newPlayer.base_price}
                    onChange={(e) => setNewPlayer({ ...newPlayer, base_price: Number(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Department
                  </label>
                  <input
                    type="text"
                    value={newPlayer.department}
                    onChange={(e) => setNewPlayer({ ...newPlayer, department: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Add Player
                </button>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
