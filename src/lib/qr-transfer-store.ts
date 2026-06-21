import { getProduct } from "@/lib/catalog";
import type { CartLine } from "@/lib/types";

export type QrTransferStatus = "pending" | "paid";

export type QrTransfer = {
  id: string;
  transactionId: string;
  senderName: string;
  receiverName: string;
  amount: number;
  productSummary: string;
  items: CartLine[];
  pin: string;
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
  items: CartLine[];
  pin: string;
  productSummary?: string;
  senderName: string;
  transactionId: string;
}) {
  const existing = [...transfers().values()].find(
    (transfer) => transfer.transactionId === input.transactionId,
  );
  if (existing) return existing;

  const transfer: QrTransfer = {
    id: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
    transactionId: input.transactionId,
    senderName: input.senderName,
    receiverName: "Palm Pay",
    amount: input.amount,
    productSummary: input.productSummary || summarizeItems(input.items),
    items: input.items,
    pin: input.pin,
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

export function confirmQrTransfer(id: string, pin: string) {
  const transfer = getQrTransfer(id);
  if (!transfer) {
    return { error: "not_found" as const, transfer: null };
  }

  if (transfer.pin !== pin) {
    return { error: "pin_failed" as const, transfer };
  }

  const paidTransfer: QrTransfer = {
    ...transfer,
    status: "paid",
    authorizationCode:
      transfer.authorizationCode ?? `QR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    paidAt: transfer.paidAt ?? new Date().toISOString(),
  };

  transfers().set(id, paidTransfer);
  return { error: null, transfer: paidTransfer };
}

export function publicQrTransfer(transfer: QrTransfer) {
  return {
    amount: transfer.amount,
    authorizationCode: transfer.authorizationCode,
    createdAt: transfer.createdAt,
    id: transfer.id,
    items: transfer.items,
    paidAt: transfer.paidAt,
    productSummary: transfer.productSummary,
    receiverName: transfer.receiverName,
    senderName: transfer.senderName,
    status: transfer.status,
    transactionId: transfer.transactionId,
  };
}
