import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db, initDatabase } from '../db.js';
import { DEFAULT_CONFIG } from '../validation.js';

export interface GeneratedCredential {
  role: string;
  teamName: string;
  username: string;
  password: string;
}

export function generateSecurePassword(length = 16): string {
  // Use crypto random bytes with a diverse, url-safe high-entropy alphabet
  // Ensures no ambiguous characters and easy copy-pasting for captains
  const charset = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^*';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

export function seedProductionAccounts(): {
  created: GeneratedCredential[];
  existing: string[];
} {
  initDatabase();

  const created: GeneratedCredential[] = [];
  const existing: string[] = [];

  const saltRounds = 12;

  // 1. Exactly 5 Teams with requested team and captain names
  const teams = [
    { id: 'team_a', name: 'Ashmit', captain_name: 'Ashmit', gender: 'Male', loginId: 'ashmit_curry' },
    { id: 'team_b', name: 'Vansh', captain_name: 'Vansh', gender: 'Male', loginId: 'vansh_baby' },
    { id: 'team_c', name: 'Divyanshu', captain_name: 'Divyanshu', gender: 'Male', loginId: 'divyanshu_lebron' },
    { id: 'team_d', name: 'Chirayu', captain_name: 'Chirayu', gender: 'Male', loginId: 'champ_chirayu' },
    { id: 'team_e', name: 'Parth', captain_name: 'Parth', gender: 'Male', loginId: 'parth_gangsta' },
  ];

  // Upsert teams (safe to re-run, preserves credits_remaining if already modified)
  const upsertTeam = db.prepare(`
    INSERT INTO teams (id, name, captain_name, captain_gender, starting_credits, credits_remaining)
    VALUES (?, ?, ?, ?, 100, 100)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      captain_name = excluded.captain_name,
      captain_gender = excluded.captain_gender
  `);

  for (const t of teams) {
    upsertTeam.run(t.id, t.name, t.captain_name, t.gender);
  }

  // 2. Admin account
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_PASSWORD || generateSecurePassword(18);
    const hash = bcrypt.hashSync(adminPassword, saltRounds);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, team_id)
      VALUES (?, ?, ?, 'ADMIN', NULL)
    `).run('u_admin', adminUsername, hash);

    created.push({
      role: 'ADMIN',
      teamName: 'Platform Administrator',
      username: adminUsername,
      password: adminPassword,
    });
  } else {
    existing.push(adminUsername);
  }

  // 3. Public Display account
  const displayUsername = process.env.DISPLAY_USERNAME || 'display';
  const existingDisplay = db.prepare('SELECT id FROM users WHERE username = ?').get(displayUsername);
  if (!existingDisplay) {
    const displayPassword = process.env.DISPLAY_PASSWORD || generateSecurePassword(18);
    const hash = bcrypt.hashSync(displayPassword, saltRounds);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, team_id)
      VALUES (?, ?, ?, 'DISPLAY', NULL)
    `).run('u_display', displayUsername, hash);

    created.push({
      role: 'DISPLAY',
      teamName: 'Projector / Screen',
      username: displayUsername,
      password: displayPassword,
    });
  } else {
    existing.push(displayUsername);
  }

  // 4. Exactly 5 Captain accounts
  for (const t of teams) {
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(t.loginId);
    if (!existingUser) {
      // Check if env variable provided for this captain, otherwise generate secure random password
      const envKey = `CAPTAIN_${t.name.toUpperCase()}_PASSWORD`;
      const captainPassword = process.env[envKey] || generateSecurePassword(16);
      const hash = bcrypt.hashSync(captainPassword, saltRounds);

      db.prepare(`
        INSERT INTO users (id, username, password_hash, role, team_id)
        VALUES (?, ?, ?, 'CAPTAIN', ?)
      `).run(`u_cap_${t.id}`, t.loginId, hash, t.id);

      created.push({
        role: 'CAPTAIN',
        teamName: t.name,
        username: t.loginId,
        password: captainPassword,
      });
    } else {
      existing.push(t.loginId);
    }
  }

  // 5. Ensure Retained Players exist (1 per team, 0 credits, marked RETAINED)
  const existingRetainedCount = (db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'RETAINED'").get() as any).c;
  if (existingRetainedCount === 0) {
    const retained = [
      { id: 'p_ret_a', name: 'Rahul Sharma', gender: 'Male', position: 'Point Guard', teamId: 'team_a', dept: 'CSE', yr: '4th Year' },
      { id: 'p_ret_b', name: 'Sneha Reddy', gender: 'Female', position: 'Shooting Guard', teamId: 'team_b', dept: 'ECE', yr: '3rd Year' },
      { id: 'p_ret_c', name: 'Arjun Singh', gender: 'Male', position: 'Center', teamId: 'team_c', dept: 'Mechanical', yr: '4th Year' },
      { id: 'p_ret_d', name: 'Rohit Nair', gender: 'Male', position: 'Power Forward', teamId: 'team_d', dept: 'Civil', yr: '3rd Year' },
      { id: 'p_ret_e', name: 'Ritu Sen', gender: 'Female', position: 'Small Forward', teamId: 'team_e', dept: 'Management', yr: '2nd Year' },
    ];

    const insertRetained = db.prepare(`
      INSERT INTO players (id, name, gender, position, base_price, status, sold_team_id, sold_price, queue_order, department, year, skill_rating, notes)
      VALUES (?, ?, ?, ?, 0, 'RETAINED', ?, 0, 0, ?, ?, 4.8, 'RETAINED — FREE')
      ON CONFLICT(id) DO UPDATE SET sold_team_id = excluded.sold_team_id
    `);

    for (const r of retained) {
      insertRetained.run(r.id, r.name, r.gender, r.position, r.teamId, r.dept, r.yr);
    }
  }

  // 6. Ensure Auction Pool exists if empty
  const existingPoolCount = (db.prepare("SELECT COUNT(*) as c FROM players WHERE status = 'AVAILABLE'").get() as any).c;
  if (existingPoolCount === 0) {
    const pool = [
      { name: 'Kavya Krishnan', gender: 'Female', position: 'Point Guard', base_price: 5, dept: 'CSE', year: '3rd Year', skill: 4.7 },
      { name: 'Kabir Thapar', gender: 'Male', position: 'Shooting Guard', base_price: 5, dept: 'Mechanical', year: '4th Year', skill: 4.6 },
      { name: 'Tanvi Deshmukh', gender: 'Female', position: 'Small Forward', base_price: 3, dept: 'Management', year: '2nd Year', skill: 4.2 },
      { name: 'Aditya Chauhan', gender: 'Male', position: 'Center', base_price: 5, dept: 'Civil', year: '4th Year', skill: 4.5 },
      { name: 'Meera Nambiar', gender: 'Female', position: 'Power Forward', base_price: 4, dept: 'Biotech', year: '3rd Year', skill: 4.3 },
      { name: 'Varun Joshi', gender: 'Male', position: 'Point Guard', base_price: 3, dept: 'ECE', year: '2nd Year', skill: 4.0 },
      { name: 'Ishaan Bhatia', gender: 'Male', position: 'Small Forward', base_price: 4, dept: 'CSE', year: '3rd Year', skill: 4.4 },
      { name: 'Pooja Hegde', gender: 'Female', position: 'Shooting Guard', base_price: 3, dept: 'Chemical', year: '2nd Year', skill: 4.1 },
      { name: 'Devendra Rana', gender: 'Male', position: 'Center', base_price: 5, dept: 'Mechanical', year: '4th Year', skill: 4.8 },
      { name: 'Siddharth Rao', gender: 'Male', position: 'Power Forward', base_price: 4, dept: 'Civil', year: '3rd Year', skill: 4.2 },
      { name: 'Deepika Sundaram', gender: 'Female', position: 'Point Guard', base_price: 4, dept: 'CSE', year: '3rd Year', skill: 4.5 },
      { name: 'Nikhil Saxena', gender: 'Male', position: 'Shooting Guard', base_price: 2, dept: 'ECE', year: '1st Year', skill: 3.8 },
      { name: 'Gaurav Kulkarni', gender: 'Male', position: 'Small Forward', base_price: 3, dept: 'Management', year: '2nd Year', skill: 4.0 },
      { name: 'Simran Kaur', gender: 'Female', position: 'Center', base_price: 5, dept: 'Biotech', year: '4th Year', skill: 4.7 },
      { name: 'Ayush Goel', gender: 'Male', position: 'Point Guard', base_price: 2, dept: 'IT', year: '2nd Year', skill: 3.9 },
      { name: 'Karthik Subramanian', gender: 'Male', position: 'Power Forward', base_price: 4, dept: 'Mechanical', year: '3rd Year', skill: 4.3 },
      { name: 'Divya Jain', gender: 'Female', position: 'Shooting Guard', base_price: 3, dept: 'CSE', year: '2nd Year', skill: 4.0 },
      { name: 'Harshwardhan Patil', gender: 'Male', position: 'Center', base_price: 4, dept: 'Civil', year: '3rd Year', skill: 4.4 },
      { name: 'Manish Tiwari', gender: 'Male', position: 'Small Forward', base_price: 2, dept: 'ECE', year: '1st Year', skill: 3.7 },
      { name: 'Shruti Bhatt', gender: 'Female', position: 'Point Guard', base_price: 4, dept: 'Management', year: '3rd Year', skill: 4.4 },
      { name: 'Yash Vardhan', gender: 'Male', position: 'Power Forward', base_price: 3, dept: 'Chemical', year: '2nd Year', skill: 4.1 },
      { name: 'Karan Mehra', gender: 'Male', position: 'Shooting Guard', base_price: 4, dept: 'CSE', year: '4th Year', skill: 4.5 },
      { name: 'Natasha Dsouza', gender: 'Female', position: 'Small Forward', base_price: 5, dept: 'Design', year: '3rd Year', skill: 4.8 },
      { name: 'Pranav Mishra', gender: 'Male', position: 'Center', base_price: 3, dept: 'Mechanical', year: '2nd Year', skill: 4.0 },
      { name: 'Aakash Singhania', gender: 'Male', position: 'Point Guard', base_price: 3, dept: 'IT', year: '3rd Year', skill: 4.2 },
      { name: 'Pallavi Chawla', gender: 'Female', position: 'Power Forward', base_price: 4, dept: 'ECE', year: '4th Year', skill: 4.3 },
      { name: 'Suraj Namboodiri', gender: 'Male', position: 'Shooting Guard', base_price: 2, dept: 'Civil', year: '1st Year', skill: 3.6 },
      { name: 'Rishabh Bajaj', gender: 'Male', position: 'Small Forward', base_price: 4, dept: 'Management', year: '3rd Year', skill: 4.3 },
      { name: 'Anushka Sen', gender: 'Female', position: 'Center', base_price: 4, dept: 'CSE', year: '2nd Year', skill: 4.2 },
      { name: 'Dhruv Kapoor', gender: 'Male', position: 'Point Guard', base_price: 5, dept: 'Mechanical', year: '4th Year', skill: 4.7 },
      { name: 'Shreya Ghosal', gender: 'Female', position: 'Shooting Guard', base_price: 3, dept: 'ECE', year: '3rd Year', skill: 4.1 },
      { name: 'Tushar Aggarwal', gender: 'Male', position: 'Power Forward', base_price: 3, dept: 'Civil', year: '2nd Year', skill: 3.9 },
      { name: 'Ritwik Ghosh', gender: 'Male', position: 'Center', base_price: 4, dept: 'Chemical', year: '3rd Year', skill: 4.4 },
      { name: 'Sanya Mirza', gender: 'Female', position: 'Point Guard', base_price: 5, dept: 'Management', year: '4th Year', skill: 4.9 },
      { name: 'Vivek Oberoi', gender: 'Male', position: 'Small Forward', base_price: 2, dept: 'IT', year: '1st Year', skill: 3.8 },
      { name: 'Abhishek Roy', gender: 'Male', position: 'Shooting Guard', base_price: 4, dept: 'CSE', year: '3rd Year', skill: 4.3 },
      { name: 'Bhavna Pandey', gender: 'Female', position: 'Power Forward', base_price: 3, dept: 'Design', year: '2nd Year', skill: 4.0 },
      { name: 'Chetan Bhagat', gender: 'Male', position: 'Center', base_price: 3, dept: 'Mechanical', year: '3rd Year', skill: 4.1 },
      { name: 'Dipendra Hooda', gender: 'Male', position: 'Point Guard', base_price: 4, dept: 'Civil', year: '4th Year', skill: 4.5 },
      { name: 'Garima Sethi', gender: 'Female', position: 'Small Forward', base_price: 4, dept: 'ECE', year: '3rd Year', skill: 4.4 },
      { name: 'Himanshu Tyagi', gender: 'Male', position: 'Power Forward', base_price: 2, dept: 'IT', year: '2nd Year', skill: 3.8 },
      { name: 'Jhanvi Kapoor', gender: 'Female', position: 'Shooting Guard', base_price: 3, dept: 'Management', year: '1st Year', skill: 4.1 },
    ];

    const insertPlayer = db.prepare(`
      INSERT INTO players (id, name, gender, position, base_price, status, sold_team_id, sold_price, queue_order, department, year, skill_rating, notes)
      VALUES (?, ?, ?, ?, ?, 'AVAILABLE', NULL, NULL, ?, ?, ?, ?, ?)
    `);

    let order = 1;
    for (const p of pool) {
      insertPlayer.run(
        `p_pool_${order}`,
        p.name,
        p.gender,
        p.position,
        p.base_price,
        order,
        p.dept,
        p.year,
        p.skill,
        `University player (${p.dept}, ${p.year})`
      );
      order++;
    }
  }

  // 7. Ensure initial auction state
  const stateExists = db.prepare('SELECT id FROM auction_state WHERE id = 1').get();
  if (!stateExists) {
    db.prepare(`
      INSERT INTO auction_state (id, status, current_player_id, current_highest_bid, current_highest_team_id, timer_remaining, timer_paused, config_json)
      VALUES (1, 'SETUP', NULL, 0, NULL, 10, 0, ?)
    `).run(JSON.stringify(DEFAULT_CONFIG));
  }

  return { created, existing };
}

// CLI Execution Entry Point
if (process.argv[1] && process.argv[1].endsWith('initAccounts.ts')) {
  const result = seedProductionAccounts();

  console.log('\n========================================================================================');
  console.log('🏀 MUQABLA 2026 — PRODUCTION ACCOUNTS INITIALIZATION');
  console.log('========================================================================================\n');

  if (result.created.length > 0) {
    console.log('⚠️  IMPORTANT: The following account(s) were just created with secure random initial passwords.');
    console.log('⚠️  Copy and securely distribute them now. Passwords are saved ONLY as one-way hashes!\n');

    console.table(
      result.created.map((c) => ({
        Role: c.role,
        Team: c.teamName,
        'Login ID (Username)': c.username,
        'Generated Initial Password': c.password,
      }))
    );

    console.log('\n✅ Secure initialization complete.');
  } else {
    console.log('ℹ️  All 5 captain accounts and admin/display accounts already exist in the database.');
    console.log(`ℹ️  Existing accounts: ${result.existing.join(', ')}`);
    console.log('ℹ️  No passwords were overwritten. To reset a password, use npm run reset:password');
  }

  console.log('========================================================================================\n');
}
