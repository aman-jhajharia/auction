import path from 'path';
import fs from 'fs';
import { db } from '../db.js';

export async function runBackup(targetDir?: string): Promise<string> {
  const backupDir = targetDir || path.resolve(__dirname, '..', '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `auction_backup_${timestamp}.db`;
  const backupFilePath = path.join(backupDir, backupFileName);

  console.log(`\n📦 Initiating SQLite online backup with WAL checkpoint...`);
  console.log(`📁 Destination: ${backupFilePath}`);

  // native better-sqlite3 non-blocking online backup API
  await db.backup(backupFilePath);

  const stats = fs.statSync(backupFilePath);
  console.log(`✅ Backup successfully created! (${(stats.size / 1024).toFixed(1)} KB)\n`);

  return backupFilePath;
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
