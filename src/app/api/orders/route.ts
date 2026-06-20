import { catalog, getProduct } from "@/lib/catalog";
import { db, createId } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  paymentMethodTypes,
  type CartLine,
  type Order,
  type PaymentMethodType,
} from "@/lib/types";

export const runtime = "nodejs";

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
  created_at: string;
};

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    items: JSON.parse(row.items_json || "[]"),
    totalCents: row.total_cents,
    status: row.status,
    paymentMethodType: row.payment_method_type,
    paymentMethodId: row.payment_method_id,
    authorizationCode: row.authorization_code,
    deviceTrace: JSON.parse(row.device_trace_json || "{}"),
    createdAt: row.created_at,
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
      `SELECT * FROM orders
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 8`,
    )
    .all(user.id) as OrderRow[];

  return Response.json({ orders: rows.map(toOrder) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    items?: unknown;
    paymentMethodId?: unknown;
    paymentMethodType?: unknown;
    deviceTrace?: unknown;
  } | null;

  if (
    !body ||
    !Array.isArray(body.items) ||
    typeof body.paymentMethodId !== "string" ||
    !isPaymentMethodType(body.paymentMethodType)
  ) {
    return Response.json({ error: "Invalid order" }, { status: 400 });
  }

  const items = normalizeItems(body.items);
  if (!items.length) {
    return Response.json({ error: "Cart is empty" }, { status: 400 });
  }

  const method = db
    .prepare(
      `SELECT id, type FROM payment_methods
       WHERE id = ? AND user_id = ? AND status = 'active'
       LIMIT 1`,
    )
    .get(body.paymentMethodId, user.id) as
    | { id: string; type: PaymentMethodType }
    | undefined;

  if (!method || method.type !== body.paymentMethodType) {
    return Response.json({ error: "Payment method not found" }, { status: 404 });
  }

  const totalCents = items.reduce((sum, line) => {
    const product = getProduct(line.productId);
    return sum + (product?.priceCents ?? 0) * line.quantity;
  }, 0);

  if (totalCents <= 0) {
    return Response.json({ error: "Invalid cart" }, { status: 400 });
  }

  const orderId = createId("ord");
  const authCode = `PP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const deviceTrace =
    body.deviceTrace && typeof body.deviceTrace === "object"
      ? body.deviceTrace
      : {};

  db.prepare(
    `INSERT INTO orders
      (id, user_id, items_json, total_cents, status, payment_method_type,
       payment_method_id, authorization_code, device_trace_json)
     VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, ?)`,
  ).run(
    orderId,
    user.id,
    JSON.stringify(items),
    totalCents,
    method.type,
    method.id,
    authCode,
    JSON.stringify(deviceTrace),
  );

  db.prepare(
    `UPDATE payment_methods
     SET last_used_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(method.id);

  db.prepare(
    `INSERT INTO payment_events
      (id, order_id, user_id, method_type, step, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    createId("evt"),
    orderId,
    user.id,
    method.type,
    "authorized",
    JSON.stringify({
      totalCents,
      productCount: items.reduce((sum, item) => sum + item.quantity, 0),
      catalogVersion: catalog.length,
    }),
  );

  const row = db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(orderId) as OrderRow;

  return Response.json({ order: toOrder(row) }, { status: 201 });
}

function normalizeItems(items: unknown[]): CartLine[] {
  const quantities = new Map<string, number>();

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const productId = Reflect.get(item, "productId");
    const quantity = Reflect.get(item, "quantity");

    if (
      typeof productId !== "string" ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 20 ||
      !getProduct(productId)
    ) {
      continue;
    }

    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  }

  return [...quantities.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}
