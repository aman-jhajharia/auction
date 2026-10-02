import { Pool, PoolClient } from 'pg';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface TransactionClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ rowCount: number }>;
}

const DATABASE_URL = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === 'production';

// Strict enforcement: Production MUST have DATABASE_URL configured
if (isProduction && !DATABASE_URL) {
  throw new Error('FATAL: DATABASE_URL must be configured in production mode. SQLite fallback is strictly prohibited.');
}

const usePostgres = Boolean(DATABASE_URL);

let pgPool: Pool | null = null;
let sqliteDb: Database.Database | null = null;

if (usePostgres) {
  console.log('🐘 Initializing PostgreSQL database connection pool...');
  const needsSsl = process.env.DATABASE_SSL === 'true' || 
    (process.env.DATABASE_SSL !== 'false' && (DATABASE_URL!.includes('render.com') || DATABASE_URL!.includes('neon.tech') || DATABASE_URL!.includes('supabase.com') || isProduction));

  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pgPool.on('error', (err) => {
    console.error('⚠️ Unexpected PostgreSQL client error on idle client:', err);
  });
} else {
  // Local development / testing SQLite fallback
  const DB_PATH = process.env.DATABASE_PATH || process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'auction.db');
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log(`💾 Development mode: Using local SQLite fallback at ${DB_PATH}`);
  sqliteDb = new Database(DB_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('synchronous = NORMAL');
  sqliteDb.pragma('foreign_keys = ON');
}

/**
 * Normalizes SQL queries across PostgreSQL ($1, $2, ...) and SQLite (?)
 */
function prepareSqlForPostgres(sql: string): string {
  // If the query already uses $1, leave it
  if (/\$\d+/.test(sql)) return sql;
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

function prepareSqlForSqlite(sql: string): string {
  // Strip PostgreSQL row-level lock clauses from SQLite queries (SQLite handles locking via WAL / transactions)
  let cleanSql = sql.replace(/\s+FOR\s+UPDATE(\s+OF\s+\w+)?/gi, '');
  // Replace $1, $2 placeholders with ?
  cleanSql = cleanSql.replace(/\$\d+/g, '?');
  return cleanSql;
}

export const db = {
  isPostgres(): boolean {
    return usePostgres;
  },

  getPool(): Pool | null {
    return pgPool;
  },

  getSqliteDb(): Database.Database | null {
    return sqliteDb;
  },

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (usePostgres && pgPool) {
      const pgSql = prepareSqlForPostgres(sql);
      const res = await pgPool.query(pgSql, params);
      return res.rows;
    } else if (sqliteDb) {
      const sqSql = prepareSqlForSqlite(sql);
      return sqliteDb.prepare(sqSql).all(...params) as T[];
    }
    throw new Error('No active database connection.');
  },

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    if (usePostgres && pgPool) {
      const pgSql = prepareSqlForPostgres(sql);
      const res = await pgPool.query(pgSql, params);
      return (res.rows[0] as T) || null;
    } else if (sqliteDb) {
      const sqSql = prepareSqlForSqlite(sql);
      const row = sqliteDb.prepare(sqSql).get(...params) as T | undefined;
      return row || null;
    }
    throw new Error('No active database connection.');
  },

  async execute(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
    if (usePostgres && pgPool) {
      const pgSql = prepareSqlForPostgres(sql);
      const res = await pgPool.query(pgSql, params);
      return { rowCount: res.rowCount || 0 };
    } else if (sqliteDb) {
      const sqSql = prepareSqlForSqlite(sql);
      const info = sqliteDb.prepare(sqSql).run(...params);
      return { rowCount: info.changes };
    }
    throw new Error('No active database connection.');
  },

  async transaction<T>(callback: (client: TransactionClient) => Promise<T>): Promise<T> {
    if (usePostgres && pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const txClient: TransactionClient = {
          async query<R = any>(sql: string, params: any[] = []): Promise<R[]> {
            const pgSql = prepareSqlForPostgres(sql);
            const res = await client.query(pgSql, params);
            return res.rows;
          },
          async queryOne<R = any>(sql: string, params: any[] = []): Promise<R | null> {
            const pgSql = prepareSqlForPostgres(sql);
            const res = await client.query(pgSql, params);
            return (res.rows[0] as R) || null;
          },
          async execute(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
            const pgSql = prepareSqlForPostgres(sql);
            const res = await client.query(pgSql, params);
            return { rowCount: res.rowCount || 0 };
          },
        };
        const result = await callback(txClient);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } else if (sqliteDb) {
      // SQLite serialized immediate transaction
      sqliteDb.exec('BEGIN IMMEDIATE');
      try {
        const txClient: TransactionClient = {
          async query<R = any>(sql: string, params: any[] = []): Promise<R[]> {
            const sqSql = prepareSqlForSqlite(sql);
            return sqliteDb!.prepare(sqSql).all(...params) as R[];
          },
          async queryOne<R = any>(sql: string, params: any[] = []): Promise<R | null> {
            const sqSql = prepareSqlForSqlite(sql);
            const row = sqliteDb!.prepare(sqSql).get(...params) as R | undefined;
            return row || null;
          },
          async execute(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
            const sqSql = prepareSqlForSqlite(sql);
            const info = sqliteDb!.prepare(sqSql).run(...params);
            return { rowCount: info.changes };
          },
        };
        const result = await callback(txClient);
        sqliteDb.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          sqliteDb.exec('ROLLBACK');
        } catch {}
        throw err;
      }
    }
    throw new Error('No active database connection.');
  },
};

export async function initDatabase(): Promise<void> {
  if (usePostgres && pgPool) {
    const schemaPath = path.resolve(__dirname, 'schema.sql');
    let schemaSql = '';
    if (fs.existsSync(schemaPath)) {
      schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    } else {
      // Fallback inline DDL if compiled dist is separated from source
      schemaSql = `
        CREATE TABLE IF NOT EXISTS teams (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE,
          captain_name VARCHAR(100) NOT NULL,
          captain_gender VARCHAR(10) NOT NULL CHECK (captain_gender IN ('Male', 'Female')),
          starting_credits INTEGER NOT NULL DEFAULT 100 CHECK (starting_credits > 0),
          credits_remaining INTEGER NOT NULL DEFAULT 100 CHECK (credits_remaining >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(50) PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'CAPTAIN', 'DISPLAY')),
          team_id VARCHAR(50) REFERENCES teams(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
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
        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(50) PRIMARY KEY,
          event_type VARCHAR(50) NOT NULL,
          actor VARCHAR(100) NOT NULL,
          player_id VARCHAR(50) REFERENCES players(id) ON DELETE SET NULL,
          team_id VARCHAR(50) REFERENCES teams(id) ON DELETE SET NULL,
          details_json JSONB NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_bids_player_id ON bids(player_id);
        CREATE INDEX IF NOT EXISTS idx_bids_team_id ON bids(team_id);
        CREATE INDEX IF NOT EXISTS idx_bids_timestamp ON bids(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
        CREATE INDEX IF NOT EXISTS idx_players_sold_team ON players(sold_team_id);
        CREATE INDEX IF NOT EXISTS idx_sales_player_id ON sales(player_id);
        CREATE INDEX IF NOT EXISTS idx_sales_team_id ON sales(team_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
      `;
    }

    await pgPool.query(schemaSql);
    console.log('✅ PostgreSQL schema verified and up to date.');
  } else if (sqliteDb) {
    sqliteDb.exec(`
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

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        price INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED', 'UNDONE')),
        confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        confirmed_by TEXT NOT NULL,
        undone_at DATETIME,
        undone_by TEXT,
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
      CREATE INDEX IF NOT EXISTS idx_sales_player_id ON sales(player_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    `);
    console.log('✅ SQLite development database schema initialized.');
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    if (pgPool) {
      await pgPool.end();
      console.log('🐘 PostgreSQL pool closed.');
    }
  } catch {}

  try {
    if (sqliteDb) {
      sqliteDb.close();
      console.log('💾 SQLite database closed.');
    }
  } catch {}
}
