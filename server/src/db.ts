import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'auction.db');

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// Optimize SQLite for high-concurrency low-latency live operations
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      captain_name TEXT NOT NULL,
      captain_gender TEXT NOT NULL CHECK(captain_gender IN ('Male', 'Female')),
      starting_credits INTEGER NOT NULL DEFAULT 100,
      credits_remaining INTEGER NOT NULL DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'CAPTAIN', 'DISPLAY')),
      team_id TEXT,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female')),
      position TEXT NOT NULL,
      base_price INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK(status IN ('AVAILABLE', 'RETAINED', 'AUCTIONING', 'SOLD', 'UNSOLD')),
      sold_team_id TEXT,
      sold_price INTEGER,
      queue_order INTEGER DEFAULT 0,
      department TEXT,
      year TEXT,
      skill_rating REAL,
      notes TEXT,
      FOREIGN KEY (sold_team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      previous_highest_bid INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ACCEPTED', 'REJECTED')),
      rejection_reason TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS auction_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL CHECK(status IN (
        'SETUP', 'READY', 'PLAYER_REVEAL', 'BIDDING',
        'PAUSED', 'SOLD_PENDING_CONFIRMATION', 'SOLD', 'UNSOLD', 'AUCTION_COMPLETE'
      )),
      current_player_id TEXT,
      current_highest_bid INTEGER DEFAULT 0,
      current_highest_team_id TEXT,
      timer_remaining INTEGER DEFAULT 10,
      timer_paused INTEGER DEFAULT 0,
      last_sold_player_id TEXT,
      last_sold_team_id TEXT,
      last_sold_price INTEGER,
      config_json TEXT NOT NULL,
      FOREIGN KEY (current_player_id) REFERENCES players(id),
      FOREIGN KEY (current_highest_team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      player_id TEXT,
      team_id TEXT,
      details_json TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bids_player_id ON bids(player_id);
    CREATE INDEX IF NOT EXISTS idx_bids_team_id ON bids(team_id);
    CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
  `);
}

export function closeDatabase() {
  try {
    db.close();
  } catch {}
}
