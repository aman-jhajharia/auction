import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

export async function migrateSqliteToPostgres(options?: {
  sqlitePath?: string;
  pgUrl?: string;
}): Promise<void> {
  const sqlitePath =
    options?.sqlitePath ||
    process.env.DATABASE_PATH ||
    process.env.DB_PATH ||
    path.resolve(__dirname, '..', '..', 'data', 'auction.db');

  const pgUrl = options?.pgUrl || process.env.DATABASE_URL;

  console.log('\n========================================================================================');
  console.log('🔄 MUQABLA 2026 — SQLITE TO POSTGRESQL DATA MIGRATION');
  console.log('========================================================================================\n');

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`Source SQLite file not found at: ${sqlitePath}`);
  }

  if (!pgUrl) {
    throw new Error(
      'Target PostgreSQL connection string is required. Set DATABASE_URL or pass --target-url <url>.'
    );
  }

  console.log(`📖 Source SQLite Database: ${sqlitePath} (Opened Read-Only)`);
  console.log(`🐘 Target PostgreSQL: ${pgUrl.replace(/:[^:@]+@/, ':****@')}`);

  // Open SQLite in read-only mode to prevent any unintended alteration
  const sqlite = new Database(sqlitePath, { readonly: true });

  const needsSsl = pgUrl.includes('render.com') || pgUrl.includes('neon.tech') || pgUrl.includes('supabase.com');
  const pool = new Pool({
    connectionString: pgUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();

  try {
    console.log('\n1️⃣  Ensuring target PostgreSQL schema exists...');
    const schemaPath = path.resolve(__dirname, '..', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const ddl = fs.readFileSync(schemaPath, 'utf-8');
      await client.query(ddl);
    }

    await client.query('BEGIN');

    // 2. Teams
    const teams = sqlite.prepare('SELECT * FROM teams').all() as any[];
    console.log(`📦 Migrating ${teams.length} teams...`);
    for (const t of teams) {
      await client.query(
        `INSERT INTO teams (id, name, captain_name, captain_gender, starting_credits, credits_remaining, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, CURRENT_TIMESTAMP))
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           captain_name = EXCLUDED.captain_name,
           captain_gender = EXCLUDED.captain_gender,
           starting_credits = EXCLUDED.starting_credits,
           credits_remaining = EXCLUDED.credits_remaining`,
        [t.id, t.name, t.captain_name, t.captain_gender, t.starting_credits, t.credits_remaining, t.created_at || null]
      );
    }

    // 3. Users
    const users = sqlite.prepare('SELECT * FROM users').all() as any[];
    console.log(`👤 Migrating ${users.length} user accounts...`);
    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, username, password_hash, role, team_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           team_id = EXCLUDED.team_id`,
        [u.id, u.username, u.password_hash, u.role, u.team_id]
      );
    }

    // 4. Players
    const players = sqlite.prepare('SELECT * FROM players').all() as any[];
    console.log(`🏃 Migrating ${players.length} players...`);
    for (const p of players) {
      await client.query(
        `INSERT INTO players (id, name, gender, position, base_price, status, sold_team_id, sold_price, queue_order, department, year, skill_rating, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           gender = EXCLUDED.gender,
           position = EXCLUDED.position,
           base_price = EXCLUDED.base_price,
           status = EXCLUDED.status,
           sold_team_id = EXCLUDED.sold_team_id,
           sold_price = EXCLUDED.sold_price,
           queue_order = EXCLUDED.queue_order,
           department = EXCLUDED.department,
           year = EXCLUDED.year,
           skill_rating = EXCLUDED.skill_rating,
           notes = EXCLUDED.notes`,
        [
          p.id,
          p.name,
          p.gender,
          p.position,
          p.base_price,
          p.status,
          p.sold_team_id,
          p.sold_price,
          p.queue_order,
          p.department,
          p.year,
          p.skill_rating,
          p.notes,
        ]
      );
    }

    // 5. Bids
    const bids = sqlite.prepare('SELECT * FROM bids').all() as any[];
    console.log(`💰 Migrating ${bids.length} bid history records...`);
    for (const b of bids) {
      await client.query(
        `INSERT INTO bids (id, player_id, team_id, amount, previous_highest_bid, status, rejection_reason, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, CURRENT_TIMESTAMP))
         ON CONFLICT (id) DO NOTHING`,
        [b.id, b.player_id, b.team_id, b.amount, b.previous_highest_bid, b.status, b.rejection_reason, b.timestamp || null]
      );
    }

    // 6. Sales (if present in SQLite or generated from sold players)
    let salesCount = 0;
    try {
      const salesTableExists = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").get();
      if (salesTableExists) {
        const sales = sqlite.prepare('SELECT * FROM sales').all() as any[];
        for (const s of sales) {
          await client.query(
            `INSERT INTO sales (id, player_id, team_id, price, status, confirmed_at, confirmed_by, undone_at, undone_by)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, CURRENT_TIMESTAMP), $7, $8::timestamptz, $9)
             ON CONFLICT (id) DO NOTHING`,
            [s.id, s.player_id, s.team_id, s.price, s.status, s.confirmed_at, s.confirmed_by, s.undone_at, s.undone_by]
          );
          salesCount++;
        }
      }
    } catch {}
    console.log(`🏷️ Migrated ${salesCount} sale records...`);

    // 7. Auction State
    const state = sqlite.prepare('SELECT * FROM auction_state WHERE id = 1').get() as any;
    if (state) {
      console.log(`⏱️ Migrating auction state (status: ${state.status})...`);
      const configJson = typeof state.config_json === 'string' ? JSON.parse(state.config_json) : state.config_json;
      await client.query(
        `INSERT INTO auction_state (id, status, current_player_id, current_highest_bid, current_highest_team_id, timer_remaining, timer_paused, last_sold_player_id, last_sold_team_id, last_sold_price, config_json)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           current_player_id = EXCLUDED.current_player_id,
           current_highest_bid = EXCLUDED.current_highest_bid,
           current_highest_team_id = EXCLUDED.current_highest_team_id,
           timer_remaining = EXCLUDED.timer_remaining,
           timer_paused = EXCLUDED.timer_paused,
           last_sold_player_id = EXCLUDED.last_sold_player_id,
           last_sold_team_id = EXCLUDED.last_sold_team_id,
           last_sold_price = EXCLUDED.last_sold_price,
           config_json = EXCLUDED.config_json`,
        [
          state.status,
          state.current_player_id,
          state.current_highest_bid,
          state.current_highest_team_id,
          state.timer_remaining,
          state.timer_paused,
          state.last_sold_player_id,
          state.last_sold_team_id,
          state.last_sold_price,
          JSON.stringify(configJson),
        ]
      );
    }

    // 8. Audit Logs
    const auditLogs = sqlite.prepare('SELECT * FROM audit_logs').all() as any[];
    console.log(`📋 Migrating ${auditLogs.length} audit log entries...`);
    for (const l of auditLogs) {
      const details = typeof l.details_json === 'string' ? JSON.parse(l.details_json) : l.details_json;
      await client.query(
        `INSERT INTO audit_logs (id, event_type, actor, player_id, team_id, details_json, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, CURRENT_TIMESTAMP))
         ON CONFLICT (id) DO NOTHING`,
        [l.id, l.event_type, l.actor, l.player_id, l.team_id, JSON.stringify(details), l.timestamp || null]
      );
    }

    await client.query('COMMIT');
    console.log('\n✅ All data successfully and idempotently migrated into PostgreSQL.');
    console.log('✅ SQLite source database remained intact and unaltered.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    sqlite.close();
    await pool.end();
  }
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith('migrateSqliteToPg.ts')) {
  const args = process.argv.slice(2);
  const targetIdx = args.findIndex((a) => a === '--target-url' || a === '--url');
  const sqliteIdx = args.findIndex((a) => a === '--sqlite-path');

  const pgUrl = targetIdx !== -1 ? args[targetIdx + 1] : undefined;
  const sqlitePath = sqliteIdx !== -1 ? args[sqliteIdx + 1] : undefined;

  migrateSqliteToPostgres({ pgUrl, sqlitePath })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Migration failed:', err.message);
      process.exit(1);
    });
}
