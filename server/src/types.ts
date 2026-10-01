export type UserRole = 'ADMIN' | 'CAPTAIN' | 'DISPLAY';

export type Gender = 'Male' | 'Female';

export type PlayerStatus = 'AVAILABLE' | 'RETAINED' | 'AUCTIONING' | 'SOLD' | 'UNSOLD';

export type AuctionStatus =
  | 'SETUP'
  | 'READY'
  | 'PLAYER_REVEAL'
  | 'BIDDING'
  | 'PAUSED'
  | 'SOLD_PENDING_CONFIRMATION'
  | 'SOLD'
  | 'UNSOLD'
  | 'AUCTION_COMPLETE';

export interface Team {
  id: string;
  name: string;
  captain_name: string;
  captain_gender: Gender;
  starting_credits: number;
  credits_remaining: number;
  created_at?: string;
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  team_id?: string | null;
}

export interface Player {
  id: string;
  name: string;
  gender: Gender;
  position: string;
  base_price: number;
  status: PlayerStatus;
  sold_team_id?: string | null;
  sold_price?: number | null;
  queue_order: number;
  department?: string;
  year?: string;
  skill_rating?: number;
  notes?: string;
}

export interface Bid {
  id: string;
  player_id: string;
  team_id: string;
  amount: number;
  previous_highest_bid: number;
  status: 'ACCEPTED' | 'REJECTED';
  rejection_reason?: string | null;
  timestamp: string;
  // Join fields for admin view
  team_name?: string;
  player_name?: string;
  captain_name?: string;
}

export interface AuctionConfig {
  starting_credits: number;
  min_total_players: number;
  max_total_players: number;
  min_female_players: number;
  min_auction_players: number;
  min_bid: number;
  min_bid_increment: number;
  auction_timer_seconds: number;
  config_locked: boolean;
}

export interface AuctionStateRecord {
  id: number;
  status: AuctionStatus;
  current_player_id: string | null;
  current_highest_bid: number;
  current_highest_team_id: string | null;
  timer_remaining: number;
  timer_paused: number; // 0 or 1
  last_sold_player_id: string | null;
  last_sold_team_id: string | null;
  last_sold_price: number | null;
  config_json: string;
}

export interface AuditLog {
  id: string;
  event_type: string;
  actor: string;
  player_id?: string | null;
  team_id?: string | null;
  details_json: string;
  timestamp: string;
  // Expanded for convenience
  player_name?: string;
  team_name?: string;
}

export interface TeamSquadSummary {
  team: Team;
  captain_name: string;
  retained_player: Player | null;
  purchased_players: Player[];
  total_squad_size: number;
  female_count: number;
  credits_spent: number;
  credits_remaining: number;
  min_additional_players_required: number;
  max_additional_players_possible: number;
  female_requirement_satisfied: boolean;
  is_valid: boolean;
  can_bid_on_current_player: boolean;
  max_legal_bid_on_current_player: number;
}

export interface ValidationResult {
  valid: boolean;
  max_legal_bid: number;
  reason?: string;
}
