import { getProduct } from "@/lib/catalog";
import { appDb, ensureAppTables } from "@/lib/db";
import type { CartLine } from "@/lib/types";

export type QrTransferStatus = "pending" | "paid";
export type QrTransferAuthMethod = "pin" | "face";

const faceMatchThreshold = 0.55;

export type QrTransfer = {
  id: string;
  transactionId: string;
  senderName: string;
  receiverName: string;
  amount: number;
  productSummary: string;
  items: CartLine[];
  authMethod: QrTransferAuthMethod;
  pin: string | null;
  faceDescriptor: number[] | null;
  matchDistance: number | null;
  status: QrTransferStatus;
  authorizationCode: string | null;
  createdAt: string;
  paidAt: string | null;
};

type QrTransferRow = {
  amount: number | string;
  auth_method: string;
  authorization_code: string | null;
  created_at: Date | string;
  face_descriptor_json: string | null;
  id: string;
  items_json: string;
  match_distance: number | string | null;
  paid_at: Date | string | null;
  pin: string | null;
  product_summary: string;
  receiver_name: string;
  sender_name: string;
  status: string;
  transaction_id: string;
};

function parseJson(value: string | null, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseCartLines(value: string) {
  const items = parseJson(value, []);
  if (!Array.isArray(items)) return [];

  return items.flatMap((item): CartLine[] => {
    if (!item || typeof item !== "object") return [];

    const productId = Reflect.get(item, "productId");
    const quantity = Reflect.get(item, "quantity");

    if (typeof productId !== "string" || typeof quantity !== "number") {
      return [];
    }

    return [{ productId, quantity }];
  });
}

function parseNumberArray(value: string | null) {
  const numbers = parseJson(value, []);
  if (!Array.isArray(numbers)) return null;

  const descriptor = numbers.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  return descriptor.length ? descriptor : null;
}

function serializeDate(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function rowToQrTransfer(row: QrTransferRow): QrTransfer {
  return {
    amount: Number(row.amount),
    authMethod: row.auth_method === "face" ? "face" : "pin",
    authorizationCode: row.authorization_code,
    createdAt: serializeDate(row.created_at) ?? new Date().toISOString(),
    faceDescriptor: parseNumberArray(row.face_descriptor_json),
    id: row.id,
    items: parseCartLines(row.items_json),
    matchDistance:
      row.match_distance === null ? null : Number(row.match_distance),
    paidAt: serializeDate(row.paid_at),
    pin: row.pin,
    productSummary: row.product_summary,
    receiverName: row.receiver_name,
    senderName: row.sender_name,
    status: row.status === "paid" ? "paid" : "pending",
    transactionId: row.transaction_id,
  };
}

async function findQrTransferByTransactionId(transactionId: string) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<QrTransferRow>(
      "SELECT * FROM qr_transfers WHERE transaction_id = $1",
      [transactionId],
    );
    return result.rows[0] ? rowToQrTransfer(result.rows[0]) : null;
  }

  const row = appDb.sqlite
    .prepare("SELECT * FROM qr_transfers WHERE transaction_id = ?")
    .get(transactionId) as QrTransferRow | undefined;

  return row ? rowToQrTransfer(row) : null;
}

export function summarizeItems(items: CartLine[]) {
  return items
    .map((line) => {
      const product = getProduct(line.productId);
      return `${product?.name ?? line.productId} x${line.quantity}`;
    })
    .join("; ");
}

export async function createQrTransfer(input: {
  amount: number;
  authMethod?: QrTransferAuthMethod;
  faceDescriptor?: number[] | null;
  items: CartLine[];
  pin?: string | null;
  productSummary?: string;
  senderName: string;
  transactionId: string;
}) {
  const existing = await findQrTransferByTransactionId(input.transactionId);
  if (existing) return existing;

  const authMethod = input.authMethod ?? "pin";
  const transfer: QrTransfer = {
    id: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
    transactionId: input.transactionId,
    senderName: input.senderName,
    receiverName: "Palm Pay",
    amount: input.amount,
    productSummary: input.productSummary || summarizeItems(input.items),
    items: input.items,
    authMethod,
    pin: authMethod === "pin" ? input.pin ?? null : null,
    faceDescriptor: authMethod === "face" ? input.faceDescriptor ?? null : null,
    matchDistance: null,
    status: "pending",
    authorizationCode: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
  };

  const values = [
    transfer.id,
    transfer.transactionId,
    transfer.senderName,
    transfer.receiverName,
    transfer.amount,
    transfer.productSummary,
    JSON.stringify(transfer.items),
    transfer.authMethod,
    transfer.pin,
    transfer.faceDescriptor ? JSON.stringify(transfer.faceDescriptor) : null,
    transfer.matchDistance,
    transfer.status,
    transfer.authorizationCode,
    transfer.createdAt,
    transfer.paidAt,
  ];

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<QrTransferRow>(
      `INSERT INTO qr_transfers (
        id,
        transaction_id,
        sender_name,
        receiver_name,
        amount,
        product_summary,
        items_json,
        auth_method,
        pin,
        face_descriptor_json,
        match_distance,
        status,
        authorization_code,
        created_at,
        paid_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (transaction_id) DO NOTHING
      RETURNING *`,
      values,
    );

    if (result.rows[0]) {
      return rowToQrTransfer(result.rows[0]);
    }

    return (await findQrTransferByTransactionId(input.transactionId)) ?? transfer;
  }

  appDb.sqlite
    .prepare(
      `INSERT OR IGNORE INTO qr_transfers (
        id,
        transaction_id,
        sender_name,
        receiver_name,
        amount,
        product_summary,
        items_json,
        auth_method,
        pin,
        face_descriptor_json,
        match_distance,
        status,
        authorization_code,
        created_at,
        paid_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(...values);

  return (await findQrTransferByTransactionId(input.transactionId)) ?? transfer;
}

export async function getQrTransfer(id: string) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<QrTransferRow>(
      "SELECT * FROM qr_transfers WHERE id = $1",
      [id],
    );
    return result.rows[0] ? rowToQrTransfer(result.rows[0]) : null;
  }

  const row = appDb.sqlite
    .prepare("SELECT * FROM qr_transfers WHERE id = ?")
    .get(id) as QrTransferRow | undefined;

  return row ? rowToQrTransfer(row) : null;
}

function euclideanDistance(left: number[], right: number[]) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  const squared = left.reduce((total, value, index) => {
    const delta = value - right[index];
    return total + delta * delta;
  }, 0);
  return Math.sqrt(squared);
}

export async function confirmQrTransfer(
  id: string,
  credentials: { faceDescriptor?: number[]; pin?: string },
) {
  const transfer = await getQrTransfer(id);
  if (!transfer) {
    return { error: "not_found" as const, transfer: null };
  }

  if (transfer.status === "paid") {
    return { error: null, transfer };
  }

  let matchDistance: number | null = null;

  if (transfer.authMethod === "pin") {
    if (transfer.pin !== credentials.pin) {
      return { error: "pin_failed" as const, transfer };
    }
  } else {
    if (!transfer.faceDescriptor?.length) {
      return { error: "face_no_template" as const, transfer };
    }
    if (!credentials.faceDescriptor?.length) {
      return { error: "face_required" as const, transfer };
    }

    matchDistance = euclideanDistance(
      transfer.faceDescriptor,
      credentials.faceDescriptor,
    );
    if (matchDistance > faceMatchThreshold) {
      return {
        error: "face_failed" as const,
        matchDistance,
        threshold: faceMatchThreshold,
        transfer,
      };
    }
  }

  const paidTransfer: QrTransfer = {
    ...transfer,
    faceDescriptor: null,
    matchDistance,
    status: "paid",
    authorizationCode:
      transfer.authorizationCode ??
      `${transfer.authMethod === "face" ? "FACE" : "QR"}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`,
    paidAt: transfer.paidAt ?? new Date().toISOString(),
  };

  if (appDb.kind === "postgres") {
    await appDb.pool.query(
      `UPDATE qr_transfers
       SET
        face_descriptor_json = NULL,
        match_distance = $2,
        status = 'paid',
        authorization_code = $3,
        paid_at = $4
       WHERE id = $1`,
      [
        id,
        paidTransfer.matchDistance,
        paidTransfer.authorizationCode,
        paidTransfer.paidAt,
      ],
    );
  } else {
    appDb.sqlite
      .prepare(
        `UPDATE qr_transfers
         SET
          face_descriptor_json = NULL,
          match_distance = ?,
          status = 'paid',
          authorization_code = ?,
          paid_at = ?
         WHERE id = ?`,
      )
      .run(
        paidTransfer.matchDistance,
        paidTransfer.authorizationCode,
        paidTransfer.paidAt,
        id,
      );
  }

  return {
    error: null,
    matchDistance,
    threshold: transfer.authMethod === "face" ? faceMatchThreshold : undefined,
    transfer: paidTransfer,
  };
}

export function publicQrTransfer(transfer: QrTransfer) {
  return {
    amount: transfer.amount,
    authMethod: transfer.authMethod,
    authorizationCode: transfer.authorizationCode,
    createdAt: transfer.createdAt,
    id: transfer.id,
    items: transfer.items,
    matchDistance: transfer.matchDistance,
    paidAt: transfer.paidAt,
    productSummary: transfer.productSummary,
    receiverName: transfer.receiverName,
    senderName: transfer.senderName,
    status: transfer.status,
    transactionId: transfer.transactionId,
  };
}
