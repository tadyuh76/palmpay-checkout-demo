import { appDb, ensureAppTables } from "@/lib/db";

export type PalmTemplateRecord = {
  createdAt: string;
  data: Buffer;
  deletedAt: string | null;
  metadata: Record<string, unknown>;
  participantId: string | null;
  templateRef: string;
  transactionId: string | null;
  updatedAt: string;
};

type PalmTemplateRow = {
  created_at: Date | string;
  deleted_at: Date | string | null;
  metadata_json: string;
  participant_id: string | null;
  template_data: Buffer;
  template_ref: string;
  transaction_id: string | null;
  updated_at: Date | string;
};

function serializeDate(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function parseMetadata(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function rowToPalmTemplate(row: PalmTemplateRow): PalmTemplateRecord {
  return {
    createdAt: serializeDate(row.created_at) ?? "",
    data: Buffer.from(row.template_data),
    deletedAt: serializeDate(row.deleted_at),
    metadata: parseMetadata(row.metadata_json),
    participantId: row.participant_id,
    templateRef: row.template_ref,
    transactionId: row.transaction_id,
    updatedAt: serializeDate(row.updated_at) ?? "",
  };
}

export async function upsertPalmTemplate(input: {
  data: Buffer;
  metadata?: Record<string, unknown>;
  participantId?: string | null;
  templateRef: string;
  transactionId?: string | null;
}) {
  await ensureAppTables();

  const metadataJson = JSON.stringify(input.metadata ?? {});
  const participantId = input.participantId || null;
  const transactionId = input.transactionId || null;

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<PalmTemplateRow>(
      `INSERT INTO palm_templates (
        template_ref,
        participant_id,
        transaction_id,
        template_data,
        metadata_json,
        deleted_at
      )
      VALUES ($1, $2, $3, $4, $5, NULL)
      ON CONFLICT (template_ref)
      DO UPDATE SET
        participant_id = EXCLUDED.participant_id,
        transaction_id = EXCLUDED.transaction_id,
        template_data = EXCLUDED.template_data,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = CURRENT_TIMESTAMP,
        deleted_at = NULL
      RETURNING *`,
      [input.templateRef, participantId, transactionId, input.data, metadataJson],
    );

    return rowToPalmTemplate(result.rows[0]);
  }

  const row = appDb.sqlite
    .prepare(
      `INSERT INTO palm_templates (
        template_ref,
        participant_id,
        transaction_id,
        template_data,
        metadata_json,
        deleted_at
      )
      VALUES (?, ?, ?, ?, ?, NULL)
      ON CONFLICT(template_ref)
      DO UPDATE SET
        participant_id = excluded.participant_id,
        transaction_id = excluded.transaction_id,
        template_data = excluded.template_data,
        metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP,
        deleted_at = NULL
      RETURNING *`,
    )
    .get(
      input.templateRef,
      participantId,
      transactionId,
      input.data,
      metadataJson,
    ) as PalmTemplateRow;

  return rowToPalmTemplate(row);
}

export async function getPalmTemplate(templateRef: string) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<PalmTemplateRow>(
      "SELECT * FROM palm_templates WHERE template_ref = $1 AND deleted_at IS NULL",
      [templateRef],
    );
    return result.rows[0] ? rowToPalmTemplate(result.rows[0]) : null;
  }

  const row = appDb.sqlite
    .prepare(
      "SELECT * FROM palm_templates WHERE template_ref = ? AND deleted_at IS NULL",
    )
    .get(templateRef) as PalmTemplateRow | undefined;

  return row ? rowToPalmTemplate(row) : null;
}

export async function markPalmTemplateDeleted(templateRef: string) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<{ deleted: boolean }>(
      `UPDATE palm_templates
       SET
        template_data = $2,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE template_ref = $1 AND deleted_at IS NULL
       RETURNING TRUE AS deleted`,
      [templateRef, Buffer.alloc(0)],
    );
    return Boolean(result.rows[0]?.deleted);
  }

  const result = appDb.sqlite
    .prepare(
      `UPDATE palm_templates
       SET
        template_data = ?,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE template_ref = ? AND deleted_at IS NULL`,
    )
    .run(Buffer.alloc(0), templateRef);

  return result.changes > 0;
}
