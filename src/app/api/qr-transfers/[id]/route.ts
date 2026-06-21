import {
  confirmQrTransfer,
  getQrTransfer,
  publicQrTransfer,
} from "@/lib/qr-transfer-store";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const transfer = getQrTransfer(id);

  if (!transfer) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ transfer: publicQrTransfer(transfer) });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    pin?: unknown;
  } | null;

  if (!body || typeof body.pin !== "string") {
    return Response.json({ error: "Invalid PIN" }, { status: 400 });
  }

  const result = confirmQrTransfer(id, body.pin);
  if (result.error === "not_found" || !result.transfer) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (result.error === "pin_failed") {
    return Response.json({ error: "PIN không đúng" }, { status: 401 });
  }

  return Response.json({ transfer: publicQrTransfer(result.transfer) });
}
