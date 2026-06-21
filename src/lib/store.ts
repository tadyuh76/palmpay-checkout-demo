import { catalog } from "@/lib/catalog";
import { appDb, createId, ensureAppTables } from "@/lib/db";
import type { CartLine, Order, PaymentMethod, PaymentMethodType } from "@/lib/types";

type DbTimestamp = string | Date | null;

type MethodRow = {
  id: string;
  user_id: string;
  type: PaymentMethodType;
  label: string;
  status: "active" | "disabled";
  token_ref: string;
  metadata_json: string;
  created_at: DbTimestamp;
  last_used_at: DbTimestamp;
};

type OrderRow = {
  id: string;
  user_id: string;
  items_json: string;
  total_cents: number;
  status: "paid" | "failed";
  payment_method_type: PaymentMethodType;
  payment_method_id: string;
  authorization_code: string;
  device_trace_json: string;
  created_at: DbTimestamp;
};

export type ActivePaymentMethod = {
  id: string;
  type: PaymentMethodType;
};

export type CreateOrderInput = {
  userId: string;
  items: CartLine[];
  totalCents: number;
  method: ActivePaymentMethod;
  deviceTrace: Record<string, unknown>;
};

function asText(value: DbTimestamp) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toPaymentMethod(row: MethodRow): PaymentMethod {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    label: row.label,
    status: row.status,
    tokenRef: row.token_ref,
    metadata: parseJsonObject(row.metadata_json),
    createdAt: asText(row.created_at) ?? "",
    lastUsedAt: asText(row.last_used_at),
  };
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    items: JSON.parse(row.items_json || "[]") as CartLine[],
    totalCents: row.total_cents,
    status: row.status,
    paymentMethodType: row.payment_method_type,
    paymentMethodId: row.payment_method_id,
    authorizationCode: row.authorization_code,
    deviceTrace: parseJsonObject(row.device_trace_json),
    createdAt: asText(row.created_at) ?? "",
  };
}

export async function listPaymentMethods(userId: string) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<MethodRow>(
      `SELECT * FROM payment_methods
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at ASC`,
      [userId],
    );

    return result.rows.map(toPaymentMethod);
  }

  const rows = appDb.sqlite
    .prepare(
      `SELECT * FROM payment_methods
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at ASC`,
    )
    .all(userId) as MethodRow[];

  return rows.map(toPaymentMethod);
}

export async function upsertPaymentMethod({
  userId,
  type,
  label,
  metadata,
}: {
  userId: string;
  type: PaymentMethodType;
  label: string;
  metadata: Record<string, unknown>;
}) {
  await ensureAppTables();

  const metadataJson = JSON.stringify(metadata);

  if (appDb.kind === "postgres") {
    const existing = await appDb.pool.query<MethodRow>(
      `SELECT * FROM payment_methods
       WHERE user_id = $1 AND type = $2 AND status = 'active'
       LIMIT 1`,
      [userId, type],
    );

    if (existing.rows[0]) {
      const updated = await appDb.pool.query<MethodRow>(
        `UPDATE payment_methods
         SET label = $1, metadata_json = $2
         WHERE id = $3
         RETURNING *`,
        [label, metadataJson, existing.rows[0].id],
      );

      return toPaymentMethod(updated.rows[0]);
    }

    const created = await appDb.pool.query<MethodRow>(
      `INSERT INTO payment_methods
        (id, user_id, type, label, token_ref, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [createId("pm"), userId, type, label, `${type}_${crypto.randomUUID()}`, metadataJson],
    );

    return toPaymentMethod(created.rows[0]);
  }

  const existing = appDb.sqlite
    .prepare(
      `SELECT * FROM payment_methods
       WHERE user_id = ? AND type = ? AND status = 'active'
       LIMIT 1`,
    )
    .get(userId, type) as MethodRow | undefined;

  if (existing) {
    appDb.sqlite
      .prepare(
        `UPDATE payment_methods
         SET label = ?, metadata_json = ?
         WHERE id = ?`,
      )
      .run(label, metadataJson, existing.id);

    const updated = appDb.sqlite
      .prepare("SELECT * FROM payment_methods WHERE id = ?")
      .get(existing.id) as MethodRow;

    return toPaymentMethod(updated);
  }

  const id = createId("pm");
  appDb.sqlite
    .prepare(
      `INSERT INTO payment_methods
        (id, user_id, type, label, token_ref, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, userId, type, label, `${type}_${crypto.randomUUID()}`, metadataJson);

  const row = appDb.sqlite
    .prepare("SELECT * FROM payment_methods WHERE id = ?")
    .get(id) as MethodRow;

  return toPaymentMethod(row);
}

export async function disablePaymentMethod(userId: string, id: string) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    await appDb.pool.query(
      `UPDATE payment_methods
       SET status = 'disabled'
       WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return;
  }

  appDb.sqlite
    .prepare(
      `UPDATE payment_methods
       SET status = 'disabled'
       WHERE id = ? AND user_id = ?`,
    )
    .run(id, userId);
}

export async function listOrders(userId: string) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<OrderRow>(
      `SELECT * FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 8`,
      [userId],
    );

    return result.rows.map(toOrder);
  }

  const rows = appDb.sqlite
    .prepare(
      `SELECT * FROM orders
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 8`,
    )
    .all(userId) as OrderRow[];

  return rows.map(toOrder);
}

export async function getActivePaymentMethod(
  userId: string,
  methodId: string,
) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<ActivePaymentMethod>(
      `SELECT id, type FROM payment_methods
       WHERE id = $1 AND user_id = $2 AND status = 'active'
       LIMIT 1`,
      [methodId, userId],
    );

    return result.rows[0];
  }

  return appDb.sqlite
    .prepare(
      `SELECT id, type FROM payment_methods
       WHERE id = ? AND user_id = ? AND status = 'active'
       LIMIT 1`,
    )
    .get(methodId, userId) as ActivePaymentMethod | undefined;
}

export async function createPaidOrder(input: CreateOrderInput) {
  await ensureAppTables();

  const orderId = createId("ord");
  const authCode = `PP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const itemsJson = JSON.stringify(input.items);
  const traceJson = JSON.stringify(input.deviceTrace);
  const eventJson = JSON.stringify({
    totalCents: input.totalCents,
    productCount: input.items.reduce((sum, item) => sum + item.quantity, 0),
    catalogVersion: catalog.length,
  });

  if (appDb.kind === "postgres") {
    const client = await appDb.pool.connect();
    try {
      await client.query("BEGIN");
      const order = await client.query<OrderRow>(
        `INSERT INTO orders
          (id, user_id, items_json, total_cents, status, payment_method_type,
           payment_method_id, authorization_code, device_trace_json)
         VALUES ($1, $2, $3, $4, 'paid', $5, $6, $7, $8)
         RETURNING *`,
        [
          orderId,
          input.userId,
          itemsJson,
          input.totalCents,
          input.method.type,
          input.method.id,
          authCode,
          traceJson,
        ],
      );

      await client.query(
        `UPDATE payment_methods
         SET last_used_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [input.method.id],
      );

      await client.query(
        `INSERT INTO payment_events
          (id, order_id, user_id, method_type, step, details_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          createId("evt"),
          orderId,
          input.userId,
          input.method.type,
          "authorized",
          eventJson,
        ],
      );

      await client.query("COMMIT");
      return toOrder(order.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const sqlite = appDb.sqlite;
  const create = sqlite.transaction(() => {
    sqlite
      .prepare(
        `INSERT INTO orders
          (id, user_id, items_json, total_cents, status, payment_method_type,
           payment_method_id, authorization_code, device_trace_json)
         VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, ?)`,
      )
      .run(
        orderId,
        input.userId,
        itemsJson,
        input.totalCents,
        input.method.type,
        input.method.id,
        authCode,
        traceJson,
      );

    sqlite
      .prepare(
        `UPDATE payment_methods
         SET last_used_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(input.method.id);

    sqlite
      .prepare(
        `INSERT INTO payment_events
          (id, order_id, user_id, method_type, step, details_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        createId("evt"),
        orderId,
        input.userId,
        input.method.type,
        "authorized",
        eventJson,
      );

    return sqlite
      .prepare("SELECT * FROM orders WHERE id = ?")
      .get(orderId) as OrderRow;
  });

  return toOrder(create());
}
