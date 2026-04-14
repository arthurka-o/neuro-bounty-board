import Database from "better-sqlite3";
import path from "path";

const dbName = process.env.NEXT_PUBLIC_CHAIN === "sepolia" ? "bounties-testnet.db" : "bounties.db";
const DB_PATH = path.join(process.cwd(), dbName);

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS bounty_metadata (
        bounty_id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Other',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bounty_id INTEGER NOT NULL,
        address TEXT NOT NULL,
        message TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(bounty_id, address)
      );
    `);
  }
  return _db;
}

// ─── Bounty Metadata ──────────────────────────────────────────────────

export type BountyMetadata = {
  bounty_id: number;
  title: string;
  description: string;
  category: string;
  created_at: string;
};

export function insertBountyMetadata(
  bountyId: number,
  title: string,
  description: string,
  category: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO bounty_metadata (bounty_id, title, description, category) VALUES (?, ?, ?, ?)`
  ).run(bountyId, title, description, category);
}

export function getBountyMetadata(
  bountyId: number
): BountyMetadata | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM bounty_metadata WHERE bounty_id = ?`)
    .get(bountyId) as BountyMetadata | undefined;
}

export function getAllBountyMetadata(): BountyMetadata[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM bounty_metadata ORDER BY bounty_id DESC`)
    .all() as BountyMetadata[];
}

// ─── Applications ─────────────────────────────────────────────────────

export type ApplicationRow = {
  id: number;
  bounty_id: number;
  address: string;
  message: string;
  applied_at: string;
};

export function insertApplication(
  bountyId: number,
  address: string,
  message: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO applications (bounty_id, address, message) VALUES (?, ?, ?)`
  ).run(bountyId, address, message);
}

export function getApplications(bountyId: number): ApplicationRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM applications WHERE bounty_id = ? ORDER BY applied_at ASC`
    )
    .all(bountyId) as ApplicationRow[];
}
