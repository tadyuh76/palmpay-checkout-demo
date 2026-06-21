import { requireUser } from "@/lib/session";
import {
  disablePaymentMethod,
  listPaymentMethods,
  upsertPaymentMethod,
} from "@/lib/store";
import {
  paymentMethodTypes,
  type PaymentMethodType,
} from "@/lib/types";

export const runtime = "nodejs";

function isPaymentMethodType(value: unknown): value is PaymentMethodType {
  return (
    typeof value === "string" &&
    paymentMethodTypes.includes(value as PaymentMethodType)
  );
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const methods = await listPaymentMethods(user.id);
  return Response.json({ methods });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    type?: unknown;
    label?: unknown;
    metadata?: unknown;
  } | null;

  if (!body || !isPaymentMethodType(body.type)) {
    return Response.json({ error: "Invalid method type" }, { status: 400 });
  }

  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 80)
      : defaultLabel(body.type);
  const metadata: Record<string, unknown> =
    body.metadata && typeof body.metadata === "object"
      ? (body.metadata as Record<string, unknown>)
      : {};

  const method = await upsertPaymentMethod({
    userId: user.id,
    type: body.type,
    label,
    metadata,
  });

  return Response.json({ method }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }

  await disablePaymentMethod(user.id, id);

  return Response.json({ ok: true });
}

function defaultLabel(type: PaymentMethodType) {
  switch (type) {
    case "qr":
      return "Wallet QR";
    case "nfc":
      return "NFC card";
    case "face":
      return "Face ID";
    case "palm":
      return "Palm vein";
  }
}
