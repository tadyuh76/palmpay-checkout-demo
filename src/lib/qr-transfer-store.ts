import { getProduct } from "@/lib/catalog";
import {
  decryptFaceDescriptor,
  encryptFaceDescriptor,
} from "@/lib/biometric-crypto";
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

type DbTimestamp = string | Date | null;

type QrTransferRow = {
  id: string;
  transaction_id: string;
  sender_name: string;
  receiver_name: string;
  amount: number;
  product_summary: string;
  items_json: string;
  auth_method: QrTransferAuthMethod;
  pin: string | null;
  face_descriptor_json: string | null;
  match_distance: number | null;
  status: QrTransferStatus;
  authorization_code: string | null;
  created_at: DbTimestamp;
  paid_at: DbTimestamp;
};

function asText(value: DbTimestamp) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function parseItems(value: string) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

function parseFaceDescriptor(value: string | null) {
  if (!value) return null;
  try {
    return decryptFaceDescriptor(JSON.parse(value));
  } catch {
    return null;
  }
}

function toTransfer(row: QrTransferRow): QrTransfer {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    senderName: row.sender_name,
    receiverName: row.receiver_name,
    amount: row.amount,
    productSummary: row.product_summary,
    items: parseItems(row.items_json),
    authMethod: row.auth_method,
    pin: row.pin,
    faceDescriptor: parseFaceDescriptor(row.face_descriptor_json),
    matchDistance: row.match_distance,
    status: row.status,
    authorizationCode: row.authorization_code,
    createdAt: asText(row.created_at) ?? "",
    paidAt: asText(row.paid_at),
  };
}

function createTransferId() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
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
  await ensureAppTables();

  const authMethod = input.authMethod ?? "pin";
  const transfer: QrTransfer = {
    id: createTransferId(),
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

  const itemsJson = JSON.stringify(transfer.items);
  const faceDescriptorJson = transfer.faceDescriptor
    ? JSON.stringify(encryptFaceDescriptor(transfer.faceDescriptor))
    : null;

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<QrTransferRow>(
      `INSERT INTO qr_transfers
        (id, transaction_id, sender_name, receiver_name, amount, product_summary,
         items_json, auth_method, pin, face_descriptor_json, match_distance,
         status, authorization_code, created_at, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (transaction_id)
       DO UPDATE SET transaction_id = EXCLUDED.transaction_id
       RETURNING *`,
      [
        transfer.id,
        transfer.transactionId,
        transfer.senderName,
        transfer.receiverName,
        transfer.amount,
        transfer.productSummary,
        itemsJson,
        transfer.authMethod,
        transfer.pin,
        faceDescriptorJson,
        transfer.matchDistance,
        transfer.status,
        transfer.authorizationCode,
        transfer.createdAt,
        transfer.paidAt,
      ],
    );

    return toTransfer(result.rows[0]);
  }

  appDb.sqlite
    .prepare(
      `INSERT INTO qr_transfers
        (id, transaction_id, sender_name, receiver_name, amount, product_summary,
         items_json, auth_method, pin, face_descriptor_json, match_distance,
         status, authorization_code, created_at, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(transaction_id) DO NOTHING`,
    )
    .run(
      transfer.id,
      transfer.transactionId,
      transfer.senderName,
      transfer.receiverName,
      transfer.amount,
      transfer.productSummary,
      itemsJson,
      transfer.authMethod,
      transfer.pin,
      faceDescriptorJson,
      transfer.matchDistance,
      transfer.status,
      transfer.authorizationCode,
      transfer.createdAt,
      transfer.paidAt,
    );

  const row = appDb.sqlite
    .prepare("SELECT * FROM qr_transfers WHERE transaction_id = ?")
    .get(transfer.transactionId) as QrTransferRow;

  return toTransfer(row);
}

export async function getQrTransfer(id: string) {
  await ensureAppTables();

  if (appDb.kind === "postgres") {
    const result = await appDb.pool.query<QrTransferRow>(
      "SELECT * FROM qr_transfers WHERE id = $1 LIMIT 1",
      [id],
    );
    return result.rows[0] ? toTransfer(result.rows[0]) : null;
  }

  const row = appDb.sqlite
    .prepare("SELECT * FROM qr_transfers WHERE id = ? LIMIT 1")
    .get(id) as QrTransferRow | undefined;

  return row ? toTransfer(row) : null;
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
    const result = await appDb.pool.query<QrTransferRow>(
      `UPDATE qr_transfers
       SET face_descriptor_json = NULL,
           match_distance = $1,
           status = 'paid',
           authorization_code = $2,
           paid_at = $3
       WHERE id = $4
       RETURNING *`,
      [
        paidTransfer.matchDistance,
        paidTransfer.authorizationCode,
        paidTransfer.paidAt,
        paidTransfer.id,
      ],
    );

    return {
      error: null,
      matchDistance,
      threshold: transfer.authMethod === "face" ? faceMatchThreshold : undefined,
      transfer: toTransfer(result.rows[0]),
    };
  }

  appDb.sqlite
    .prepare(
      `UPDATE qr_transfers
       SET face_descriptor_json = NULL,
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
      paidTransfer.id,
    );

  const updated = await getQrTransfer(paidTransfer.id);
  return {
    error: null,
    matchDistance,
    threshold: transfer.authMethod === "face" ? faceMatchThreshold : undefined,
    transfer: updated ?? paidTransfer,
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
