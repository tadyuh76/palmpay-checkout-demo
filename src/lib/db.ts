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
const allowSqliteFallback =
  process.env.PALMPAY_ALLOW_SQLITE_FALLBACK === "true";

if (!databaseUrl && !allowSqliteFallback) {
  throw new Error(
    "DATABASE_URL is required so every PalmPay process writes to the shared database. Set PALMPAY_ALLOW_SQLITE_FALLBACK=true only for disposable local tests.",
  );
}

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
    ensureSqliteAuthTables(sqlite);
    globalForDb.palmpayDemoSqlite = sqlite;
  }

  return globalForDb.palmpayDemoSqlite;
}

function ensureSqliteAuthTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" text not null primary key,
      "name" text not null,
      "email" text not null unique,
      "emailVerified" integer not null,
      "image" text,
      "createdAt" date not null,
      "updatedAt" date not null
    );

    CREATE TABLE IF NOT EXISTS "session" (
      "id" text not null primary key,
      "expiresAt" date not null,
      "token" text not null unique,
      "createdAt" date not null,
      "updatedAt" date not null,
      "ipAddress" text,
      "userAgent" text,
      "userId" text not null references "user" ("id") on delete cascade
    );

    CREATE INDEX IF NOT EXISTS "session_userId_idx" on "session" ("userId");

    CREATE TABLE IF NOT EXISTS "account" (
      "id" text not null primary key,
      "accountId" text not null,
      "providerId" text not null,
      "userId" text not null references "user" ("id") on delete cascade,
      "accessToken" text,
      "refreshToken" text,
      "idToken" text,
      "accessTokenExpiresAt" date,
      "refreshTokenExpiresAt" date,
      "scope" text,
      "password" text,
      "createdAt" date not null,
      "updatedAt" date not null
    );

    CREATE INDEX IF NOT EXISTS "account_userId_idx" on "account" ("userId");

    CREATE TABLE IF NOT EXISTS "verification" (
      "id" text not null primary key,
      "identifier" text not null,
      "value" text not null,
      "expiresAt" date not null,
      "createdAt" date not null,
      "updatedAt" date not null
    );

    CREATE INDEX IF NOT EXISTS "verification_identifier_idx" on "verification" ("identifier");
  `);
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

    CREATE TABLE IF NOT EXISTS experiment_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS experiment_sessions (
      participant_id TEXT PRIMARY KEY,
      assigned_group TEXT NOT NULL,
      session_status TEXT NOT NULL,
      session_json TEXT NOT NULL,
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_experiment_sessions_assigned_group
      ON experiment_sessions(assigned_group);

    CREATE INDEX IF NOT EXISTS idx_experiment_sessions_completed_at
      ON experiment_sessions(completed_at DESC);

    CREATE TABLE IF NOT EXISTS qr_transfers (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL UNIQUE,
      sender_name TEXT NOT NULL,
      receiver_name TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      product_summary TEXT NOT NULL,
      items_json TEXT NOT NULL,
      auth_method TEXT NOT NULL CHECK (auth_method IN ('pin', 'face')),
      pin TEXT,
      face_descriptor_json TEXT,
      match_distance DOUBLE PRECISION,
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid')),
      authorization_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_qr_transfers_status_created_at
      ON qr_transfers(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS nfc_taps (
      transaction_id TEXT PRIMARY KEY,
      card_ref TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_nfc_taps_created_at
      ON nfc_taps(created_at DESC);

    CREATE TABLE IF NOT EXISTS active_nfc_sessions (
      singleton_key TEXT PRIMARY KEY CHECK (singleton_key = 'active'),
      transaction_id TEXT NOT NULL,
      accepted_card_ref TEXT NOT NULL,
      amount NUMERIC,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS palm_templates (
      template_ref TEXT PRIMARY KEY,
      participant_id TEXT,
      transaction_id TEXT,
      template_data BYTEA NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_palm_templates_participant_id
      ON palm_templates(participant_id);
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

    CREATE TABLE IF NOT EXISTS experiment_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS experiment_sessions (
      participant_id TEXT PRIMARY KEY,
      assigned_group TEXT NOT NULL,
      session_status TEXT NOT NULL,
      session_json TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_experiment_sessions_assigned_group
      ON experiment_sessions(assigned_group);

    CREATE INDEX IF NOT EXISTS idx_experiment_sessions_completed_at
      ON experiment_sessions(completed_at DESC);

    CREATE TABLE IF NOT EXISTS qr_transfers (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL UNIQUE,
      sender_name TEXT NOT NULL,
      receiver_name TEXT NOT NULL,
      amount REAL NOT NULL,
      product_summary TEXT NOT NULL,
      items_json TEXT NOT NULL,
      auth_method TEXT NOT NULL CHECK (auth_method IN ('pin', 'face')),
      pin TEXT,
      face_descriptor_json TEXT,
      match_distance REAL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid')),
      authorization_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_qr_transfers_status_created_at
      ON qr_transfers(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS nfc_taps (
      transaction_id TEXT PRIMARY KEY,
      card_ref TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_nfc_taps_created_at
      ON nfc_taps(created_at DESC);

    CREATE TABLE IF NOT EXISTS active_nfc_sessions (
      singleton_key TEXT PRIMARY KEY CHECK (singleton_key = 'active'),
      transaction_id TEXT NOT NULL,
      accepted_card_ref TEXT NOT NULL,
      amount REAL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS palm_templates (
      template_ref TEXT PRIMARY KEY,
      participant_id TEXT,
      transaction_id TEXT,
      template_data BLOB NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_palm_templates_participant_id
      ON palm_templates(participant_id);
  `);
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}
