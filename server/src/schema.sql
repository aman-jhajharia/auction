-- ========================================================
-- Muqabla 2026 Basketball Player Auction Platform
-- PostgreSQL Production Schema
-- ========================================================

-- 1. Teams Table
CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  captain_name VARCHAR(100) NOT NULL,
  captain_gender VARCHAR(10) NOT NULL CHECK (captain_gender IN ('Male', 'Female')),
  starting_credits INTEGER NOT NULL DEFAULT 100 CHECK (starting_credits > 0),
  credits_remaining INTEGER NOT NULL DEFAULT 100 CHECK (credits_remaining >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users Table (Authentication & Role Isolation)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'CAPTAIN', 'DISPLAY')),
  team_id VARCHAR(50) REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Players Table
CREATE TABLE IF NOT EXISTS players (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('Male', 'Female')),
  position VARCHAR(50) NOT NULL,
  base_price INTEGER NOT NULL DEFAULT 1 CHECK (base_price >= 0),
  status VARCHAR(30) NOT NULL CHECK (status IN ('AVAILABLE', 'RETAINED', 'AUCTIONING', 'SOLD', 'UNSOLD')),
  sold_team_id VARCHAR(50) REFERENCES teams(id) ON DELETE SET NULL,
  sold_price INTEGER CHECK (sold_price IS NULL OR sold_price >= 0),
  queue_order INTEGER DEFAULT 0,
  department VARCHAR(100),
  year VARCHAR(50),
  skill_rating NUMERIC(3, 1) DEFAULT 4.0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Bids Table (Complete Bid History & Audit)
CREATE TABLE IF NOT EXISTS bids (
  id VARCHAR(50) PRIMARY KEY,
  player_id VARCHAR(50) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id VARCHAR(50) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  previous_highest_bid INTEGER NOT NULL CHECK (previous_highest_bid >= 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('ACCEPTED', 'REJECTED')),
  rejection_reason TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Sales Table (Formal Sale History & Undo Tracking)
CREATE TABLE IF NOT EXISTS sales (
  id VARCHAR(50) PRIMARY KEY,
  player_id VARCHAR(50) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id VARCHAR(50) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  price INTEGER NOT NULL CHECK (price >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'UNDONE')),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_by VARCHAR(100) NOT NULL,
  undone_at TIMESTAMPTZ,
  undone_by VARCHAR(100)
);

-- 6. Auction State Table (Single row holding live state)
CREATE TABLE IF NOT EXISTS auction_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status VARCHAR(40) NOT NULL CHECK (status IN (
    'SETUP', 'READY', 'PLAYER_REVEAL', 'BIDDING',
    'PAUSED', 'SOLD_PENDING_CONFIRMATION', 'SOLD', 'UNSOLD', 'AUCTION_COMPLETE'
  )),
  current_player_id VARCHAR(50) REFERENCES players(id) ON DELETE SET NULL,
  current_highest_bid INTEGER NOT NULL DEFAULT 0 CHECK (current_highest_bid >= 0),
  current_highest_team_id VARCHAR(50) REFERENCES teams(id) ON DELETE SET NULL,
  timer_remaining INTEGER NOT NULL DEFAULT 10 CHECK (timer_remaining >= 0),
  timer_paused SMALLINT NOT NULL DEFAULT 0 CHECK (timer_paused IN (0, 1)),
  last_sold_player_id VARCHAR(50) REFERENCES players(id) ON DELETE SET NULL,
  last_sold_team_id VARCHAR(50) REFERENCES teams(id) ON DELETE SET NULL,
  last_sold_price INTEGER CHECK (last_sold_price IS NULL OR last_sold_price >= 0),
  config_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(50) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  actor VARCHAR(100) NOT NULL,
  player_id VARCHAR(50) REFERENCES players(id) ON DELETE SET NULL,
  team_id VARCHAR(50) REFERENCES teams(id) ON DELETE SET NULL,
  details_json JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Indexes for High-Concurrency Performance
CREATE INDEX IF NOT EXISTS idx_bids_player_id ON bids(player_id);
CREATE INDEX IF NOT EXISTS idx_bids_team_id ON bids(team_id);
CREATE INDEX IF NOT EXISTS idx_bids_timestamp ON bids(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
CREATE INDEX IF NOT EXISTS idx_players_sold_team ON players(sold_team_id);
CREATE INDEX IF NOT EXISTS idx_sales_player_id ON sales(player_id);
CREATE INDEX IF NOT EXISTS idx_sales_team_id ON sales(team_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
