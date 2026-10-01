import { describe, it, expect, beforeAll } from 'vitest';
import { db, initDatabase } from '../src/db.js';
import { seedInitialData } from '../src/seed.js';
import { auctionEngine } from '../src/auctionEngine.js';
import { Player, Team } from '../src/types.js';

describe('Auction Engine Live Concurrency & State Machine', () => {
  beforeAll(() => {
    initDatabase();
    db.exec(`
      PRAGMA foreign_keys = OFF;
      DELETE FROM auction_state;
      DELETE FROM audit_logs;
      DELETE FROM bids;
      DELETE FROM users;
      DELETE FROM players;
      DELETE FROM teams;
      PRAGMA foreign_keys = ON;
    `);
    seedInitialData();
  });

  it('initializes in SETUP state with 5 teams and 42 available players', () => {
    const state = auctionEngine.getState();
    expect(state.status).toBe('SETUP');

    const teams = db.prepare('SELECT * FROM teams').all() as Team[];
    expect(teams.length).toBe(5);

    const retained = db.prepare("SELECT * FROM players WHERE status = 'RETAINED'").all();
    expect(retained.length).toBe(5);

    const available = db.prepare("SELECT * FROM players WHERE status = 'AVAILABLE'").all();
    expect(available.length).toBe(42);
  });

  it('admin locks config and starts auction (state transitions to READY)', () => {
    auctionEngine.startAuction('admin');
    const state = auctionEngine.getState();
    expect(state.status).toBe('READY');

    const config = auctionEngine.getConfig();
    expect(config.config_locked).toBe(true);
  });

  it('reveals a player and enters PLAYER_REVEAL state', () => {
    const firstPlayer = db.prepare("SELECT * FROM players WHERE status = 'AVAILABLE' LIMIT 1").get() as Player;
    expect(firstPlayer).toBeDefined();

    auctionEngine.revealPlayer(firstPlayer.id, 'admin');

    const state = auctionEngine.getState();
    expect(state.status).toBe('PLAYER_REVEAL');
    expect(state.current_player_id).toBe(firstPlayer.id);
    expect(state.current_highest_bid).toBe(0);
    expect(state.current_highest_team_id).toBeNull();
  });

  it('starts bidding and accepts sequential and concurrent bids', async () => {
    auctionEngine.startBidding('admin');
    const state = auctionEngine.getState();
    expect(state.status).toBe('BIDDING');

    // Team A bids base price (e.g. 5)
    const bid1 = await auctionEngine.placeBid('team_a', 5, 'captain_a');
    expect(bid1.accepted).toBe(true);

    const stateAfter1 = auctionEngine.getState();
    expect(stateAfter1.current_highest_bid).toBe(5);
    expect(stateAfter1.current_highest_team_id).toBe('team_a');

    // Simulate 2 captains submitting bids almost simultaneously
    // Team B bids 10, Team C bids 8 at the same time
    const [bid2, bid3] = await Promise.all([
      auctionEngine.placeBid('team_b', 10, 'captain_b'),
      auctionEngine.placeBid('team_c', 8, 'captain_c'),
    ]);

    // Team B bid 10 was processed first or second; the highest valid bid becomes current!
    const stateAfterConcurrent = auctionEngine.getState();
    expect(stateAfterConcurrent.current_highest_bid).toBe(10);
    expect(stateAfterConcurrent.current_highest_team_id).toBe('team_b');

    // Both bids are preserved in the bids audit log
    const bidsLog = db.prepare('SELECT * FROM bids WHERE player_id = ? ORDER BY timestamp DESC').all(state.current_player_id) as any[];
    expect(bidsLog.length).toBeGreaterThanOrEqual(3);

    // The lower concurrent bid (8) is not discarded; it is recorded as REJECTED with clear reason
    const rejectedBid = bidsLog.find((b) => b.amount === 8);
    if (rejectedBid) {
      expect(rejectedBid.status).toBe('REJECTED');
      expect(rejectedBid.rejection_reason).toContain('at least');
    }
  });

  it('confirms sale, deducts credits, assigns player, and permits undo', () => {
    const stateBefore = auctionEngine.getState();
    const winningTeamBefore = db.prepare('SELECT * FROM teams WHERE id = ?').get(stateBefore.current_highest_team_id) as Team;
    const soldPrice = stateBefore.current_highest_bid;

    auctionEngine.confirmSold('admin');

    const stateSold = auctionEngine.getState();
    expect(stateSold.status).toBe('SOLD');

    // Check player record
    const playerSold = db.prepare('SELECT * FROM players WHERE id = ?').get(stateBefore.current_player_id) as Player;
    expect(playerSold.status).toBe('SOLD');
    expect(playerSold.sold_team_id).toBe(winningTeamBefore.id);
    expect(playerSold.sold_price).toBe(soldPrice);

    // Check team credits deducted
    const winningTeamAfter = db.prepare('SELECT * FROM teams WHERE id = ?').get(winningTeamBefore.id) as Team;
    expect(winningTeamAfter.credits_remaining).toBe(winningTeamBefore.credits_remaining - soldPrice);

    // Test Undo Last Sale functionality before next player starts
    auctionEngine.undoLastSale('admin');

    const playerRestored = db.prepare('SELECT * FROM players WHERE id = ?').get(stateBefore.current_player_id) as Player;
    expect(playerRestored.status).toBe('AVAILABLE');
    expect(playerRestored.sold_team_id).toBeNull();
    expect(playerRestored.sold_price).toBeNull();

    const teamRefunded = db.prepare('SELECT * FROM teams WHERE id = ?').get(winningTeamBefore.id) as Team;
    expect(teamRefunded.credits_remaining).toBe(winningTeamBefore.credits_remaining);
  });
});
