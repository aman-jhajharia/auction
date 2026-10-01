import { Server } from 'socket.io';
import { db } from './db.js';
import {
  AuctionConfig,
  AuctionStateRecord,
  AuctionStatus,
  Bid,
  Player,
  Team,
  TeamSquadSummary,
} from './types.js';
import {
  calculateMaxLegalBid,
  calculateSquadSummary,
  DEFAULT_CONFIG,
  validateBidAttempt,
} from './validation.js';

export class AuctionEngine {
  private io: Server | null = null;
  private timerInterval: NodeJS.Timeout | null = null;
  private bidQueue: Promise<any> = Promise.resolve();

  constructor() {}

  public setSocketServer(io: Server) {
    this.io = io;
  }

  public getState(): AuctionStateRecord {
    const row = db.prepare('SELECT * FROM auction_state WHERE id = 1').get() as AuctionStateRecord;
    return row;
  }

  public getConfig(): AuctionConfig {
    const state = this.getState();
    try {
      return JSON.parse(state.config_json);
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  public updateConfig(newConfig: Partial<AuctionConfig>, actor: string) {
    const current = this.getConfig();
    if (current.config_locked) {
      throw new Error('Auction configuration is locked and cannot be changed.');
    }
    const updated = { ...current, ...newConfig };
    db.prepare('UPDATE auction_state SET config_json = ? WHERE id = 1').run(JSON.stringify(updated));
    this.logAudit('CONFIG_UPDATED', actor, null, null, { newConfig: updated });
    this.broadcastState();
  }

  public lockConfig(actor: string) {
    const config = this.getConfig();
    config.config_locked = true;
    db.prepare('UPDATE auction_state SET config_json = ?, status = ? WHERE id = 1').run(
      JSON.stringify(config),
      'READY'
    );
    this.logAudit('CONFIG_LOCKED', actor, null, null, { config });
    this.broadcastState();
  }

  public startAuction(actor: string) {
    const state = this.getState();
    if (state.status === 'SETUP') {
      this.lockConfig(actor);
    }
    db.prepare('UPDATE auction_state SET status = ? WHERE id = 1').run('READY');
    this.logAudit('AUCTION_STARTED', actor, null, null, {});
    this.broadcastState();
  }

  public pauseAuction(actor: string) {
    const state = this.getState();
    if (state.status !== 'BIDDING') return;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    db.prepare('UPDATE auction_state SET status = ?, timer_paused = 1 WHERE id = 1').run('PAUSED');
    this.logAudit('AUCTION_PAUSED', actor, state.current_player_id, null, {
      remaining: state.timer_remaining,
    });
    this.broadcastState();
  }

  public resumeAuction(actor: string) {
    const state = this.getState();
    if (state.status !== 'PAUSED') return;

    db.prepare('UPDATE auction_state SET status = ?, timer_paused = 0 WHERE id = 1').run('BIDDING');
    this.logAudit('AUCTION_RESUMED', actor, state.current_player_id, null, {
      remaining: state.timer_remaining,
    });
    this.startTimerCountdown();
    this.broadcastState();
  }

  public extendTimer(seconds: number, actor: string) {
    const state = this.getState();
    if (state.status !== 'BIDDING' && state.status !== 'PAUSED') return;

    const newTimer = state.timer_remaining + seconds;
    db.prepare('UPDATE auction_state SET timer_remaining = ? WHERE id = 1').run(newTimer);
    this.logAudit('TIMER_EXTENDED', actor, state.current_player_id, null, {
      addedSeconds: seconds,
      newTimer,
    });
    this.broadcastTimer(newTimer);
    this.broadcastState();
  }

  public revealPlayer(playerId: string, actor: string) {
    this.stopTimer();

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as Player | undefined;
    if (!player) throw new Error('Player not found.');
    if (player.status !== 'AVAILABLE' && player.status !== 'UNSOLD') {
      throw new Error(`Cannot auction player with status: ${player.status}`);
    }

    const config = this.getConfig();

    const tx = db.transaction(() => {
      db.prepare("UPDATE players SET status = 'AUCTIONING' WHERE id = ?").run(playerId);
      db.prepare(`
        UPDATE auction_state
        SET status = 'PLAYER_REVEAL',
            current_player_id = ?,
            current_highest_bid = 0,
            current_highest_team_id = NULL,
            timer_remaining = ?,
            timer_paused = 0
        WHERE id = 1
      `).run(playerId, config.auction_timer_seconds);
    });
    tx();

    this.logAudit('PLAYER_REVEALED', actor, playerId, null, {
      name: player.name,
      base_price: player.base_price,
      gender: player.gender,
      position: player.position,
    });

    this.broadcastState();
  }

  public startBidding(actor: string) {
    const state = this.getState();
    if (!state.current_player_id) throw new Error('No player selected.');

    const config = this.getConfig();
    db.prepare(`
      UPDATE auction_state
      SET status = 'BIDDING',
          timer_remaining = ?,
          timer_paused = 0
      WHERE id = 1
    `).run(config.auction_timer_seconds);

    this.logAudit('BIDDING_STARTED', actor, state.current_player_id, null, {
      timer: config.auction_timer_seconds,
    });

    this.startTimerCountdown();
    this.broadcastState();
  }

  /**
   * Concurrency-safe atomic bid placement using FIFO lock queue and SQLite immediate transaction.
   */
  public async placeBid(
    teamId: string,
    amount: number,
    actor: string
  ): Promise<{ accepted: boolean; reason?: string }> {
    return new Promise((resolve) => {
      this.bidQueue = this.bidQueue
        .then(async () => {
          const result = this.executeBidTransaction(teamId, amount, actor);
          resolve(result);
        })
        .catch((err) => {
          resolve({ accepted: false, reason: err.message || 'Internal bid error.' });
        });
    });
  }

  private executeBidTransaction(
    teamId: string,
    amount: number,
    actor: string
  ): { accepted: boolean; reason?: string } {
    const state = this.getState();
    const config = this.getConfig();

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as Team | undefined;
    if (!team) return { accepted: false, reason: 'Team not found.' };

    const player = state.current_player_id
      ? (db.prepare('SELECT * FROM players WHERE id = ?').get(state.current_player_id) as Player)
      : null;

    const retainedPlayer = (db
      .prepare("SELECT * FROM players WHERE sold_team_id = ? AND status = 'RETAINED'")
      .get(teamId) as Player) || null;

    const purchasedPlayers = db
      .prepare("SELECT * FROM players WHERE sold_team_id = ? AND status = 'SOLD'")
      .all(teamId) as Player[];

    // Validate using core rules engine
    const validation = validateBidAttempt({
      team,
      retainedPlayer,
      purchasedPlayers,
      currentPlayer: player,
      auctionStatus: state.status,
      currentHighestBid: state.current_highest_bid,
      currentHighestTeamId: state.current_highest_team_id,
      attemptedBid: amount,
      config,
    });

    const bidId = `bid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const previousHighest = state.current_highest_bid;

    if (!validation.accepted) {
      // Record rejected bid in audit history
      db.prepare(`
        INSERT INTO bids (id, player_id, team_id, amount, previous_highest_bid, status, rejection_reason)
        VALUES (?, ?, ?, ?, ?, 'REJECTED', ?)
      `).run(bidId, state.current_player_id || '', teamId, amount, previousHighest, validation.reason);

      this.logAudit('BID_REJECTED', actor, state.current_player_id, teamId, {
        amount,
        previousHighest,
        reason: validation.reason,
      });

      return validation;
    }

    // ACCEPTED BID: Execute atomic update
    const tx = db.transaction(() => {
      // 1. Record accepted bid
      db.prepare(`
        INSERT INTO bids (id, player_id, team_id, amount, previous_highest_bid, status, rejection_reason)
        VALUES (?, ?, ?, ?, ?, 'ACCEPTED', NULL)
      `).run(bidId, state.current_player_id!, teamId, amount, previousHighest);

      // 2. Update auction state & reset timer to 10 seconds
      db.prepare(`
        UPDATE auction_state
        SET current_highest_bid = ?,
            current_highest_team_id = ?,
            timer_remaining = ?
        WHERE id = 1
      `).run(amount, teamId, config.auction_timer_seconds);
    });
    tx();

    this.logAudit('BID_ACCEPTED', actor, state.current_player_id, teamId, {
      amount,
      previousHighest,
      newHighestBidder: team.name,
    });

    // Reset countdown timer
    this.startTimerCountdown();
    this.broadcastState();

    return { accepted: true };
  }

  public confirmSold(actor: string) {
    this.stopTimer();
    const state = this.getState();
    if (!state.current_player_id || !state.current_highest_team_id || state.current_highest_bid <= 0) {
      throw new Error('No winning bid to confirm.');
    }

    const playerId = state.current_player_id;
    const teamId = state.current_highest_team_id;
    const winningBid = state.current_highest_bid;

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as Player;
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as Team;

    const tx = db.transaction(() => {
      // 1. Update player status
      db.prepare(`
        UPDATE players
        SET status = 'SOLD',
            sold_team_id = ?,
            sold_price = ?
        WHERE id = ?
      `).run(teamId, winningBid, playerId);

      // 2. Deduct credits from winning team
      db.prepare(`
        UPDATE teams
        SET credits_remaining = credits_remaining - ?
        WHERE id = ?
      `).run(winningBid, teamId);

      // 3. Update auction state
      db.prepare(`
        UPDATE auction_state
        SET status = 'SOLD',
            last_sold_player_id = ?,
            last_sold_team_id = ?,
            last_sold_price = ?
        WHERE id = 1
      `).run(playerId, teamId, winningBid);
    });
    tx();

    this.logAudit('SALE_CONFIRMED', actor, playerId, teamId, {
      playerName: player.name,
      teamName: team.name,
      price: winningBid,
    });

    if (this.io) {
      this.io.emit('auction:sold', {
        player,
        winningTeam: { id: team.id, name: team.name },
        soldPrice: winningBid,
      });
    }

    this.broadcastState();
  }

  public markUnsold(actor: string) {
    this.stopTimer();
    const state = this.getState();
    if (!state.current_player_id) throw new Error('No player on auction.');

    const playerId = state.current_player_id;
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as Player;

    const tx = db.transaction(() => {
      db.prepare("UPDATE players SET status = 'UNSOLD', sold_team_id = NULL, sold_price = NULL WHERE id = ?").run(playerId);
      db.prepare(`
        UPDATE auction_state
        SET status = 'UNSOLD',
            current_highest_bid = 0,
            current_highest_team_id = NULL
        WHERE id = 1
      `).run();
    });
    tx();

    this.logAudit('PLAYER_UNSOLD', actor, playerId, null, {
      playerName: player.name,
    });

    if (this.io) {
      this.io.emit('auction:unsold', { player });
    }

    this.broadcastState();
  }

  public undoLastSale(actor: string) {
    const state = this.getState();
    if (!state.last_sold_player_id || !state.last_sold_team_id || !state.last_sold_price) {
      throw new Error('No recent sale available to undo.');
    }

    // Only allow undo if next player has not started bidding
    if (state.status === 'BIDDING') {
      throw new Error('Cannot undo sale while another player is currently in active bidding.');
    }

    const playerId = state.last_sold_player_id;
    const teamId = state.last_sold_team_id;
    const price = state.last_sold_price;

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as Player;
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as Team;

    const tx = db.transaction(() => {
      // 1. Reset player to AVAILABLE
      db.prepare("UPDATE players SET status = 'AVAILABLE', sold_team_id = NULL, sold_price = NULL WHERE id = ?").run(playerId);

      // 2. Refund team credits
      db.prepare('UPDATE teams SET credits_remaining = credits_remaining + ? WHERE id = ?').run(price, teamId);

      // 3. Clear last sold from state
      db.prepare(`
        UPDATE auction_state
        SET last_sold_player_id = NULL,
            last_sold_team_id = NULL,
            last_sold_price = NULL
        WHERE id = 1
      `).run();
    });
    tx();

    this.logAudit('SALE_UNDONE', actor, playerId, teamId, {
      playerName: player ? player.name : playerId,
      teamName: team ? team.name : teamId,
      refundedPrice: price,
    });

    this.broadcastState();
  }

  private startTimerCountdown() {
    this.stopTimer();

    this.timerInterval = setInterval(() => {
      const state = this.getState();
      if (state.status !== 'BIDDING' || state.timer_paused === 1) {
        this.stopTimer();
        return;
      }

      const nextRemaining = state.timer_remaining - 1;

      if (nextRemaining <= 0) {
        this.stopTimer();
        db.prepare('UPDATE auction_state SET timer_remaining = 0 WHERE id = 1').run();
        this.broadcastTimer(0);

        if (state.current_highest_bid > 0 && state.current_highest_team_id) {
          // Timer reached 0 with a winning bidder -> SOLD_PENDING_CONFIRMATION
          db.prepare("UPDATE auction_state SET status = 'SOLD_PENDING_CONFIRMATION' WHERE id = 1").run();
          this.logAudit('TIMER_EXPIRED', 'system', state.current_player_id, state.current_highest_team_id, {
            highestBid: state.current_highest_bid,
          });
        } else {
          // 0 bids placed -> auto-transition to UNSOLD
          this.markUnsold('system');
          return;
        }

        this.broadcastState();
      } else {
        db.prepare('UPDATE auction_state SET timer_remaining = ? WHERE id = 1').run(nextRemaining);
        this.broadcastTimer(nextRemaining);
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private broadcastTimer(remaining: number) {
    if (this.io) {
      this.io.emit('auction:timer_tick', { remaining });
    }
  }

  public broadcastState() {
    if (!this.io) return;

    const state = this.getState();
    const config = this.getConfig();
    const currentPlayer = state.current_player_id
      ? (db.prepare('SELECT * FROM players WHERE id = ?').get(state.current_player_id) as Player)
      : null;

    // 1. PUBLIC DISPLAY PAYLOAD (Strictly no team budgets, no current bidder name)
    const publicPayload = {
      status: state.status,
      currentPlayer: currentPlayer
        ? {
            id: currentPlayer.id,
            name: currentPlayer.name,
            gender: currentPlayer.gender,
            position: currentPlayer.position,
            base_price: currentPlayer.base_price,
            department: currentPlayer.department,
            year: currentPlayer.year,
            skill_rating: currentPlayer.skill_rating,
          }
        : null,
      currentHighestBid: state.current_highest_bid,
      timerRemaining: state.timer_remaining,
      timerPaused: state.timer_paused === 1,
      // Revealed only when officially SOLD
      lastSold: state.last_sold_player_id
        ? {
            player: db.prepare('SELECT * FROM players WHERE id = ?').get(state.last_sold_player_id),
            team: db.prepare('SELECT * FROM teams WHERE id = ?').get(state.last_sold_team_id),
            price: state.last_sold_price,
          }
        : null,
    };
    this.io.to('display').emit('auction:state_sync', publicPayload);

    // 2. ADMIN PAYLOAD (Full visibility, all team summaries, full bid logs)
    const allTeams = db.prepare('SELECT * FROM teams').all() as Team[];
    const teamSummaries: TeamSquadSummary[] = allTeams.map((team) => {
      const retained = (db
        .prepare("SELECT * FROM players WHERE sold_team_id = ? AND status = 'RETAINED'")
        .get(team.id) as Player) || null;
      const purchased = db
        .prepare("SELECT * FROM players WHERE sold_team_id = ? AND status = 'SOLD'")
        .all(team.id) as Player[];
      return calculateSquadSummary(
        team,
        retained,
        purchased,
        config,
        currentPlayer,
        state.current_highest_team_id
      );
    });

    const recentBids = state.current_player_id
      ? (db.prepare(`
          SELECT b.*, t.name as team_name, t.captain_name
          FROM bids b
          JOIN teams t ON b.team_id = t.id
          WHERE b.player_id = ?
          ORDER BY b.timestamp DESC
          LIMIT 20
        `).all(state.current_player_id) as Bid[])
      : [];

    const adminPayload = {
      ...publicPayload,
      currentHighestTeamId: state.current_highest_team_id,
      currentHighestTeamName: state.current_highest_team_id
        ? (db.prepare('SELECT name FROM teams WHERE id = ?').get(state.current_highest_team_id) as any)?.name
        : null,
      teamSummaries,
      recentBids,
      config,
      canUndo: !!state.last_sold_player_id && state.status !== 'BIDDING',
    };
    this.io.to('admin').emit('auction:state_sync', adminPayload);

    // 3. CAPTAIN PAYLOADS (Private room per team: captain_<teamId>)
    for (const team of allTeams) {
      const retained = (db
        .prepare("SELECT * FROM players WHERE sold_team_id = ? AND status = 'RETAINED'")
        .get(team.id) as Player) || null;
      const purchased = db
        .prepare("SELECT * FROM players WHERE sold_team_id = ? AND status = 'SOLD'")
        .all(team.id) as Player[];
      const summary = calculateSquadSummary(
        team,
        retained,
        purchased,
        config,
        currentPlayer,
        state.current_highest_team_id
      );

      // Find captain's highest bid on this player
      const captainHighestBid = state.current_player_id
        ? ((db.prepare(`
            SELECT MAX(amount) as max_bid
            FROM bids
            WHERE player_id = ? AND team_id = ? AND status = 'ACCEPTED'
          `).get(state.current_player_id, team.id) as any)?.max_bid || 0)
        : 0;

      const isCurrentHighest = state.current_highest_team_id === team.id;

      const captainPayload = {
        status: state.status,
        currentPlayer: publicPayload.currentPlayer,
        currentHighestBid: state.current_highest_bid,
        timerRemaining: state.timer_remaining,
        timerPaused: state.timer_paused === 1,
        // Captain private team stats
        yourSquadSummary: summary,
        yourHighestBid: captainHighestBid,
        isYourBidHighest: isCurrentHighest,
        maxLegalBid: summary.max_legal_bid_on_current_player,
        canBid: summary.can_bid_on_current_player && state.status === 'BIDDING',
        minNextBid: state.current_highest_bid === 0
          ? (currentPlayer?.base_price || config.min_bid)
          : state.current_highest_bid + config.min_bid_increment,
      };

      this.io.to(`captain_${team.id}`).emit('auction:state_sync', captainPayload);
    }
  }

  public logAudit(
    eventType: string,
    actor: string,
    playerId: string | null,
    teamId: string | null,
    details: any
  ) {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO audit_logs (id, event_type, actor, player_id, team_id, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, eventType, actor, playerId, teamId, JSON.stringify(details));
  }
}

export const auctionEngine = new AuctionEngine();
