import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { DEFAULT_CONFIG } from './validation.js';

export function seedInitialData() {
  const existingTeams = db.prepare('SELECT COUNT(*) as count FROM teams').get() as { count: number };
  if (existingTeams.count > 0) {
    return; // Already seeded
  }

  const salt = bcrypt.genSaltSync(10);
  const adminPasswordHash = bcrypt.hashSync('admin123', salt);
  const displayPasswordHash = bcrypt.hashSync('display123', salt);
  const captainPasswordHash = bcrypt.hashSync('captain123', salt);

  const insertTeam = db.prepare(`
    INSERT INTO teams (id, name, captain_name, captain_gender, starting_credits, credits_remaining)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, role, team_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertPlayer = db.prepare(`
    INSERT INTO players (id, name, gender, position, base_price, status, sold_team_id, sold_price, queue_order, department, year, skill_rating, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertState = db.prepare(`
    INSERT INTO auction_state (id, status, current_player_id, current_highest_bid, current_highest_team_id, timer_remaining, timer_paused, config_json)
    VALUES (1, 'SETUP', NULL, 0, NULL, 10, 0, ?)
  `);

  const insertLog = db.prepare(`
    INSERT INTO audit_logs (id, event_type, actor, details_json)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    // 1. Teams
    const teams = [
      { id: 'team_a', name: 'Team A (Phoenix)', captain_name: 'Aman Sharma', gender: 'Male' },
      { id: 'team_b', name: 'Team B (Spartans)', captain_name: 'Priya Patel', gender: 'Female' },
      { id: 'team_c', name: 'Team C (Thunder)', captain_name: 'Rohan Verma', gender: 'Male' },
      { id: 'team_d', name: 'Team D (Gladiators)', captain_name: 'Ananya Iyer', gender: 'Female' },
      { id: 'team_e', name: 'Team E (Vipers)', captain_name: 'Vikram Malhotra', gender: 'Male' },
    ];

    for (const t of teams) {
      insertTeam.run(t.id, t.name, t.captain_name, t.gender, 100, 100);
    }

    // 2. Users (Admin, Display, 5 Captains)
    insertUser.run('u_admin', 'admin', adminPasswordHash, 'ADMIN', null);
    insertUser.run('u_display', 'display', displayPasswordHash, 'DISPLAY', null);

    insertUser.run('u_cap_a', 'captain_a', captainPasswordHash, 'CAPTAIN', 'team_a');
    insertUser.run('u_cap_b', 'captain_b', captainPasswordHash, 'CAPTAIN', 'team_b');
    insertUser.run('u_cap_c', 'captain_c', captainPasswordHash, 'CAPTAIN', 'team_c');
    insertUser.run('u_cap_d', 'captain_d', captainPasswordHash, 'CAPTAIN', 'team_d');
    insertUser.run('u_cap_e', 'captain_e', captainPasswordHash, 'CAPTAIN', 'team_e');

    // 3. Retained Players (Assigned 1 per team before auction, cost 0, marked RETAINED)
    const retained = [
      { id: 'p_ret_a', name: 'Rahul Sharma', gender: 'Male', position: 'Point Guard', teamId: 'team_a', dept: 'CSE', yr: '4th Year' },
      { id: 'p_ret_b', name: 'Sneha Reddy', gender: 'Female', position: 'Shooting Guard', teamId: 'team_b', dept: 'ECE', yr: '3rd Year' },
      { id: 'p_ret_c', name: 'Arjun Singh', gender: 'Male', position: 'Center', teamId: 'team_c', dept: 'Mechanical', yr: '4th Year' },
      { id: 'p_ret_d', name: 'Rohit Nair', gender: 'Male', position: 'Power Forward', teamId: 'team_d', dept: 'Civil', yr: '3rd Year' },
      { id: 'p_ret_e', name: 'Ritu Sen', gender: 'Female', position: 'Small Forward', teamId: 'team_e', dept: 'Management', yr: '2nd Year' },
    ];

    for (const rp of retained) {
      insertPlayer.run(
        rp.id,
        rp.name,
        rp.gender,
        rp.position,
        0, // 0 credits for retained player
        'RETAINED',
        rp.teamId,
        0, // 0 sold price
        0,
        rp.dept,
        rp.yr,
        4.8,
        'RETAINED — FREE'
      );
    }

    // 4. Auction Player Pool (42 realistic players, mix of Male & Female, varied positions and base prices)
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

    let order = 1;
    for (const p of pool) {
      insertPlayer.run(
        `p_pool_${order}`,
        p.name,
        p.gender,
        p.position,
        p.base_price,
        'AVAILABLE',
        null,
        null,
        order,
        p.dept,
        p.year,
        p.skill,
        `University player (${p.dept}, ${p.year})`
      );
      order++;
    }

    // 5. Initial Auction State
    insertState.run(JSON.stringify(DEFAULT_CONFIG));

    // 6. Initial Audit Log
    insertLog.run(
      'log_init',
      'SYSTEM_INITIALIZED',
      'system',
      JSON.stringify({
        message: 'Muqabla 2026 Basketball Auction system initialized with 5 teams, 5 retained players, and 42 available players.',
      })
    );
  });

  transaction();
}
