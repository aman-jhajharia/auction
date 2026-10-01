import { describe, it, expect } from 'vitest';
import {
  calculateMaxLegalBid,
  calculateSquadSummary,
  validateBidAttempt,
  DEFAULT_CONFIG,
} from '../src/validation.js';
import { Team, Player } from '../src/types.js';

describe('Muqabla Auction Validation & Rules Engine', () => {
  const sampleTeamMaleCaptain: Team = {
    id: 'team_a',
    name: 'Team Spartans',
    captain_name: 'Aman',
    captain_gender: 'Male',
    starting_credits: 100,
    credits_remaining: 100,
  };

  const sampleTeamFemaleCaptain: Team = {
    id: 'team_b',
    name: 'Team Titans',
    captain_name: 'Priya',
    captain_gender: 'Female',
    starting_credits: 100,
    credits_remaining: 100,
  };

  const sampleRetainedMale: Player = {
    id: 'p_ret_m',
    name: 'Rahul Sharma',
    gender: 'Male',
    position: 'Guard',
    base_price: 5,
    status: 'RETAINED',
    queue_order: 0,
  };

  const sampleRetainedFemale: Player = {
    id: 'p_ret_f',
    name: 'Ananya Verma',
    gender: 'Female',
    position: 'Forward',
    base_price: 5,
    status: 'RETAINED',
    queue_order: 0,
  };

  const sampleTargetMale: Player = {
    id: 'p_target_m',
    name: 'Arjun Singh',
    gender: 'Male',
    position: 'Center',
    base_price: 5,
    status: 'AUCTIONING',
    queue_order: 1,
  };

  const sampleTargetFemale: Player = {
    id: 'p_target_f',
    name: 'Riya Mehta',
    gender: 'Female',
    position: 'Guard',
    base_price: 5,
    status: 'AUCTIONING',
    queue_order: 2,
  };

  describe('Budget & Minimum Squad Reservation (Specification Examples)', () => {
    it('Example 1: Starts with 100 credits, 0 auctioned players (team size 2) -> max first bid is 98', () => {
      // Team has male captain, female retained -> female satisfied
      const res = calculateMaxLegalBid(
        sampleTeamMaleCaptain,
        sampleRetainedFemale,
        [],
        sampleTargetMale,
        DEFAULT_CONFIG
      );

      // Remaining needed after this purchase: 5 - 3 = 2 players. Each min 1 credit = 2 reserved credits.
      // Max bid = 100 - 2 = 98 credits.
      expect(res.valid).toBe(true);
      expect(res.max_legal_bid).toBe(98);
    });

    it('Example 2: 99 credits remaining, 1 auctioned player (team size 3) -> max next bid is 98', () => {
      const teamWith99: Team = { ...sampleTeamMaleCaptain, credits_remaining: 99 };
      const purchased1: Player[] = [
        { id: 'p1', name: 'Player 1', gender: 'Female', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 1 },
      ];

      // After buying next, team size is 4. Needed to 5 = 1 player. Reserved = 1 credit.
      // Max bid = 99 - 1 = 98 credits.
      const res = calculateMaxLegalBid(
        teamWith99,
        sampleRetainedMale,
        purchased1,
        sampleTargetMale,
        DEFAULT_CONFIG
      );

      expect(res.valid).toBe(true);
      expect(res.max_legal_bid).toBe(98);
    });

    it('Example 3: 98 credits remaining, 2 auctioned players (team size 4) -> max next bid is 98', () => {
      const teamWith98: Team = { ...sampleTeamMaleCaptain, credits_remaining: 98 };
      const purchased2: Player[] = [
        { id: 'p1', name: 'Player 1', gender: 'Female', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 1 },
        { id: 'p2', name: 'Player 2', gender: 'Male', position: 'Center', base_price: 1, status: 'SOLD', queue_order: 2 },
      ];

      // After buying next, team size is 5 (minimum reached). Reserved = 0 credits.
      // Max bid = 98 credits.
      const res = calculateMaxLegalBid(
        teamWith98,
        sampleRetainedMale,
        purchased2,
        sampleTargetMale,
        DEFAULT_CONFIG
      );

      expect(res.valid).toBe(true);
      expect(res.max_legal_bid).toBe(98);
    });
  });

  describe('Female Player Compulsory Requirement', () => {
    it('allows full credit spending on male player if Captain is female', () => {
      // Captain is female, so female requirement is already satisfied.
      // 0 auctioned players. Team size 2. Target is male.
      const res = calculateMaxLegalBid(
        sampleTeamFemaleCaptain,
        sampleRetainedMale,
        [],
        sampleTargetMale,
        DEFAULT_CONFIG
      );
      // Needs 2 more players to reach 5. Reserved = 2 credits.
      expect(res.max_legal_bid).toBe(98);
    });

    it('allows full credit spending on male player if Retained player is female', () => {
      // Captain is male, Retained is female. Female satisfied!
      const res = calculateMaxLegalBid(
        sampleTeamMaleCaptain,
        sampleRetainedFemale,
        [],
        sampleTargetMale,
        DEFAULT_CONFIG
      );
      expect(res.max_legal_bid).toBe(98);
    });

    it('requires reserving 1 credit for future female player if team reaches min size (5) but has NO female player', () => {
      // Captain Male, Retained Male, 2 Male purchased players -> total 4 players, 0 female.
      // Buying 1 more Male player would bring team size to 5 (min total reached).
      // BUT team still has 0 female players! They MUST acquire a female player before hitting 8.
      // So they MUST reserve at least 1 credit for that mandatory future female player!
      const team: Team = { ...sampleTeamMaleCaptain, credits_remaining: 50 };
      const twoMalePurchased: Player[] = [
        { id: 'p1', name: 'M1', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 1 },
        { id: 'p2', name: 'M2', gender: 'Male', position: 'Forward', base_price: 1, status: 'SOLD', queue_order: 2 },
      ];

      const res = calculateMaxLegalBid(
        team,
        sampleRetainedMale,
        twoMalePurchased,
        sampleTargetMale, // Target is Male
        DEFAULT_CONFIG
      );

      // Remaining credits = 50. Reserved = 1 (for future female). Max legal bid = 49.
      expect(res.valid).toBe(true);
      expect(res.max_legal_bid).toBe(49);
    });

    it('rejects bidding on a Male player when team has 7 players and 0 female players', () => {
      // Team has 7 players (1 Captain + 1 Retained + 5 Male purchased), 0 female players.
      // If they buy an 8th Male player, the roster hits 8/8 without a female player!
      // This is mathematically illegal.
      const team: Team = { ...sampleTeamMaleCaptain, credits_remaining: 30 };
      const fiveMalePurchased: Player[] = [
        { id: 'p1', name: 'M1', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 1 },
        { id: 'p2', name: 'M2', gender: 'Male', position: 'Forward', base_price: 1, status: 'SOLD', queue_order: 2 },
        { id: 'p3', name: 'M3', gender: 'Male', position: 'Center', base_price: 1, status: 'SOLD', queue_order: 3 },
        { id: 'p4', name: 'M4', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 4 },
        { id: 'p5', name: 'M5', gender: 'Male', position: 'Forward', base_price: 1, status: 'SOLD', queue_order: 5 },
      ];

      const res = calculateMaxLegalBid(
        team,
        sampleRetainedMale,
        fiveMalePurchased,
        sampleTargetMale,
        DEFAULT_CONFIG
      );

      expect(res.valid).toBe(false);
      expect(res.max_legal_bid).toBe(0);
      expect(res.reason).toContain('impossible to satisfy the compulsory female player requirement');
    });

    it('allows bidding on a Female player when team has 7 players and 0 female players', () => {
      const team: Team = { ...sampleTeamMaleCaptain, credits_remaining: 30 };
      const fiveMalePurchased: Player[] = [
        { id: 'p1', name: 'M1', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 1 },
        { id: 'p2', name: 'M2', gender: 'Male', position: 'Forward', base_price: 1, status: 'SOLD', queue_order: 2 },
        { id: 'p3', name: 'M3', gender: 'Male', position: 'Center', base_price: 1, status: 'SOLD', queue_order: 3 },
        { id: 'p4', name: 'M4', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 4 },
        { id: 'p5', name: 'M5', gender: 'Male', position: 'Forward', base_price: 1, status: 'SOLD', queue_order: 5 },
      ];

      const res = calculateMaxLegalBid(
        team,
        sampleRetainedMale,
        fiveMalePurchased,
        sampleTargetFemale, // Female target
        DEFAULT_CONFIG
      );

      // Now target is Female, min squad (5) is already met, this purchase completes female requirement and hits 8/8.
      // Max bid = 30 credits!
      expect(res.valid).toBe(true);
      expect(res.max_legal_bid).toBe(30);
    });
  });

  describe('Roster Capacity (Max 8 Players)', () => {
    it('completely rejects any bid when team already has 8 players', () => {
      const team: Team = { ...sampleTeamFemaleCaptain, credits_remaining: 20 };
      const sixPurchased: Player[] = [
        { id: 'p1', name: 'P1', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 1 },
        { id: 'p2', name: 'P2', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 2 },
        { id: 'p3', name: 'P3', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 3 },
        { id: 'p4', name: 'P4', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 4 },
        { id: 'p5', name: 'P5', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 5 },
        { id: 'p6', name: 'P6', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 6 },
      ];

      const res = calculateMaxLegalBid(
        team,
        sampleRetainedMale,
        sixPurchased,
        sampleTargetFemale,
        DEFAULT_CONFIG
      );

      expect(res.valid).toBe(false);
      expect(res.max_legal_bid).toBe(0);
      expect(res.reason).toContain('full');
    });
  });

  describe('Concrete Bid Attempt Validation (validateBidAttempt)', () => {
    it('accepts opening bid equal to or greater than base price', () => {
      const res = validateBidAttempt({
        team: sampleTeamFemaleCaptain,
        retainedPlayer: sampleRetainedMale,
        purchasedPlayers: [],
        currentPlayer: sampleTargetMale, // base price 5
        auctionStatus: 'BIDDING',
        currentHighestBid: 0,
        currentHighestTeamId: null,
        attemptedBid: 5,
        config: DEFAULT_CONFIG,
      });

      expect(res.accepted).toBe(true);
    });

    it('rejects opening bid lower than base price', () => {
      const res = validateBidAttempt({
        team: sampleTeamFemaleCaptain,
        retainedPlayer: sampleRetainedMale,
        purchasedPlayers: [],
        currentPlayer: sampleTargetMale, // base price 5
        auctionStatus: 'BIDDING',
        currentHighestBid: 0,
        currentHighestTeamId: null,
        attemptedBid: 4,
        config: DEFAULT_CONFIG,
      });

      expect(res.accepted).toBe(false);
      expect(res.reason).toContain('base price');
    });

    it('rejects bid if captain is already the highest bidder (no self-outbidding)', () => {
      const res = validateBidAttempt({
        team: sampleTeamFemaleCaptain,
        retainedPlayer: sampleRetainedMale,
        purchasedPlayers: [],
        currentPlayer: sampleTargetMale,
        auctionStatus: 'BIDDING',
        currentHighestBid: 15,
        currentHighestTeamId: sampleTeamFemaleCaptain.id,
        attemptedBid: 20,
        config: DEFAULT_CONFIG,
      });

      expect(res.accepted).toBe(false);
      expect(res.reason).toContain('already the current highest bidder');
    });

    it('rejects subsequent bid that does not exceed current highest bid by minimum increment', () => {
      const res = validateBidAttempt({
        team: sampleTeamMaleCaptain,
        retainedPlayer: sampleRetainedFemale,
        purchasedPlayers: [],
        currentPlayer: sampleTargetMale,
        auctionStatus: 'BIDDING',
        currentHighestBid: 25,
        currentHighestTeamId: 'other_team',
        attemptedBid: 25, // Same as current
        config: DEFAULT_CONFIG,
      });

      expect(res.accepted).toBe(false);
      expect(res.reason).toContain('at least 26');
    });

    it('rejects bid if auction is PAUSED or SOLD', () => {
      const res = validateBidAttempt({
        team: sampleTeamMaleCaptain,
        retainedPlayer: sampleRetainedFemale,
        purchasedPlayers: [],
        currentPlayer: sampleTargetMale,
        auctionStatus: 'PAUSED',
        currentHighestBid: 10,
        currentHighestTeamId: 'other_team',
        attemptedBid: 15,
        config: DEFAULT_CONFIG,
      });

      expect(res.accepted).toBe(false);
      expect(res.reason).toContain('not currently active');
    });
  });

  describe('calculateSquadSummary Team Validity', () => {
    it('marks team as INCOMPLETE when squad size < 5', () => {
      const summary = calculateSquadSummary(
        sampleTeamFemaleCaptain,
        sampleRetainedMale,
        [], // Total 2 players
        DEFAULT_CONFIG
      );

      expect(summary.total_squad_size).toBe(2);
      expect(summary.female_requirement_satisfied).toBe(true);
      expect(summary.is_valid).toBe(false); // < 5 players
      expect(summary.min_additional_players_required).toBe(3);
    });

    it('marks team as INCOMPLETE when squad size is 5 but 0 female players', () => {
      const threeMalePurchased: Player[] = [
        { id: 'p1', name: 'M1', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 1 },
        { id: 'p2', name: 'M2', gender: 'Male', position: 'Forward', base_price: 1, status: 'SOLD', queue_order: 2 },
        { id: 'p3', name: 'M3', gender: 'Male', position: 'Center', base_price: 1, status: 'SOLD', queue_order: 3 },
      ];

      const summary = calculateSquadSummary(
        sampleTeamMaleCaptain,
        sampleRetainedMale,
        threeMalePurchased, // 1 + 1 + 3 = 5 players, all male
        DEFAULT_CONFIG
      );

      expect(summary.total_squad_size).toBe(5);
      expect(summary.female_requirement_satisfied).toBe(false);
      expect(summary.is_valid).toBe(false);
    });

    it('marks team as VALID when squad size >= 5 and at least 1 female player', () => {
      const threePurchasedWithFemale: Player[] = [
        { id: 'p1', name: 'M1', gender: 'Male', position: 'Guard', base_price: 1, status: 'SOLD', queue_order: 1 },
        { id: 'p2', name: 'M2', gender: 'Male', position: 'Forward', base_price: 1, status: 'SOLD', queue_order: 2 },
        { id: 'p3', name: 'F1', gender: 'Female', position: 'Center', base_price: 1, status: 'SOLD', queue_order: 3 },
      ];

      const summary = calculateSquadSummary(
        sampleTeamMaleCaptain,
        sampleRetainedMale,
        threePurchasedWithFemale,
        DEFAULT_CONFIG
      );

      expect(summary.total_squad_size).toBe(5);
      expect(summary.female_requirement_satisfied).toBe(true);
      expect(summary.is_valid).toBe(true);
    });
  });
});
