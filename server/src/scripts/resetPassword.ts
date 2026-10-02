import bcrypt from 'bcryptjs';
import { db, initDatabase } from '../db.js';
import { generateSecurePassword } from './initAccounts.js';

async function main() {
  await initDatabase();

  const args = process.argv.slice(2);
  const usernameIdx = args.findIndex((a) => a === '--user' || a === '--username');
  const passwordIdx = args.findIndex((a) => a === '--password');

  if (usernameIdx === -1 || !args[usernameIdx + 1]) {
    console.error('\n❌ Usage: npm run reset:password -- --user <login_id> [--password <optional_explicit_password>]\n');
    process.exit(1);
  }

  const targetUsername = args[usernameIdx + 1];
  const explicitPassword = passwordIdx !== -1 && args[passwordIdx + 1] ? args[passwordIdx + 1] : null;

  const user = await db.queryOne<{ id: string; username: string; role: string; team_id: string | null }>(
    'SELECT id, username, role, team_id FROM users WHERE username = ?',
    [targetUsername]
  );

  if (!user) {
    console.error(`\n❌ User '${targetUsername}' not found in database.\n`);
    process.exit(1);
  }

  const newPassword = explicitPassword || generateSecurePassword(16);
  const hash = bcrypt.hashSync(newPassword, 12);

  await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);

  console.log('\n========================================================================================');
  console.log(`🔑 PASSWORD RESET SUCCESSFUL FOR '${targetUsername}'`);
  console.log('========================================================================================');
  console.log(`Username / Login ID : ${user.username}`);
  console.log(`Role                 : ${user.role}`);
  console.log(`New Password         : ${newPassword}`);
  console.log('========================================================================================');
  console.log('⚠️  Please save this password securely. It is stored ONLY as a hash and cannot be recovered.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Password reset failed:', err);
  process.exit(1);
});
