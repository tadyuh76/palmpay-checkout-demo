import { getProduct } from "@/lib/catalog";
import { requireUser } from "@/lib/session";
import {
  createPaidOrder,
  getActivePaymentMethod,
  listOrders,
} from "@/lib/store";
import {
  paymentMethodTypes,
  type CartLine,
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

  const orders = await listOrders(user.id);
  return Response.json({ orders });
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

  const method = await getActivePaymentMethod(user.id, body.paymentMethodId);

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

  const deviceTrace: Record<string, unknown> =
    body.deviceTrace && typeof body.deviceTrace === "object"
      ? (body.deviceTrace as Record<string, unknown>)
      : {};

  const order = await createPaidOrder({
    userId: user.id,
    items,
    totalCents,
    method,
    deviceTrace,
  });

  return Response.json({ order }, { status: 201 });
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
