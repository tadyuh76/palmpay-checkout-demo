import { appDb, ensureAppTables } from "@/lib/db";

export type ActiveNfcSession = {
  acceptedCardRef: string;
  amount: number | null;
  createdAt: string;
  expiresAt: string;
  transactionId: string;
};

type ActiveNfcSessionRow = {
  accepted_card_ref: string;
  amount: number | string | null;
  created_at: Date | string;
  expires_at: Date | string;
  transaction_id: string;
};

const activeSessionKey = "active";
const sessionTtlMs = 5 * 60 * 1000;

function serializeDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function rowToActiveNfcSession(row: ActiveNfcSessionRow): ActiveNfcSession {
  return {
    acceptedCardRef: row.accepted_card_ref,
    amount: row.amount === null ? null : Number(row.amount),
    createdAt: serializeDate(row.created_at),
    expiresAt: serializeDate(row.expires_at),
    transactionId: row.transaction_id,
  };
}

function rowIsExpired(row: ActiveNfcSessionRow) {
  return Date.parse(serializeDate(row.expires_at)) <= Date.now();
}

export async function setActiveNfcSession(input: {
  acceptedCardRef: string;
  amount?: number | null;
  transactionId: string;
}) {
  await ensureAppTables();

  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + sessionTtlMs).toISOString();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<ActiveNfcSessionRow>(
      `INSERT INTO active_nfc_sessions (
        singleton_key,
        transaction_id,
        accepted_card_ref,
        amount,
        created_at,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (singleton_key)
      DO UPDATE SET
        transaction_id = EXCLUDED.transaction_id,
        accepted_card_ref = EXCLUDED.accepted_card_ref,
        amount = EXCLUDED.amount,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at
      RETURNING *`,
      [
        activeSessionKey,
        input.transactionId,
        input.acceptedCardRef,
        input.amount ?? null,
        createdAt,
        expiresAt,
      ],
    );

    return rowToActiveNfcSession(result.rows[0]);
  }

  const row = appDb.sqlite
    .prepare(
      `INSERT INTO active_nfc_sessions (
        singleton_key,
        transaction_id,
        accepted_card_ref,
        amount,
        created_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(singleton_key)
      DO UPDATE SET
        transaction_id = excluded.transaction_id,
        accepted_card_ref = excluded.accepted_card_ref,
        amount = excluded.amount,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
      RETURNING *`,
    )
    .get(
      activeSessionKey,
      input.transactionId,
      input.acceptedCardRef,
      input.amount ?? null,
      createdAt,
      expiresAt,
    ) as ActiveNfcSessionRow;

  return rowToActiveNfcSession(row);
}

export async function getActiveNfcSession() {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    await appDb.pool.query(
      "DELETE FROM active_nfc_sessions WHERE expires_at <= CURRENT_TIMESTAMP",
    );
    const result = await appDb.pool.query<ActiveNfcSessionRow>(
      "SELECT * FROM active_nfc_sessions WHERE singleton_key = $1",
      [activeSessionKey],
    );
    return result.rows[0] ? rowToActiveNfcSession(result.rows[0]) : null;
  }

  const row = appDb.sqlite
    .prepare("SELECT * FROM active_nfc_sessions WHERE singleton_key = ?")
    .get(activeSessionKey) as ActiveNfcSessionRow | undefined;

  if (row && rowIsExpired(row)) {
    appDb.sqlite
      .prepare("DELETE FROM active_nfc_sessions WHERE singleton_key = ?")
      .run(activeSessionKey);
    return null;
  }

  return row ? rowToActiveNfcSession(row) : null;
}

export async function clearActiveNfcSession(transactionId?: string) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    if (transactionId) {
      await appDb.pool.query(
        `DELETE FROM active_nfc_sessions
         WHERE singleton_key = $1 AND transaction_id = $2`,
        [activeSessionKey, transactionId],
      );
    } else {
      await appDb.pool.query(
        "DELETE FROM active_nfc_sessions WHERE singleton_key = $1",
        [activeSessionKey],
      );
    }
    return getActiveNfcSession();
  }

  if (transactionId) {
    appDb.sqlite
      .prepare(
        `DELETE FROM active_nfc_sessions
         WHERE singleton_key = ? AND transaction_id = ?`,
      )
      .run(activeSessionKey, transactionId);
  } else {
    appDb.sqlite
      .prepare("DELETE FROM active_nfc_sessions WHERE singleton_key = ?")
      .run(activeSessionKey);
  }

  return getActiveNfcSession();
}
