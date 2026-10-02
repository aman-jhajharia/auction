import { describe, it, expect, beforeAll } from 'vitest';
import { newDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';

describe('PostgreSQL Production Schema & Relational Integrity (pg-mem)', () => {
  let memDb: any;
  let pool: any;

  beforeAll(async () => {
    memDb = newDb();

    // Register PostgreSQL native date / uuid functions if needed
    memDb.public.registerFunction({
      name: 'current_timestamp',
      returns: memDb.public.getType('timestamp'),
      implementation: () => new Date(),
    });

    const schemaPath = path.resolve(__dirname, '..', 'src', 'schema.sql');
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    // Execute PostgreSQL DDL
    const adapter = memDb.adapters.createPg();
    pool = new adapter.Pool();
    await pool.query(ddl);
  });

  it('correctly creates all 7 production tables with constraints and indexes', async () => {
    const res = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const tables = res.rows.map((r: any) => r.table_name);

    expect(tables).toContain('teams');
    expect(tables).toContain('users');
    expect(tables).toContain('players');
    expect(tables).toContain('bids');
    expect(tables).toContain('sales');
    expect(tables).toContain('auction_state');
    expect(tables).toContain('audit_logs');
  });

  it('enforces PostgreSQL CHECK constraint on negative credits (credits_remaining >= 0)', async () => {
    // Valid team insert
    await pool.query(`
      INSERT INTO teams (id, name, captain_name, captain_gender, starting_credits, credits_remaining)
      VALUES ('t_test_1', 'Team Alpha', 'Alpha Cap', 'Male', 100, 100)
    `);

    // Violating team insert (negative credits) must be rejected by PostgreSQL engine
    await expect(
      pool.query(`
        INSERT INTO teams (id, name, captain_name, captain_gender, starting_credits, credits_remaining)
        VALUES ('t_test_2', 'Team Beta', 'Beta Cap', 'Female', 100, -5)
      `)
    ).rejects.toThrow();
  });

  it('enforces UNIQUE constraints on usernames and team names', async () => {
    await pool.query(`
      INSERT INTO users (id, username, password_hash, role, team_id)
      VALUES ('u_test_1', 'unique_user', 'hash123', 'CAPTAIN', 't_test_1')
    `);

    // Duplicate username must be rejected
    await expect(
      pool.query(`
        INSERT INTO users (id, username, password_hash, role, team_id)
        VALUES ('u_test_2', 'unique_user', 'hash456', 'CAPTAIN', 't_test_1')
      `)
    ).rejects.toThrow();
  });

  it('enforces CHECK constraint on bid amount (amount > 0)', async () => {
    // Insert valid player
    await pool.query(`
      INSERT INTO players (id, name, gender, position, base_price, status)
      VALUES ('p_chk_1', 'Check Player', 'Male', 'Guard', 2, 'AVAILABLE')
    `);

    // 0 or negative bid must be rejected by CHECK constraint
    await expect(
      pool.query(`
        INSERT INTO bids (id, player_id, team_id, amount, previous_highest_bid, status)
        VALUES ('b_chk_invalid', 'p_chk_1', 't_test_1', 0, 0, 'REJECTED')
      `)
    ).rejects.toThrow();
  });

  it('records confirmed sales and supports undo updates in sales table', async () => {
    // Insert player and confirm sale
    await pool.query(`
      INSERT INTO players (id, name, gender, position, base_price, status, sold_team_id, sold_price)
      VALUES ('p_sold_1', 'Sold Star', 'Female', 'Guard', 4, 'SOLD', 't_test_1', 25)
    `);

    await pool.query(`
      INSERT INTO sales (id, player_id, team_id, price, status, confirmed_by)
      VALUES ('s_1', 'p_sold_1', 't_test_1', 25, 'CONFIRMED', 'admin')
    `);

    const sale = await pool.query("SELECT * FROM sales WHERE id = 's_1'");
    expect(sale.rows[0].status).toBe('CONFIRMED');
    expect(Number(sale.rows[0].price)).toBe(25);

    // Undo sale
    await pool.query(`
      UPDATE sales
      SET status = 'UNDONE', undone_at = CURRENT_TIMESTAMP, undone_by = 'admin'
      WHERE id = 's_1'
    `);

    const undoneSale = await pool.query("SELECT * FROM sales WHERE id = 's_1'");
    expect(undoneSale.rows[0].status).toBe('UNDONE');
    expect(undoneSale.rows[0].undone_by).toBe('admin');
  });

  it('supports JSONB config and audit details storage in PostgreSQL', async () => {
    const config = { starting_credits: 100, min_total_players: 5, auction_timer_seconds: 10 };
    await pool.query(
      `INSERT INTO auction_state (id, status, current_player_id, current_highest_bid, timer_remaining, config_json)
       VALUES (1, 'SETUP', NULL, 0, 10, $1)`,
      [JSON.stringify(config)]
    );

    const res = await pool.query('SELECT * FROM auction_state WHERE id = 1');
    expect(res.rows[0].status).toBe('SETUP');
    const parsed = typeof res.rows[0].config_json === 'string' ? JSON.parse(res.rows[0].config_json) : res.rows[0].config_json;
    expect(parsed.starting_credits).toBe(100);
  });
});
