import { db, createId } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  paymentMethodTypes,
  type PaymentMethod,
  type PaymentMethodType,
} from "@/lib/types";

export const runtime = "nodejs";

type MethodRow = {
  id: string;
  user_id: string;
  type: PaymentMethodType;
  label: string;
  status: "active" | "disabled";
  token_ref: string;
  metadata_json: string;
  created_at: string;
  last_used_at: string | null;
};

function toPaymentMethod(row: MethodRow): PaymentMethod {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    label: row.label,
    status: row.status,
    tokenRef: row.token_ref,
    metadata: JSON.parse(row.metadata_json || "{}"),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

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

  const rows = db
    .prepare(
      `SELECT * FROM payment_methods
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at ASC`,
    )
    .all(user.id) as MethodRow[];

  return Response.json({ methods: rows.map(toPaymentMethod) });
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
  const metadata =
    body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const metadataJson = JSON.stringify(metadata);

  const existing = db
    .prepare(
      `SELECT * FROM payment_methods
       WHERE user_id = ? AND type = ? AND status = 'active'
       LIMIT 1`,
    )
    .get(user.id, body.type) as MethodRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE payment_methods
       SET label = ?, metadata_json = ?
       WHERE id = ?`,
    ).run(label, metadataJson, existing.id);

    const updated = db
      .prepare("SELECT * FROM payment_methods WHERE id = ?")
      .get(existing.id) as MethodRow;

    return Response.json({ method: toPaymentMethod(updated) });
  }

  const id = createId("pm");
  const tokenRef = `${body.type}_${crypto.randomUUID()}`;

  db.prepare(
    `INSERT INTO payment_methods
      (id, user_id, type, label, token_ref, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, user.id, body.type, label, tokenRef, metadataJson);

  const row = db
    .prepare("SELECT * FROM payment_methods WHERE id = ?")
    .get(id) as MethodRow;

  return Response.json({ method: toPaymentMethod(row) }, { status: 201 });
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

  db.prepare(
    `UPDATE payment_methods
     SET status = 'disabled'
     WHERE id = ? AND user_id = ?`,
  ).run(id, user.id);

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
