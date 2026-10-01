import bcrypt from 'bcryptjs';
import { db, initDatabase } from '../db.js';
import { generateSecurePassword } from './initAccounts.js';

initDatabase();

const args = process.argv.slice(2);
const usernameIdx = args.findIndex((a) => a === '--user' || a === '--username');
const passwordIdx = args.findIndex((a) => a === '--password');

if (usernameIdx === -1 || !args[usernameIdx + 1]) {
  console.error('\n❌ Usage: npm run reset:password -- --user <login_id> [--password <optional_explicit_password>]\n');
  process.exit(1);
}

const targetUsername = args[usernameIdx + 1];
const explicitPassword = passwordIdx !== -1 && args[passwordIdx + 1] ? args[passwordIdx + 1] : null;

const user = db.prepare('SELECT id, username, role, team_id FROM users WHERE username = ?').get(targetUsername) as any;
if (!user) {
  console.error(`\n❌ User '${targetUsername}' not found in database.\n`);
  process.exit(1);
}

const newPassword = explicitPassword || generateSecurePassword(16);
const hash = bcrypt.hashSync(newPassword, 12);

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);

console.log('\n========================================================================================');
console.log(`🔑 PASSWORD RESET SUCCESSFUL FOR '${targetUsername}'`);
console.log('========================================================================================');
console.log(`Username / Login ID : ${user.username}`);
console.log(`Role                 : ${user.role}`);
console.log(`New Password         : ${newPassword}`);
console.log('========================================================================================');
console.log('⚠️  Please save this password securely. It is stored ONLY as a hash and cannot be recovered.\n');
