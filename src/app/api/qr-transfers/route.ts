import {
  createQrTransfer,
  publicQrTransfer,
  type QrTransferAuthMethod,
} from "@/lib/qr-transfer-store";
import type { CartLine } from "@/lib/types";

export const runtime = "nodejs";

function parseFaceDescriptor(value: unknown) {
  if (!Array.isArray(value)) return null;
  const descriptor = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );
  return descriptor.length >= 32 ? descriptor : null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    amount?: unknown;
    authMethod?: unknown;
    faceDescriptor?: unknown;
    items?: unknown;
    pin?: unknown;
    productSummary?: unknown;
    senderName?: unknown;
    transactionId?: unknown;
  } | null;

  const authMethod: QrTransferAuthMethod =
    body?.authMethod === "face" ? "face" : "pin";

  if (
    !body ||
    typeof body.amount !== "number" ||
    !Array.isArray(body.items) ||
    typeof body.senderName !== "string" ||
    typeof body.transactionId !== "string"
  ) {
    return Response.json({ error: "Invalid QR transfer" }, { status: 400 });
  }

  if (
    authMethod === "pin" &&
    (typeof body.pin !== "string" || !/^\d{4}$/.test(body.pin))
  ) {
    return Response.json({ error: "Invalid PIN transfer" }, { status: 400 });
  }

  const faceDescriptor =
    authMethod === "face" ? parseFaceDescriptor(body.faceDescriptor) : null;
  if (authMethod === "face" && !faceDescriptor) {
    return Response.json({ error: "Invalid face transfer" }, { status: 400 });
  }

  const items = body.items.filter(
    (item): item is CartLine =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof Reflect.get(item, "productId") === "string" &&
      typeof Reflect.get(item, "quantity") === "number",
  );

  if (!items.length || body.amount <= 0) {
    return Response.json({ error: "Invalid QR transfer" }, { status: 400 });
  }

  const transfer = createQrTransfer({
    amount: body.amount,
    authMethod,
    faceDescriptor,
    items,
    pin: typeof body.pin === "string" ? body.pin : null,
    productSummary:
      typeof body.productSummary === "string" ? body.productSummary : undefined,
    senderName: body.senderName.trim().slice(0, 80),
    transactionId: body.transactionId,
  });

  return Response.json({ transfer: publicQrTransfer(transfer) }, { status: 201 });
}
