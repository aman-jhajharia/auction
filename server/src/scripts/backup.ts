import path from 'path';
import fs from 'fs';
import { db } from '../db.js';

export async function runBackup(targetDir?: string): Promise<string> {
  const backupDir = targetDir || path.resolve(__dirname, '..', '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (db.isPostgres()) {
    const backupFileName = `auction_pg_snapshot_${timestamp}.json`;
    const backupFilePath = path.join(backupDir, backupFileName);

    console.log(`\n📦 Initiating PostgreSQL database snapshot export...`);
    console.log(`📁 Destination: ${backupFilePath}`);

    const [teams, users, players, auctionState, bids, sales, auditLogs] = await Promise.all([
      db.query('SELECT * FROM teams'),
      db.query('SELECT id, username, password_hash, role, team_id, created_at FROM users'),
      db.query('SELECT * FROM players'),
      db.query('SELECT * FROM auction_state'),
      db.query('SELECT * FROM bids'),
      db.query('SELECT * FROM sales'),
      db.query('SELECT * FROM audit_logs'),
    ]);

    const snapshot = {
      timestamp: new Date().toISOString(),
      source: 'PostgreSQL',
      version: '1.0.0',
      tables: {
        teams,
        users,
        players,
        auction_state: auctionState,
        bids,
        sales,
        audit_logs: auditLogs,
      },
    };

    fs.writeFileSync(backupFilePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    const stats = fs.statSync(backupFilePath);
    console.log(`✅ Snapshot successfully created! (${(stats.size / 1024).toFixed(1)} KB)\n`);
    return backupFilePath;
  } else {
    const sqliteDb = db.getSqliteDb();
    if (!sqliteDb) throw new Error('No database available for backup.');

    const backupFileName = `auction_sqlite_backup_${timestamp}.db`;
    const backupFilePath = path.join(backupDir, backupFileName);

    console.log(`\n📦 Initiating SQLite online backup with WAL checkpoint...`);
    console.log(`📁 Destination: ${backupFilePath}`);

    await sqliteDb.backup(backupFilePath);

    const stats = fs.statSync(backupFilePath);
    console.log(`✅ Backup successfully created! (${(stats.size / 1024).toFixed(1)} KB)\n`);
    return backupFilePath;
  }
}

if (process.argv[1] && process.argv[1].endsWith('backup.ts')) {
  runBackup()
    .then((filePath) => {
      console.log(`Saved backup to: ${filePath}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Backup failed:', err);
      process.exit(1);
    });
}
