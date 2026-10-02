import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { generateToken, authenticate, requireRole, JwtPayload } from './auth.js';
import { auctionEngine } from './auctionEngine.js';
import { Player, Team, User } from './types.js';

export const router = Router();

// ================= RATE LIMITING FOR AUTH =================
interface LoginAttempt {
  count: number;
  firstAttempt: number;
  blockedUntil: number;
}
const loginAttempts = new Map<string, LoginAttempt>();
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function checkLoginRateLimit(ip: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (!attempt) return { allowed: true };

  if (attempt.blockedUntil > now) {
    const waitSeconds = Math.ceil((attempt.blockedUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  // Reset if window expired
  if (now - attempt.firstAttempt > BLOCK_DURATION_MS) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedLogin(ip: string) {
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, firstAttempt: now, blockedUntil: 0 };
  attempt.count += 1;

  if (attempt.count >= MAX_FAILED_ATTEMPTS) {
    attempt.blockedUntil = now + BLOCK_DURATION_MS;
    console.warn(`[SECURITY] IP ${ip} temporarily locked out for ${BLOCK_DURATION_MS / 1000}s due to repeated failed logins.`);
  }

  loginAttempts.set(ip, attempt);
}

function resetFailedLogin(ip: string) {
  loginAttempts.delete(ip);
}

// ================= HEALTH ENDPOINT =================

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await db.queryOne('SELECT 1 as health_check');
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
    });
  }
});

// ================= AUTH ROUTES =================

router.post('/auth/login', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const rateLimit = checkLoginRateLimit(ip);

  if (!rateLimit.allowed) {
    res.status(429).json({
      error: `Too many failed login attempts. Please wait ${rateLimit.waitSeconds} seconds before trying again.`,
    });
    return;
  }

  const { username, password } = req.body;

  // Strict input validation
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Username and password must be valid strings.' });
    return;
  }

  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length > 50 || password.length > 128) {
    res.status(400).json({ error: 'Username or password exceeds maximum allowed length.' });
    return;
  }

  try {
    const user = await db.queryOne<User>('SELECT * FROM users WHERE LOWER(username) = ?', [cleanUsername]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      recordFailedLogin(ip);
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    resetFailedLogin(ip);

    let team: Team | null = null;
    if (user.team_id) {
      team = await db.queryOne<Team>('SELECT * FROM teams WHERE id = ?', [user.team_id]);
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      teamId: user.team_id,
    });

    // Never return password hash in API response
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        teamId: user.team_id,
        team: team ? {
          id: team.id,
          name: team.name,
          captain_name: team.captain_name,
          captain_gender: team.captain_gender,
          credits_remaining: team.credits_remaining,
        } : null,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during authentication.' });
  }
});

router.post('/auth/logout', authenticate, (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

router.get('/auth/me', authenticate, async (req: Request, res: Response) => {
  const jwtUser = (req as any).user as JwtPayload;
  try {
    const user = await db.queryOne<{ id: string; username: string; role: any; team_id: string | null }>(
      'SELECT id, username, role, team_id FROM users WHERE id = ?',
      [jwtUser.userId]
    );
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    let team: Team | null = null;
    if (user.team_id) {
      team = await db.queryOne<Team>('SELECT * FROM teams WHERE id = ?', [user.team_id]);
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        teamId: user.team_id,
        team: team ? {
          id: team.id,
          name: team.name,
          captain_name: team.captain_name,
          captain_gender: team.captain_gender,
          credits_remaining: team.credits_remaining,
        } : null,
      },
    });
  } catch (err) {
    console.error('Auth verification error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ================= TEAMS =================

router.get('/teams', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user as JwtPayload;

  try {
    if (user.role === 'ADMIN') {
      const teams = await db.query<Team>('SELECT * FROM teams ORDER BY id ASC');
      res.json({ teams });
      return;
    }

    if (user.role === 'CAPTAIN' && user.teamId) {
      // Captain can only view their own team (prevents IDOR)
      const team = await db.queryOne<Team>('SELECT * FROM teams WHERE id = ?', [user.teamId]);
      res.json({ teams: team ? [team] : [] });
      return;
    }

    // Display: public names only, no credits or budgets
    const publicTeams = await db.query('SELECT id, name, captain_name FROM teams ORDER BY name ASC');
    res.json({ teams: publicTeams });
  } catch (err) {
    console.error('Teams route error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ================= PLAYERS =================

router.get('/players', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user as JwtPayload;
  const statusFilter = req.query.status as string | undefined;

  try {
    if (user.role === 'ADMIN') {
      let query = 'SELECT p.*, t.name as sold_team_name FROM players p LEFT JOIN teams t ON p.sold_team_id = t.id';
      const params: any[] = [];
      if (statusFilter && statusFilter !== 'ALL') {
        query += ' WHERE p.status = ?';
        params.push(statusFilter);
      }
      query += ' ORDER BY p.queue_order ASC, p.name ASC';
      const players = await db.query(query, params);
      res.json({ players });
      return;
    }

    if (user.role === 'CAPTAIN' && user.teamId) {
      // Captains only see:
      // 1. Their own retained/sold players
      // 2. The player currently on auction (if any)
      const state = await auctionEngine.getState();
      const query = `
        SELECT id, name, gender, position, base_price, status, sold_team_id, sold_price, department, year, skill_rating, notes
        FROM players
        WHERE sold_team_id = ? OR id = ?
      `;
      const players = await db.query<Player>(query, [user.teamId, state.current_player_id || '']);
      res.json({ players });
      return;
    }

    // Display: Current player and recently sold players
    const query = `
      SELECT p.id, p.name, p.gender, p.position, p.base_price, p.status, p.sold_price, t.name as sold_team_name
      FROM players p
      LEFT JOIN teams t ON p.sold_team_id = t.id
      WHERE p.status IN ('AUCTIONING', 'SOLD')
      ORDER BY p.name ASC
    `;
    const players = await db.query(query);
    res.json({ players });
  } catch (err) {
    console.error('Players route error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Admin: Add new player
router.post('/players', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { name, gender, position, base_price, department, year, skill_rating, notes } = req.body;
  if (!name || !gender || !position) {
    res.status(400).json({ error: 'Name, gender, and position are required.' });
    return;
  }

  const id = `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  try {
    const maxRow = await db.queryOne<{ max_o: number }>('SELECT MAX(queue_order) as max_o FROM players');
    const maxOrder = maxRow?.max_o || 0;

    await db.execute(
      `INSERT INTO players (id, name, gender, position, base_price, status, queue_order, department, year, skill_rating, notes)
       VALUES (?, ?, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?)`,
      [id, name, gender, position, base_price || 1, maxOrder + 1, department || '', year || '', skill_rating || 4.0, notes || '']
    );

    await auctionEngine.logAudit('PLAYER_CREATED', (req as any).user.username, id, null, { name, gender, position });
    res.json({ success: true, id });
  } catch (err) {
    console.error('Add player error:', err);
    res.status(500).json({ error: 'Failed to create player.' });
  }
});

// Admin: Update player
router.put('/players/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const player = await db.queryOne<Player>('SELECT * FROM players WHERE id = ?', [id]);
    if (!player) {
      res.status(404).json({ error: 'Player not found.' });
      return;
    }

    if (player.status === 'SOLD') {
      res.status(400).json({ error: 'Cannot modify a player who has already been sold.' });
      return;
    }

    const { name, gender, position, base_price, department, year, skill_rating, notes } = req.body;

    await db.execute(
      `UPDATE players
       SET name = COALESCE(?, name),
           gender = COALESCE(?, gender),
           position = COALESCE(?, position),
           base_price = COALESCE(?, base_price),
           department = COALESCE(?, department),
           year = COALESCE(?, year),
           skill_rating = COALESCE(?, skill_rating),
           notes = COALESCE(?, notes)
       WHERE id = ?`,
      [name, gender, position, base_price, department, year, skill_rating, notes, id]
    );

    await auctionEngine.logAudit('PLAYER_UPDATED', (req as any).user.username, id, null, req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Update player error:', err);
    res.status(500).json({ error: 'Failed to update player.' });
  }
});

// Admin: Delete player
router.delete('/players/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const player = await db.queryOne<Player>('SELECT * FROM players WHERE id = ?', [id]);
    if (!player) {
      res.status(404).json({ error: 'Player not found.' });
      return;
    }
    if (player.status !== 'AVAILABLE' && player.status !== 'UNSOLD') {
      res.status(400).json({ error: 'Only available or unsold players can be removed.' });
      return;
    }

    await db.execute('DELETE FROM players WHERE id = ?', [id]);
    await auctionEngine.logAudit('PLAYER_DELETED', (req as any).user.username, id, null, { name: player.name });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete player error:', err);
    res.status(500).json({ error: 'Failed to delete player.' });
  }
});

// Admin: Assign Retained Player
router.post('/players/:id/retain', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { teamId } = req.body;

  try {
    const player = await db.queryOne<Player>('SELECT * FROM players WHERE id = ?', [id]);
    if (!player) {
      res.status(404).json({ error: 'Player not found.' });
      return;
    }

    const state = await auctionEngine.getState();
    if (state.status !== 'SETUP') {
      res.status(400).json({ error: 'Retained players can only be assigned during SETUP phase.' });
      return;
    }

    // Clear existing retained player for this team if any
    await db.execute(
      "UPDATE players SET status = 'AVAILABLE', sold_team_id = NULL, notes = NULL WHERE sold_team_id = ? AND status = 'RETAINED'",
      [teamId]
    );

    // Assign this player
    await db.execute(
      "UPDATE players SET status = 'RETAINED', sold_team_id = ?, sold_price = 0, notes = 'RETAINED — FREE' WHERE id = ?",
      [teamId, id]
    );

    await auctionEngine.logAudit('PLAYER_RETAINED', (req as any).user.username, id, teamId, { name: player.name });
    await auctionEngine.broadcastState();
    res.json({ success: true });
  } catch (err) {
    console.error('Retain player error:', err);
    res.status(500).json({ error: 'Failed to retain player.' });
  }
});

// ================= ADMIN AUCTION CONTROLS =================

router.post('/admin/start', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  await auctionEngine.startAuction((req as any).user.username);
  res.json({ success: true });
});

router.post('/admin/pause', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  await auctionEngine.pauseAuction((req as any).user.username);
  res.json({ success: true });
});

router.post('/admin/resume', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  await auctionEngine.resumeAuction((req as any).user.username);
  res.json({ success: true });
});

router.post('/admin/reveal', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { playerId } = req.body;
  if (!playerId) {
    res.status(400).json({ error: 'Player ID is required.' });
    return;
  }
  await auctionEngine.revealPlayer(playerId, (req as any).user.username);
  res.json({ success: true });
});

router.post('/admin/start-bidding', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  await auctionEngine.startBidding((req as any).user.username);
  res.json({ success: true });
});

router.post('/admin/extend-timer', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { seconds } = req.body;
  await auctionEngine.extendTimer(Number(seconds) || 5, (req as any).user.username);
  res.json({ success: true });
});

router.post('/admin/confirm-sold', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    await auctionEngine.confirmSold((req as any).user.username);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/mark-unsold', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    await auctionEngine.markUnsold((req as any).user.username);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/undo-sale', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    await auctionEngine.undoLastSale((req as any).user.username);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/lock-config', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  await auctionEngine.lockConfig((req as any).user.username);
  res.json({ success: true });
});

// ================= AUDIT LOGS & CSV EXPORT =================

router.get('/logs', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { eventType, teamId, playerId, limit = 100 } = req.query;

  let query = `
    SELECT l.*, p.name as player_name, t.name as team_name
    FROM audit_logs l
    LEFT JOIN players p ON l.player_id = p.id
    LEFT JOIN teams t ON l.team_id = t.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (eventType) {
    query += ' AND l.event_type = ?';
    params.push(eventType);
  }
  if (teamId) {
    query += ' AND l.team_id = ?';
    params.push(teamId);
  }
  if (playerId) {
    query += ' AND l.player_id = ?';
    params.push(playerId);
  }

  query += ' ORDER BY l.timestamp DESC LIMIT ?';
  params.push(Number(limit));

  try {
    const logs = await db.query(query, params);
    res.json({ logs });
  } catch (err) {
    console.error('Audit logs query error:', err);
    res.status(500).json({ error: 'Failed to retrieve logs.' });
  }
});

router.get('/logs/export/csv', authenticate, requireRole(['ADMIN']), async (_req: Request, res: Response) => {
  try {
    const logs = await db.query<any[]>(`
      SELECT l.id, l.timestamp, l.event_type, l.actor,
             COALESCE(p.name, l.player_id, '') as player_name,
             COALESCE(t.name, l.team_id, '') as team_name,
             l.details_json
      FROM audit_logs l
      LEFT JOIN players p ON l.player_id = p.id
      LEFT JOIN teams t ON l.team_id = t.id
      ORDER BY l.timestamp ASC
    `);

    let csv = 'Log ID,Timestamp,Event Type,Actor,Player,Team,Details\n';
    for (const row of logs as any[]) {
      const details = typeof row.details_json === 'object' ? JSON.stringify(row.details_json) : (row.details_json || '');
      const detailsClean = details.replace(/"/g, '""');
      csv += `"${row.id}","${row.timestamp}","${row.event_type}","${row.actor}","${row.player_name}","${row.team_name}","${detailsClean}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="muqabla_auction_audit_logs.csv"');
    res.send(csv);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Failed to export CSV.' });
  }
});
