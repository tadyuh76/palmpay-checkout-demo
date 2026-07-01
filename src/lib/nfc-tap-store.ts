import { appDb, ensureAppTables } from "@/lib/db";

export type NfcTap = {
  cardRef: string;
  createdAt: string;
  transactionId: string;
};

type NfcTapRow = {
  card_ref: string;
  created_at: Date | string;
  transaction_id: string;
};

function serializeDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function rowToNfcTap(row: NfcTapRow): NfcTap {
  return {
    cardRef: row.card_ref,
    createdAt: serializeDate(row.created_at),
    transactionId: row.transaction_id,
  };
}

export async function recordNfcTap(input: {
  cardRef: string;
  transactionId: string;
}) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<NfcTapRow>(
      `INSERT INTO nfc_taps (transaction_id, card_ref, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (transaction_id)
       DO UPDATE SET card_ref = EXCLUDED.card_ref, created_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [input.transactionId, input.cardRef],
    );

    return rowToNfcTap(result.rows[0]);
  }

  const row = appDb.sqlite
    .prepare(
      `INSERT INTO nfc_taps (transaction_id, card_ref, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(transaction_id)
       DO UPDATE SET card_ref = excluded.card_ref, created_at = CURRENT_TIMESTAMP
       RETURNING *`,
    )
    .get(input.transactionId, input.cardRef) as NfcTapRow;

  return rowToNfcTap(row);
}

export async function getNfcTap(transactionId: string) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<NfcTapRow>(
      "SELECT * FROM nfc_taps WHERE transaction_id = $1",
      [transactionId],
    );
    return result.rows[0] ? rowToNfcTap(result.rows[0]) : null;
  }

  const row = appDb.sqlite
    .prepare("SELECT * FROM nfc_taps WHERE transaction_id = ?")
    .get(transactionId) as NfcTapRow | undefined;

  return row ? rowToNfcTap(row) : null;
}
