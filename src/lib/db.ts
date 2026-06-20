import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const globalForDb = globalThis as unknown as {
  palmpayDemoDb?: Database.Database;
};

function resolveDbPath() {
  const configuredPath = process.env.PALMPAY_DB_PATH;
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(/* turbopackIgnore: true */ process.cwd(), configuredPath);
  }

  if (process.env.VERCEL) {
    return path.join("/tmp", "palmpay-demo.sqlite");
  }

  return path.join(process.cwd(), "data", "palmpay-demo.sqlite");
}

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db =
  globalForDb.palmpayDemoDb ??
  new Database(dbPath, {
    fileMustExist: false,
  });

if (!globalForDb.palmpayDemoDb) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  globalForDb.palmpayDemoDb = db;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS payment_methods (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('qr', 'nfc', 'face', 'palm')),
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    token_ref TEXT NOT NULL UNIQUE,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_user_type_active
    ON payment_methods(user_id, type)
    WHERE status = 'active';

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    items_json TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('paid', 'failed')),
    payment_method_type TEXT NOT NULL,
    payment_method_id TEXT NOT NULL,
    authorization_code TEXT NOT NULL,
    device_trace_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user_created_at
    ON orders(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS payment_events (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    method_type TEXT NOT NULL,
    step TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}
