import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db, initDatabase } from '../src/db.js';
import { seedProductionAccounts } from '../src/scripts/initAccounts.js';
import { runBackup } from '../src/scripts/backup.js';
import { router as apiRouter } from '../src/routes.js';
import { generateToken, verifyToken } from '../src/auth.js';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

describe('Muqabla Production Security, Authentication & Privacy Test Suite', () => {
  let captainPasswords: Record<string, string> = {};
  let adminPassword = '';
  let displayPassword = '';

  beforeAll(async () => {
    await initDatabase();
    // Clean database tables for hermetic test execution
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

    // Seed production accounts
    const seedResult = await seedProductionAccounts();
    for (const cred of seedResult.created) {
      if (cred.role === 'CAPTAIN') {
        captainPasswords[cred.username] = cred.password;
      } else if (cred.role === 'ADMIN') {
        adminPassword = cred.password;
      } else if (cred.role === 'DISPLAY') {
        displayPassword = cred.password;
      }
    }
  });

  describe('1. Production Seeding & Account Creation', () => {
    it('creates exactly 5 captain accounts with the requested Login IDs', async () => {
      const expectedLogins = [
        'ashmit_curry',
        'vansh_baby',
        'divyanshu_lebron',
        'champ_chirayu',
        'parth_gangsta',
      ];

      for (const loginId of expectedLogins) {
        const user = await db.queryOne<{ id: string; role: string; team_id: string }>(
          'SELECT * FROM users WHERE username = ?',
          [loginId]
        );
        expect(user).toBeDefined();
        expect(user!.role).toBe('CAPTAIN');
        expect(user!.team_id).toBeDefined();
        expect(captainPasswords[loginId]).toBeDefined();
        expect(captainPasswords[loginId].length).toBeGreaterThanOrEqual(16);
      }
    });

    it('assigns the correct team names to the 5 teams', async () => {
      const teams = await db.query<any[]>('SELECT * FROM teams ORDER BY id ASC');
      expect(teams.length).toBe(5);
      expect((teams as any[]).find((t) => t.id === 'team_a').name).toBe('Ashmit');
      expect((teams as any[]).find((t) => t.id === 'team_b').name).toBe('Vansh');
      expect((teams as any[]).find((t) => t.id === 'team_c').name).toBe('Divyanshu');
      expect((teams as any[]).find((t) => t.id === 'team_d').name).toBe('Chirayu');
      expect((teams as any[]).find((t) => t.id === 'team_e').name).toBe('Parth');
    });

    it('is idempotent: re-running seedProductionAccounts does NOT duplicate accounts or overwrite passwords', async () => {
      const userCountBeforeRow = await db.queryOne<{ c: number | string }>('SELECT COUNT(*) as c FROM users');
      const userCountBefore = Number(userCountBeforeRow?.c || 0);

      const reSeedResult = await seedProductionAccounts();

      const userCountAfterRow = await db.queryOne<{ c: number | string }>('SELECT COUNT(*) as c FROM users');
      const userCountAfter = Number(userCountAfterRow?.c || 0);

      expect(userCountAfter).toBe(userCountBefore);
      expect(reSeedResult.created.length).toBe(0);
      expect(reSeedResult.existing.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('2. Authentication: Login, Password Verification & Session Expiration', () => {
    it('all 5 captain accounts can log in with their generated initial passwords', async () => {
      const captains = [
        'ashmit_curry',
        'vansh_baby',
        'divyanshu_lebron',
        'champ_chirayu',
        'parth_gangsta',
      ];

      for (const username of captains) {
        const password = captainPasswords[username];
        const res = await request(app)
          .post('/api/auth/login')
          .send({ username, password });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.user).toBeDefined();
        expect(res.body.user.username).toBe(username);
        expect(res.body.user.role).toBe('CAPTAIN');
        // Ensure password hash is NEVER leaked in response
        expect(res.body.user.password_hash).toBeUndefined();
      }
    });

    it('rejects login with incorrect password (HTTP 401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'ashmit_curry', password: 'wrong_password_123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid username or password.');
      expect(res.body.token).toBeUndefined();
    });

    it('rejects login with unknown username (HTTP 401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'non_existent_captain', password: 'random_password' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid username or password.');
    });

    it('rejects malformed or empty login payloads', async () => {
      const res1 = await request(app).post('/api/auth/login').send({});
      expect(res1.status).toBe(400);

      const res2 = await request(app).post('/api/auth/login').send({ username: 12345, password: true });
      expect(res2.status).toBe(400);
    });

    it('rejects requests with invalid or forged JWT tokens', async () => {
      const res = await request(app)
        .get('/api/teams')
        .set('Authorization', 'Bearer forged_fake_token_xyz');

      expect(res.status).toBe(401);
    });

    it('supports logout endpoint', async () => {
      const token = generateToken({
        userId: 'u_cap_a',
        username: 'ashmit_curry',
        role: 'CAPTAIN',
        teamId: 'team_a',
      });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('3. Authorization & IDOR Prevention', () => {
    it('Captain A (ashmit_curry) can only view their own team (team_a), preventing IDOR', async () => {
      const tokenA = generateToken({
        userId: 'u_cap_a',
        username: 'ashmit_curry',
        role: 'CAPTAIN',
        teamId: 'team_a',
      });

      // Even if captain tries to query team_b in query string
      const res = await request(app)
        .get('/api/teams?teamId=team_b')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.teams.length).toBe(1);
      expect(res.body.teams[0].id).toBe('team_a');
      expect(res.body.teams[0].name).toBe('Ashmit');
    });

    it('Captain B (vansh_baby) cannot access Team C or Team A details', async () => {
      const tokenB = generateToken({
        userId: 'u_cap_b',
        username: 'vansh_baby',
        role: 'CAPTAIN',
        teamId: 'team_b',
      });

      const res = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.teams.length).toBe(1);
      expect(res.body.teams[0].id).toBe('team_b');
      expect(res.body.teams[0].name).toBe('Vansh');
    });

    it('Captains cannot perform Admin actions (HTTP 403 Forbidden)', async () => {
      const tokenA = generateToken({
        userId: 'u_cap_a',
        username: 'ashmit_curry',
        role: 'CAPTAIN',
        teamId: 'team_a',
      });

      // Attempt admin start
      const res1 = await request(app)
        .post('/api/admin/start')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res1.status).toBe(403);

      // Attempt to view full audit logs
      const res2 = await request(app)
        .get('/api/logs')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res2.status).toBe(403);
    });
  });

  describe('4. Privacy & Data Boundary', () => {
    it('Captain cannot view upcoming player queue or other teams purchased players', async () => {
      const tokenA = generateToken({
        userId: 'u_cap_a',
        username: 'ashmit_curry',
        role: 'CAPTAIN',
        teamId: 'team_a',
      });

      const res = await request(app)
        .get('/api/players')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      // Captains only see their own retained/sold players and current active player
      for (const p of res.body.players) {
        expect(p.sold_team_id === 'team_a' || p.status === 'AUCTIONING').toBe(true);
      }
    });

    it('Admin can access full team overviews and all players', async () => {
      const tokenAdmin = generateToken({
        userId: 'u_admin',
        username: 'admin',
        role: 'ADMIN',
        teamId: null,
      });

      const resTeams = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(resTeams.status).toBe(200);
      expect(resTeams.body.teams.length).toBe(5);

      const resPlayers = await request(app)
        .get('/api/players')
        .set('Authorization', `Bearer ${tokenAdmin}`);
      expect(resPlayers.status).toBe(200);
      expect(resPlayers.body.players.length).toBeGreaterThan(40);
    });
  });

  describe('5. Health Endpoint & Online Database Backup', () => {
    it('GET /health returns healthy status and database connection', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
      expect(res.body.uptime).toBeDefined();
    });

    it('safely performs non-blocking online database backup to destination', async () => {
      const backupDir = path.join(process.cwd(), 'backups');
      const backupFile = await runBackup(backupDir);

      expect(fs.existsSync(backupFile)).toBe(true);
      const stat = fs.statSync(backupFile);
      expect(stat.size).toBeGreaterThan(100);
    });
  });
});
