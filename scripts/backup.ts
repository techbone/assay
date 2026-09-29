/**
 * Backs up the collector's database to iCloud Drive.
 *
 * Uses SQLite's own online backup API rather than copying the file: the collector
 * writes to it continuously (WAL mode), and a raw `cp` mid-write can capture a
 * torn, unreadable snapshot. `.backup()` takes a consistent copy while the source
 * stays open and in use.
 *
 *   npm run backup
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SRC = process.env.ASSAY_DB ?? "data/assay.db";
const DEST_DIR = join(homedir(), "Library/Mobile Documents/com~apple~CloudDocs/Assay Backups");
const DEST = join(DEST_DIR, "assay.db");

if (!existsSync(SRC)) {
  console.error(`no database at ${SRC} - nothing to back up`);
  process.exit(1);
}

try {
  mkdirSync(DEST_DIR, { recursive: true });
} catch (e) {
  console.error(`can't write to iCloud Drive: ${(e as Error).message}`);
  console.error(`One-time fix: System Settings -> Privacy & Security -> Files and Folders ->`);
  console.error(`grant your terminal app access to "iCloud Drive", then run this again.`);
  process.exit(1);
}

const db = new Database(SRC, { readonly: true });
await db.backup(DEST);
db.close();

const before = existsSync(DEST) ? 0 : 0;
const kb = (statSync(DEST).size / 1024 / 1024).toFixed(1);
console.log(`backed up ${SRC} -> ${DEST} (${kb} MB)`);
