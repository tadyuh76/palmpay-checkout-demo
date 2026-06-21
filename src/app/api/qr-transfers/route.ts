import {
  createQrTransfer,
  publicQrTransfer,
} from "@/lib/qr-transfer-store";
import type { CartLine } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    amount?: unknown;
    items?: unknown;
    pin?: unknown;
    productSummary?: unknown;
    senderName?: unknown;
    transactionId?: unknown;
  } | null;

  if (
    !body ||
    typeof body.amount !== "number" ||
    !Array.isArray(body.items) ||
    typeof body.pin !== "string" ||
    !/^\d{4}$/.test(body.pin) ||
    typeof body.senderName !== "string" ||
    typeof body.transactionId !== "string"
  ) {
    return Response.json({ error: "Invalid QR transfer" }, { status: 400 });
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
    items,
    pin: body.pin,
    productSummary:
      typeof body.productSummary === "string" ? body.productSummary : undefined,
    senderName: body.senderName.trim().slice(0, 80),
    transactionId: body.transactionId,
  });

  return Response.json({ transfer: publicQrTransfer(transfer) }, { status: 201 });
}
