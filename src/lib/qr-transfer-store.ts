import { getProduct } from "@/lib/catalog";
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

const globalForQrTransfers = globalThis as unknown as {
  palmpayQrTransfers?: Map<string, QrTransfer>;
};

function transfers() {
  if (!globalForQrTransfers.palmpayQrTransfers) {
    globalForQrTransfers.palmpayQrTransfers = new Map();
  }
  return globalForQrTransfers.palmpayQrTransfers;
}

export function summarizeItems(items: CartLine[]) {
  return items
    .map((line) => {
      const product = getProduct(line.productId);
      return `${product?.name ?? line.productId} x${line.quantity}`;
    })
    .join("; ");
}

export function createQrTransfer(input: {
  amount: number;
  authMethod?: QrTransferAuthMethod;
  faceDescriptor?: number[] | null;
  items: CartLine[];
  pin?: string | null;
  productSummary?: string;
  senderName: string;
  transactionId: string;
}) {
  const existing = [...transfers().values()].find(
    (transfer) => transfer.transactionId === input.transactionId,
  );
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

  transfers().set(transfer.id, transfer);
  return transfer;
}

export function getQrTransfer(id: string) {
  return transfers().get(id) ?? null;
}

function euclideanDistance(left: number[], right: number[]) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  const squared = left.reduce((total, value, index) => {
    const delta = value - right[index];
    return total + delta * delta;
  }, 0);
  return Math.sqrt(squared);
}

export function confirmQrTransfer(
  id: string,
  credentials: { faceDescriptor?: number[]; pin?: string },
) {
  const transfer = getQrTransfer(id);
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

  transfers().set(id, paidTransfer);
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
