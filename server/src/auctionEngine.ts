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

  public parseConfig(configJson: any): AuctionConfig {
    if (!configJson) return DEFAULT_CONFIG;
    if (typeof configJson === 'object') return { ...DEFAULT_CONFIG, ...configJson };
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(configJson) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  public async getState(): Promise<AuctionStateRecord> {
    const row = await db.queryOne<AuctionStateRecord>('SELECT * FROM auction_state WHERE id = 1');
    if (!row) {
      throw new Error('Auction state record not initialized.');
    }
    return row;
  }

  public async getConfig(): Promise<AuctionConfig> {
    const state = await this.getState();
    return this.parseConfig(state.config_json);
  }

  public async updateConfig(newConfig: Partial<AuctionConfig>, actor: string): Promise<void> {
    const current = await this.getConfig();
    if (current.config_locked) {
      throw new Error('Auction configuration is locked and cannot be changed.');
    }
    const updated = { ...current, ...newConfig };
    const jsonStr = JSON.stringify(updated);
    await db.execute('UPDATE auction_state SET config_json = ? WHERE id = 1', [jsonStr]);
    await this.logAudit('CONFIG_UPDATED', actor, null, null, { newConfig: updated });
    await this.broadcastState();
  }

  public async lockConfig(actor: string): Promise<void> {
    const config = await this.getConfig();
    config.config_locked = true;
    const jsonStr = JSON.stringify(config);
    await db.execute('UPDATE auction_state SET config_json = ?, status = ? WHERE id = 1', [
      jsonStr,
      'READY',
    ]);
    await this.logAudit('CONFIG_LOCKED', actor, null, null, { config });
    await this.broadcastState();
  }

  public async startAuction(actor: string): Promise<void> {
    const state = await this.getState();
    if (state.status === 'SETUP') {
      await this.lockConfig(actor);
    }
    await db.execute('UPDATE auction_state SET status = ? WHERE id = 1', ['READY']);
    await this.logAudit('AUCTION_STARTED', actor, null, null, {});
    await this.broadcastState();
  }

  public async pauseAuction(actor: string): Promise<void> {
    const state = await this.getState();
    if (state.status !== 'BIDDING') return;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    await db.execute('UPDATE auction_state SET status = ?, timer_paused = 1 WHERE id = 1', ['PAUSED']);
    await this.logAudit('AUCTION_PAUSED', actor, state.current_player_id, null, {
      remaining: state.timer_remaining,
    });
    await this.broadcastState();
  }

  public async resumeAuction(actor: string): Promise<void> {
    const state = await this.getState();
    if (state.status !== 'PAUSED') return;

    await db.execute('UPDATE auction_state SET status = ?, timer_paused = 0 WHERE id = 1', ['BIDDING']);
    await this.logAudit('AUCTION_RESUMED', actor, state.current_player_id, null, {
      remaining: state.timer_remaining,
    });
    this.startTimerCountdown();
    await this.broadcastState();
  }

  public async extendTimer(seconds: number, actor: string): Promise<void> {
    const state = await this.getState();
    if (state.status !== 'BIDDING' && state.status !== 'PAUSED') return;

    const newTimer = state.timer_remaining + seconds;
    await db.execute('UPDATE auction_state SET timer_remaining = ? WHERE id = 1', [newTimer]);
    await this.logAudit('TIMER_EXTENDED', actor, state.current_player_id, null, {
      addedSeconds: seconds,
      newTimer,
    });
    this.broadcastTimer(newTimer);
    await this.broadcastState();
  }

  public async revealPlayer(playerId: string, actor: string): Promise<void> {
    this.stopTimer();

    const player = await db.queryOne<Player>('SELECT * FROM players WHERE id = ?', [playerId]);
    if (!player) throw new Error('Player not found.');
    if (player.status !== 'AVAILABLE' && player.status !== 'UNSOLD') {
      throw new Error(`Cannot auction player with status: ${player.status}`);
    }

    const config = await this.getConfig();

    await db.transaction(async (tx) => {
      await tx.execute("UPDATE players SET status = 'AUCTIONING' WHERE id = ?", [playerId]);
      await tx.execute(
        `UPDATE auction_state
         SET status = 'PLAYER_REVEAL',
             current_player_id = ?,
             current_highest_bid = 0,
             current_highest_team_id = NULL,
             timer_remaining = ?,
             timer_paused = 0
         WHERE id = 1`,
        [playerId, config.auction_timer_seconds]
      );
    });

    await this.logAudit('PLAYER_REVEALED', actor, playerId, null, {
      name: player.name,
      base_price: player.base_price,
      gender: player.gender,
      position: player.position,
    });

    await this.broadcastState();
  }

  public async startBidding(actor: string): Promise<void> {
    const state = await this.getState();
    if (!state.current_player_id) throw new Error('No player selected.');

    const config = await this.getConfig();
    await db.execute(
      `UPDATE auction_state
       SET status = 'BIDDING',
           timer_remaining = ?,
           timer_paused = 0
       WHERE id = 1`,
      [config.auction_timer_seconds]
    );

    await this.logAudit('BIDDING_STARTED', actor, state.current_player_id, null, {
      timer: config.auction_timer_seconds,
    });

    this.startTimerCountdown();
    await this.broadcastState();
  }

  /**
   * Concurrency-safe atomic bid placement using:
   * 1. In-process FIFO queue (bidQueue) for sequential processing on this node instance.
   * 2. Transactional row-level locking (SELECT ... FOR UPDATE) on PostgreSQL auction_state and teams.
   */
  public async placeBid(
    teamId: string,
    amount: number,
    actor: string
  ): Promise<{ accepted: boolean; reason?: string }> {
    return new Promise((resolve) => {
      this.bidQueue = this.bidQueue
        .then(async () => {
          const result = await this.executeBidTransaction(teamId, amount, actor);
          resolve(result);
        })
        .catch((err) => {
          resolve({ accepted: false, reason: err.message || 'Internal bid error.' });
        });
    });
  }

  private async executeBidTransaction(
    teamId: string,
    amount: number,
    actor: string
  ): Promise<{ accepted: boolean; reason?: string }> {
    return await db.transaction(async (tx) => {
      // 1. Exclusive row lock on auction_state to serialize concurrent attempts
      const state = await tx.queryOne<AuctionStateRecord>(
        'SELECT * FROM auction_state WHERE id = 1 FOR UPDATE'
      );
      if (!state) {
        return { accepted: false, reason: 'Auction state not found.' };
      }

      const config = this.parseConfig(state.config_json);

      // 2. Validate current phase
      if (state.status !== 'BIDDING') {
        return { accepted: false, reason: `Bidding is closed. Current auction status is ${state.status}.` };
      }

      if (!state.current_player_id) {
        return { accepted: false, reason: 'No player is currently on the auction block.' };
      }

      // 3. Exclusive row lock on the bidding team
      const team = await tx.queryOne<Team>(
        'SELECT * FROM teams WHERE id = ? FOR UPDATE',
        [teamId]
      );
      if (!team) {
        return { accepted: false, reason: 'Team not found.' };
      }

      // 4. Retrieve current player
      const player = await tx.queryOne<Player>(
        'SELECT * FROM players WHERE id = ?',
        [state.current_player_id]
      );

      // 5. Retrieve team's retained player and already purchased players
      const retainedPlayer = await tx.queryOne<Player>(
        "SELECT * FROM players WHERE sold_team_id = ? AND status = 'RETAINED'",
        [teamId]
      );
      const purchasedPlayers = await tx.query<Player>(
        "SELECT * FROM players WHERE sold_team_id = ? AND status = 'SOLD'",
        [teamId]
      );

      // 6. Authoritative business rules validation
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
        // Record rejected bid in bids table for audit
        await tx.execute(
          `INSERT INTO bids (id, player_id, team_id, amount, previous_highest_bid, status, rejection_reason)
           VALUES (?, ?, ?, ?, ?, 'REJECTED', ?)`,
          [bidId, state.current_player_id, teamId, amount, previousHighest, validation.reason]
        );

        await this.logAudit('BID_REJECTED', actor, state.current_player_id, teamId, {
          amount,
          previousHighest,
          reason: validation.reason,
        });

        return validation;
      }

      // ACCEPTED BID: Execute atomic update
      await tx.execute(
        `INSERT INTO bids (id, player_id, team_id, amount, previous_highest_bid, status, rejection_reason)
         VALUES (?, ?, ?, ?, ?, 'ACCEPTED', NULL)`,
        [bidId, state.current_player_id, teamId, amount, previousHighest]
      );

      await tx.execute(
        `UPDATE auction_state
         SET current_highest_bid = ?,
             current_highest_team_id = ?,
             timer_remaining = ?
         WHERE id = 1`,
        [amount, teamId, config.auction_timer_seconds]
      );

      await this.logAudit('BID_ACCEPTED', actor, state.current_player_id, teamId, {
        amount,
        previousHighest,
        newHighestBidder: team.name,
      });

      // Reset countdown timer
      this.startTimerCountdown();
      await this.broadcastState();

      return { accepted: true };
    });
  }

  public async confirmSold(actor: string): Promise<void> {
    this.stopTimer();

    await db.transaction(async (tx) => {
      const state = await tx.queryOne<AuctionStateRecord>(
        'SELECT * FROM auction_state WHERE id = 1 FOR UPDATE'
      );
      if (!state || !state.current_player_id || !state.current_highest_team_id || state.current_highest_bid <= 0) {
        throw new Error('No winning bid to confirm.');
      }

      const playerId = state.current_player_id;
      const teamId = state.current_highest_team_id;
      const winningBid = state.current_highest_bid;

      const player = await tx.queryOne<Player>('SELECT * FROM players WHERE id = ? FOR UPDATE', [playerId]);
      const team = await tx.queryOne<Team>('SELECT * FROM teams WHERE id = ? FOR UPDATE', [teamId]);
      if (!player || !team) throw new Error('Player or team not found.');

      if (team.credits_remaining < winningBid) {
        throw new Error(`Team ${team.name} has insufficient credits (${team.credits_remaining}) for winning bid ${winningBid}.`);
      }

      // 1. Update player status
      await tx.execute(
        `UPDATE players SET status = 'SOLD', sold_team_id = ?, sold_price = ? WHERE id = ?`,
        [teamId, winningBid, playerId]
      );

      // 2. Deduct credits from winning team
      await tx.execute(
        `UPDATE teams SET credits_remaining = credits_remaining - ? WHERE id = ?`,
        [winningBid, teamId]
      );

      // 3. Record in sales table
      const saleId = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await tx.execute(
        `INSERT INTO sales (id, player_id, team_id, price, status, confirmed_by)
         VALUES (?, ?, ?, ?, 'CONFIRMED', ?)`,
        [saleId, playerId, teamId, winningBid, actor]
      );

      // 4. Update auction state
      await tx.execute(
        `UPDATE auction_state
         SET status = 'SOLD',
             last_sold_player_id = ?,
             last_sold_team_id = ?,
             last_sold_price = ?
         WHERE id = 1`,
        [playerId, teamId, winningBid]
      );

      await this.logAudit('SALE_CONFIRMED', actor, playerId, teamId, {
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
    });

    await this.broadcastState();
  }

  public async markUnsold(actor: string): Promise<void> {
    this.stopTimer();
    let unsoldPlayer: Player | null = null;

    await db.transaction(async (tx) => {
      const state = await tx.queryOne<AuctionStateRecord>(
        'SELECT * FROM auction_state WHERE id = 1 FOR UPDATE'
      );
      if (!state || !state.current_player_id) throw new Error('No player on auction.');

      const playerId = state.current_player_id;
      unsoldPlayer = await tx.queryOne<Player>('SELECT * FROM players WHERE id = ? FOR UPDATE', [playerId]);

      await tx.execute(
        "UPDATE players SET status = 'UNSOLD', sold_team_id = NULL, sold_price = NULL WHERE id = ?",
        [playerId]
      );

      await tx.execute(
        `UPDATE auction_state
         SET status = 'UNSOLD',
             current_highest_bid = 0,
             current_highest_team_id = NULL
         WHERE id = 1`
      );

      await this.logAudit('PLAYER_UNSOLD', actor, playerId, null, {
        playerName: unsoldPlayer ? unsoldPlayer.name : playerId,
      });
    });

    if (this.io && unsoldPlayer) {
      this.io.emit('auction:unsold', { player: unsoldPlayer });
    }

    await this.broadcastState();
  }

  public async undoLastSale(actor: string): Promise<void> {
    await db.transaction(async (tx) => {
      const state = await tx.queryOne<AuctionStateRecord>(
        'SELECT * FROM auction_state WHERE id = 1 FOR UPDATE'
      );
      if (!state || !state.last_sold_player_id || !state.last_sold_team_id || !state.last_sold_price) {
        throw new Error('No recent sale available to undo.');
      }

      // Only allow undo if next player has not started bidding
      if (state.status === 'BIDDING') {
        throw new Error('Cannot undo sale while another player is currently in active bidding.');
      }

      const playerId = state.last_sold_player_id;
      const teamId = state.last_sold_team_id;
      const price = state.last_sold_price;

      const player = await tx.queryOne<Player>('SELECT * FROM players WHERE id = ? FOR UPDATE', [playerId]);
      const team = await tx.queryOne<Team>('SELECT * FROM teams WHERE id = ? FOR UPDATE', [teamId]);

      // 1. Reset player to AVAILABLE
      await tx.execute(
        "UPDATE players SET status = 'AVAILABLE', sold_team_id = NULL, sold_price = NULL WHERE id = ?",
        [playerId]
      );

      // 2. Refund team credits
      await tx.execute(
        'UPDATE teams SET credits_remaining = credits_remaining + ? WHERE id = ?',
        [price, teamId]
      );

      // 3. Mark sales record as UNDONE
      await tx.execute(
        `UPDATE sales SET status = 'UNDONE', undone_at = CURRENT_TIMESTAMP, undone_by = ?
         WHERE player_id = ? AND team_id = ? AND status = 'CONFIRMED'`,
        [actor, playerId, teamId]
      );

      // 4. Clear last sold from state
      await tx.execute(
        `UPDATE auction_state
         SET last_sold_player_id = NULL,
             last_sold_team_id = NULL,
             last_sold_price = NULL
         WHERE id = 1`
      );

      await this.logAudit('SALE_UNDONE', actor, playerId, teamId, {
        playerName: player ? player.name : playerId,
        teamName: team ? team.name : teamId,
        refundedPrice: price,
      });
    });

    await this.broadcastState();
  }

  private startTimerCountdown() {
    this.stopTimer();

    this.timerInterval = setInterval(async () => {
      try {
        const state = await this.getState();
        if (state.status !== 'BIDDING' || state.timer_paused === 1) {
          this.stopTimer();
          return;
        }

        const nextRemaining = state.timer_remaining - 1;

        if (nextRemaining <= 0) {
          this.stopTimer();
          await db.execute('UPDATE auction_state SET timer_remaining = 0 WHERE id = 1');
          this.broadcastTimer(0);

          if (state.current_highest_bid > 0 && state.current_highest_team_id) {
            // Timer reached 0 with a winning bidder -> SOLD_PENDING_CONFIRMATION
            await db.execute("UPDATE auction_state SET status = 'SOLD_PENDING_CONFIRMATION' WHERE id = 1");
            await this.logAudit('TIMER_EXPIRED', 'system', state.current_player_id, state.current_highest_team_id, {
              highestBid: state.current_highest_bid,
            });
          } else {
            // 0 bids placed -> auto-transition to UNSOLD
            await this.markUnsold('system');
            return;
          }

          await this.broadcastState();
        } else {
          await db.execute('UPDATE auction_state SET timer_remaining = ? WHERE id = 1', [nextRemaining]);
          this.broadcastTimer(nextRemaining);
        }
      } catch (err) {
        console.error('Error during timer tick:', err);
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

  public async broadcastState(): Promise<void> {
    if (!this.io) return;

    try {
      const state = await this.getState();
      const config = await this.getConfig();
      const currentPlayer = state.current_player_id
        ? await db.queryOne<Player>('SELECT * FROM players WHERE id = ?', [state.current_player_id])
        : null;

      // 1. PUBLIC DISPLAY PAYLOAD (Strictly no team budgets, no current bidder identity)
      let lastSoldPlayer: Player | null = null;
      let lastSoldTeam: Team | null = null;
      if (state.last_sold_player_id && state.last_sold_team_id) {
        lastSoldPlayer = await db.queryOne<Player>('SELECT * FROM players WHERE id = ?', [state.last_sold_player_id]);
        lastSoldTeam = await db.queryOne<Team>('SELECT * FROM teams WHERE id = ?', [state.last_sold_team_id]);
      }

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
        lastSold: lastSoldPlayer && lastSoldTeam
          ? {
              player: lastSoldPlayer,
              team: { id: lastSoldTeam.id, name: lastSoldTeam.name },
              price: state.last_sold_price,
            }
          : null,
      };
      this.io.to('display').emit('auction:state_sync', publicPayload);

      // 2. ADMIN PAYLOAD (Full visibility, all team summaries, full bid logs)
      const allTeams = await db.query<Team>('SELECT * FROM teams');
      const teamSummaries: TeamSquadSummary[] = [];

      for (const team of allTeams) {
        const retained = await db.queryOne<Player>(
          "SELECT * FROM players WHERE sold_team_id = ? AND status = 'RETAINED'",
          [team.id]
        );
        const purchased = await db.query<Player>(
          "SELECT * FROM players WHERE sold_team_id = ? AND status = 'SOLD'",
          [team.id]
        );
        teamSummaries.push(
          calculateSquadSummary(
            team,
            retained,
            purchased,
            config,
            currentPlayer,
            state.current_highest_team_id
          )
        );
      }

      let recentBids: Bid[] = [];
      if (state.current_player_id) {
        recentBids = await db.query<Bid>(
          `SELECT b.*, t.name as team_name, t.captain_name
           FROM bids b
           JOIN teams t ON b.team_id = t.id
           WHERE b.player_id = ?
           ORDER BY b.timestamp DESC
           LIMIT 20`,
          [state.current_player_id]
        );
      }

      let currentHighestTeamName: string | null = null;
      if (state.current_highest_team_id) {
        const hTeam = await db.queryOne<Team>('SELECT name FROM teams WHERE id = ?', [state.current_highest_team_id]);
        currentHighestTeamName = hTeam ? hTeam.name : null;
      }

      const adminPayload = {
        ...publicPayload,
        currentHighestTeamId: state.current_highest_team_id,
        currentHighestTeamName,
        teamSummaries,
        recentBids,
        config,
        canUndo: !!state.last_sold_player_id && state.status !== 'BIDDING',
      };
      this.io.to('admin').emit('auction:state_sync', adminPayload);

      // 3. CAPTAIN PAYLOADS (Private room per team: captain_<teamId>)
      for (const team of allTeams) {
        const retained = await db.queryOne<Player>(
          "SELECT * FROM players WHERE sold_team_id = ? AND status = 'RETAINED'",
          [team.id]
        );
        const purchased = await db.query<Player>(
          "SELECT * FROM players WHERE sold_team_id = ? AND status = 'SOLD'",
          [team.id]
        );
        const summary = calculateSquadSummary(
          team,
          retained,
          purchased,
          config,
          currentPlayer,
          state.current_highest_team_id
        );

        let captainHighestBid = 0;
        if (state.current_player_id) {
          const maxRow = await db.queryOne<{ max_bid: number }>(
            `SELECT MAX(amount) as max_bid
             FROM bids
             WHERE player_id = ? AND team_id = ? AND status = 'ACCEPTED'`,
            [state.current_player_id, team.id]
          );
          captainHighestBid = maxRow?.max_bid || 0;
        }

        const isCurrentHighest = state.current_highest_team_id === team.id;

        const captainPayload = {
          status: state.status,
          currentPlayer: publicPayload.currentPlayer,
          currentHighestBid: state.current_highest_bid,
          timerRemaining: state.timer_remaining,
          timerPaused: state.timer_paused === 1,
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
    } catch (err) {
      console.error('Error during broadcastState:', err);
    }
  }

  public async logAudit(
    eventType: string,
    actor: string,
    playerId: string | null,
    teamId: string | null,
    details: any
  ): Promise<void> {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const detailsJson = typeof details === 'string' ? details : JSON.stringify(details);
    await db.execute(
      `INSERT INTO audit_logs (id, event_type, actor, player_id, team_id, details_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, eventType, actor, playerId, teamId, detailsJson]
    );
  }
}

export const auctionEngine = new AuctionEngine();
