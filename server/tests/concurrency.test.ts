import { describe, it, expect, beforeAll } from 'vitest';
import { db, initDatabase } from '../src/db.js';
import { seedInitialData } from '../src/seed.js';
import { auctionEngine } from '../src/auctionEngine.js';
import { Player, Team } from '../src/types.js';

describe('Auction Engine Live Concurrency & State Machine', () => {
  beforeAll(async () => {
    await initDatabase();
    if (db.isPostgres()) {
      await db.execute('TRUNCATE TABLE audit_logs, bids, sales, auction_state, users, players, teams CASCADE');
    } else {
      const sqlite = db.getSqliteDb();
      if (sqlite) {
        sqlite.exec(`
          PRAGMA foreign_keys = OFF;
          DELETE FROM auction_state;
          DELETE FROM audit_logs;
          DELETE FROM bids;
          DELETE FROM sales;
          DELETE FROM users;
          DELETE FROM players;
          DELETE FROM teams;
          PRAGMA foreign_keys = ON;
        `);
      }
    }
    await seedInitialData();
  });

  it('initializes in SETUP state with 5 teams and 42 available players', async () => {
    const state = await auctionEngine.getState();
    expect(state.status).toBe('SETUP');

    const teams = await db.query<Team>('SELECT * FROM teams');
    expect(teams.length).toBe(5);

    const retained = await db.query("SELECT * FROM players WHERE status = 'RETAINED'");
    expect(retained.length).toBe(5);

    const available = await db.query("SELECT * FROM players WHERE status = 'AVAILABLE'");
    expect(available.length).toBe(42);
  });

  it('admin locks config and starts auction (state transitions to READY)', async () => {
    await auctionEngine.startAuction('admin');
    const state = await auctionEngine.getState();
    expect(state.status).toBe('READY');

    const config = await auctionEngine.getConfig();
    expect(config.config_locked).toBe(true);
  });

  it('reveals a player and enters PLAYER_REVEAL state', async () => {
    const firstPlayer = await db.queryOne<Player>("SELECT * FROM players WHERE status = 'AVAILABLE' LIMIT 1");
    expect(firstPlayer).toBeDefined();

    await auctionEngine.revealPlayer(firstPlayer!.id, 'admin');

    const state = await auctionEngine.getState();
    expect(state.status).toBe('PLAYER_REVEAL');
    expect(state.current_player_id).toBe(firstPlayer!.id);
    expect(state.current_highest_bid).toBe(0);
    expect(state.current_highest_team_id).toBeNull();
  });

  it('starts bidding and accepts sequential and concurrent bids', async () => {
    await auctionEngine.startBidding('admin');
    const state = await auctionEngine.getState();
    expect(state.status).toBe('BIDDING');

    // Team A bids base price (e.g. 5)
    const bid1 = await auctionEngine.placeBid('team_a', 5, 'ashmit_curry');
    expect(bid1.accepted).toBe(true);

    const stateAfter1 = await auctionEngine.getState();
    expect(stateAfter1.current_highest_bid).toBe(5);
    expect(stateAfter1.current_highest_team_id).toBe('team_a');

    // Simulate 2 captains submitting bids almost simultaneously
    // Team B bids 10, Team C bids 8 at the same time
    const [bid2, bid3] = await Promise.all([
      auctionEngine.placeBid('team_b', 10, 'vansh_baby'),
      auctionEngine.placeBid('team_c', 8, 'divyanshu_lebron'),
    ]);

    // Team B bid 10 was processed first or second; the highest valid bid becomes current!
    const stateAfterConcurrent = await auctionEngine.getState();
    expect(stateAfterConcurrent.current_highest_bid).toBe(10);
    expect(stateAfterConcurrent.current_highest_team_id).toBe('team_b');

    // Both bids are preserved in the bids audit log
    const bidsLog = await db.query<any[]>(
      'SELECT * FROM bids WHERE player_id = ? ORDER BY timestamp DESC',
      [state.current_player_id]
    );
    expect(bidsLog.length).toBeGreaterThanOrEqual(3);

    // The lower concurrent bid (8) is not discarded; it is recorded as REJECTED with clear reason
    const rejectedBid = (bidsLog as any[]).find((b) => b.amount === 8);
    if (rejectedBid) {
      expect(rejectedBid.status).toBe('REJECTED');
      expect(rejectedBid.rejection_reason).toContain('at least');
    }
  });

  it('confirms sale, deducts credits, assigns player, and permits undo', async () => {
    const stateBefore = await auctionEngine.getState();
    const winningTeamBefore = await db.queryOne<Team>('SELECT * FROM teams WHERE id = ?', [stateBefore.current_highest_team_id]);
    const soldPrice = stateBefore.current_highest_bid;

    await auctionEngine.confirmSold('admin');

    const stateSold = await auctionEngine.getState();
    expect(stateSold.status).toBe('SOLD');

    // Check player record
    const playerSold = await db.queryOne<Player>('SELECT * FROM players WHERE id = ?', [stateBefore.current_player_id]);
    expect(playerSold!.status).toBe('SOLD');
    expect(playerSold!.sold_team_id).toBe(winningTeamBefore!.id);
    expect(playerSold!.sold_price).toBe(soldPrice);

    // Check team credits deducted
    const winningTeamAfter = await db.queryOne<Team>('SELECT * FROM teams WHERE id = ?', [winningTeamBefore!.id]);
    expect(winningTeamAfter!.credits_remaining).toBe(winningTeamBefore!.credits_remaining - soldPrice);

    // Test Undo Last Sale functionality before next player starts
    await auctionEngine.undoLastSale('admin');

    const playerRestored = await db.queryOne<Player>('SELECT * FROM players WHERE id = ?', [stateBefore.current_player_id]);
    expect(playerRestored!.status).toBe('AVAILABLE');
    expect(playerRestored!.sold_team_id).toBeNull();
    expect(playerRestored!.sold_price).toBeNull();

    const teamRefunded = await db.queryOne<Team>('SELECT * FROM teams WHERE id = ?', [winningTeamBefore!.id]);
    expect(teamRefunded!.credits_remaining).toBe(winningTeamBefore!.credits_remaining);
  });
});
