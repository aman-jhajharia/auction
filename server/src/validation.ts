import { Team, Player, AuctionConfig, ValidationResult, TeamSquadSummary } from './types.js';

export const DEFAULT_CONFIG: AuctionConfig = {
  starting_credits: 100,
  min_total_players: 5,
  max_total_players: 8,
  min_female_players: 1,
  min_auction_players: 3,
  min_bid: 1,
  min_bid_increment: 1,
  auction_timer_seconds: 10,
  config_locked: false,
};

/**
 * Calculates squad composition, credit usage, and female requirement status for a team.
 */
export function calculateSquadSummary(
  team: Team,
  retainedPlayer: Player | null,
  purchasedPlayers: Player[],
  config: AuctionConfig = DEFAULT_CONFIG,
  currentPlayer: Player | null = null,
  currentHighestTeamId: string | null = null
): TeamSquadSummary {
  // Captain counts as 1 player
  const captainGender = team.captain_gender;
  let femaleCount = captainGender === 'Female' ? 1 : 0;

  if (retainedPlayer && retainedPlayer.gender === 'Female') {
    femaleCount += 1;
  }

  for (const p of purchasedPlayers) {
    if (p.gender === 'Female') {
      femaleCount += 1;
    }
  }

  const totalSquadSize = 1 + (retainedPlayer ? 1 : 0) + purchasedPlayers.length;
  const creditsSpent = team.starting_credits - team.credits_remaining;
  const femaleRequirementSatisfied = femaleCount >= config.min_female_players;
  const isValid = totalSquadSize >= config.min_total_players &&
                  totalSquadSize <= config.max_total_players &&
                  femaleRequirementSatisfied &&
                  team.credits_remaining >= 0;

  const minAdditionalRequired = Math.max(0, config.min_total_players - totalSquadSize);
  const maxAdditionalPossible = Math.max(0, config.max_total_players - totalSquadSize);

  let canBidOnCurrent = false;
  let maxLegalBidOnCurrent = 0;

  if (currentPlayer) {
    const isAlreadyHighest = currentHighestTeamId === team.id;
    const validation = calculateMaxLegalBid(
      team,
      retainedPlayer,
      purchasedPlayers,
      currentPlayer,
      config
    );
    maxLegalBidOnCurrent = validation.max_legal_bid;
    canBidOnCurrent = validation.valid && !isAlreadyHighest;
  }

  return {
    team,
    captain_name: team.captain_name,
    retained_player: retainedPlayer,
    purchased_players: purchasedPlayers,
    total_squad_size: totalSquadSize,
    female_count: femaleCount,
    credits_spent: creditsSpent,
    credits_remaining: team.credits_remaining,
    min_additional_players_required: minAdditionalRequired,
    max_additional_players_possible: maxAdditionalPossible,
    female_requirement_satisfied: femaleRequirementSatisfied,
    is_valid: isValid,
    can_bid_on_current_player: canBidOnCurrent,
    max_legal_bid_on_current_player: maxLegalBidOnCurrent,
  };
}

/**
 * Calculates the maximum legal bid a team can place on a specific player,
 * strictly enforcing minimum squad size reservation (5-8 players) and compulsory female player rule.
 */
export function calculateMaxLegalBid(
  team: Team,
  retainedPlayer: Player | null,
  purchasedPlayers: Player[],
  targetPlayer: Player,
  config: AuctionConfig = DEFAULT_CONFIG
): ValidationResult {
  const currentSquadSize = 1 + (retainedPlayer ? 1 : 0) + purchasedPlayers.length;

  // 1. Check maximum roster limit
  if (currentSquadSize >= config.max_total_players) {
    return {
      valid: false,
      max_legal_bid: 0,
      reason: `Roster is already full (${config.max_total_players} players maximum).`,
    };
  }

  // 2. Check current female status
  let hasFemale = team.captain_gender === 'Female';
  if (retainedPlayer && retainedPlayer.gender === 'Female') {
    hasFemale = true;
  }
  for (const p of purchasedPlayers) {
    if (p.gender === 'Female') {
      hasFemale = true;
      break;
    }
  }

  // 3. If target player is Male and team has NO female player yet
  if (targetPlayer.gender === 'Male' && !hasFemale) {
    // If buying this male player brings team to max capacity, they would never be able to acquire a female player
    if (currentSquadSize + 1 >= config.max_total_players) {
      return {
        valid: false,
        max_legal_bid: 0,
        reason: `Bid rejected: Team has no female player. Purchasing this player would fill the roster (${config.max_total_players}/${config.max_total_players}), making it impossible to satisfy the compulsory female player requirement.`,
      };
    }
  }

  // 4. Calculate reserved credits needed after purchasing target player
  const newSquadSize = currentSquadSize + 1;
  const remainingNeededToMin = Math.max(0, config.min_total_players - newSquadSize);

  let reservedCredits = 0;

  if (targetPlayer.gender === 'Female' || hasFemale) {
    // Female requirement is satisfied now or previously
    reservedCredits = remainingNeededToMin * config.min_bid;
  } else {
    // Current player is Male and team still has NO female player
    // Team must acquire at least 1 female player in the future
    if (remainingNeededToMin > 0) {
      // The future female player is one of the remainingNeededToMin players
      reservedCredits = remainingNeededToMin * config.min_bid;
    } else {
      // Team has reached min total players (>=5), but still lacks a female player!
      // Must reserve at least 1 credit for a future female player
      reservedCredits = 1 * config.min_bid;
    }
  }

  const maxLegalBid = team.credits_remaining - reservedCredits;

  if (maxLegalBid < targetPlayer.base_price && maxLegalBid < config.min_bid) {
    return {
      valid: false,
      max_legal_bid: Math.max(0, maxLegalBid),
      reason: `Insufficient credits. You have ${team.credits_remaining} credits, but must reserve ${reservedCredits} credits to guarantee completing a valid team with the required squad size and female player.`,
    };
  }

  return {
    valid: maxLegalBid >= config.min_bid,
    max_legal_bid: Math.max(0, maxLegalBid),
  };
}

/**
 * Validates a concrete bid attempt from a team on the current active auction.
 */
export function validateBidAttempt(params: {
  team: Team;
  retainedPlayer: Player | null;
  purchasedPlayers: Player[];
  currentPlayer: Player | null;
  auctionStatus: string;
  currentHighestBid: number;
  currentHighestTeamId: string | null;
  attemptedBid: number;
  config: AuctionConfig;
}): { accepted: boolean; reason?: string } {
  const {
    team,
    retainedPlayer,
    purchasedPlayers,
    currentPlayer,
    auctionStatus,
    currentHighestBid,
    currentHighestTeamId,
    attemptedBid,
    config,
  } = params;

  // 1. Is auction active and bidding open?
  if (auctionStatus !== 'BIDDING') {
    return {
      accepted: false,
      reason: `Bidding is not currently active (current state: ${auctionStatus}).`,
    };
  }

  // 2. Is player valid?
  if (!currentPlayer) {
    return { accepted: false, reason: 'No player is currently on the auction block.' };
  }
  if (currentPlayer.status !== 'AUCTIONING') {
    return {
      accepted: false,
      reason: `Player ${currentPlayer.name} is not open for bidding (status: ${currentPlayer.status}).`,
    };
  }

  // 3. Self-outbid check: cannot bid against yourself
  if (currentHighestTeamId === team.id) {
    return { accepted: false, reason: 'Your team is already the current highest bidder.' };
  }

  // 4. Calculate maximum legal bid according to budget and female/squad rules
  const legalCheck = calculateMaxLegalBid(
    team,
    retainedPlayer,
    purchasedPlayers,
    currentPlayer,
    config
  );

  if (!legalCheck.valid) {
    return {
      accepted: false,
      reason: legalCheck.reason || 'This bid violates team composition or budget reservation rules.',
    };
  }

  if (attemptedBid > legalCheck.max_legal_bid) {
    const reserved = team.credits_remaining - legalCheck.max_legal_bid;
    return {
      accepted: false,
      reason: `Bid exceeds your maximum legal bid of ${legalCheck.max_legal_bid} credits. (You must reserve ${reserved} credit(s) for required roster slots / female player).`,
    };
  }

  // 5. Check bid minimum and increments
  if (currentHighestBid === 0) {
    // Opening bid
    if (attemptedBid < currentPlayer.base_price) {
      return {
        accepted: false,
        reason: `Opening bid must be at least the player's base price of ${currentPlayer.base_price} credits.`,
      };
    }
  } else {
    // Subsequent bid
    const minRequiredBid = currentHighestBid + config.min_bid_increment;
    if (attemptedBid < minRequiredBid) {
      return {
        accepted: false,
        reason: `Bid must be at least ${minRequiredBid} credits (current highest is ${currentHighestBid}, minimum increment is ${config.min_bid_increment}).`,
      };
    }
  }

  return { accepted: true };
}
