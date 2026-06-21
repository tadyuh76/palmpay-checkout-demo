import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

type AppDb =
  | {
      kind: "postgres";
      pool: Pool;
    }
  | {
      kind: "sqlite";
      sqlite: Database.Database;
    };

const globalForDb = globalThis as unknown as {
  palmpayDemoPgPool?: Pool;
  palmpayDemoSqlite?: Database.Database;
  palmpayDemoAppTables?: Promise<void>;
};

const databaseUrl = process.env.DATABASE_URL;

function resolveDbPath() {
  const configuredPath = process.env.PALMPAY_DB_PATH;
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(/* turbopackIgnore: true */ process.cwd(), configuredPath);
  }

  if (process.env.VERCEL) {
    return path.join("/tmp", `palmpay-demo-${process.pid}.sqlite`);
  }

  return path.join(process.cwd(), "data", "palmpay-demo.sqlite");
}

function getPostgresPool() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Postgres");
  }

  if (!globalForDb.palmpayDemoPgPool) {
    globalForDb.palmpayDemoPgPool = new Pool({
      connectionString: databaseUrl,
      max: 5,
    });
  }

  return globalForDb.palmpayDemoPgPool;
}

function getSqliteDb() {
  if (!globalForDb.palmpayDemoSqlite) {
    const dbPath = resolveDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const sqlite = new Database(dbPath, {
      fileMustExist: false,
    });

    sqlite.pragma("busy_timeout = 5000");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    globalForDb.palmpayDemoSqlite = sqlite;
  }

  return globalForDb.palmpayDemoSqlite;
}

export const appDb: AppDb = databaseUrl
  ? { kind: "postgres", pool: getPostgresPool() }
  : { kind: "sqlite", sqlite: getSqliteDb() };

export const db = appDb.kind === "postgres" ? appDb.pool : appDb.sqlite;

export async function ensureAppTables() {
  if (!globalForDb.palmpayDemoAppTables) {
    globalForDb.palmpayDemoAppTables =
      appDb.kind === "postgres"
        ? ensurePostgresTables()
        : Promise.resolve(ensureSqliteTables());
  }

  return globalForDb.palmpayDemoAppTables;
}

async function ensurePostgresTables() {
  if (appDb.kind !== "postgres") {
    return;
  }

  await appDb.pool.query(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('qr', 'nfc', 'face', 'palm')),
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      token_ref TEXT NOT NULL UNIQUE,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMPTZ
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function ensureSqliteTables() {
  if (appDb.kind !== "sqlite") {
    return;
  }

  appDb.sqlite.exec(`
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
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}
