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
  const transfer = await getQrTransfer(id);

  if (!transfer) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ transfer: publicQrTransfer(transfer) });
}

function parseFaceDescriptor(value: unknown) {
  if (!Array.isArray(value)) return null;
  const descriptor = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );
  return descriptor.length >= 32 ? descriptor : null;
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const transfer = await getQrTransfer(id);
  if (!transfer) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    faceDescriptor?: unknown;
    pin?: unknown;
  } | null;

  if (!body) {
    return Response.json({ error: "Invalid confirmation" }, { status: 400 });
  }

  if (
    transfer.authMethod === "pin" &&
    (typeof body.pin !== "string" || !/^\d{4}$/.test(body.pin))
  ) {
    return Response.json({ error: "Invalid PIN" }, { status: 400 });
  }

  const faceDescriptor =
    transfer.authMethod === "face" ? parseFaceDescriptor(body.faceDescriptor) : null;
  if (transfer.authMethod === "face" && !faceDescriptor) {
    return Response.json({ error: "Invalid face scan" }, { status: 400 });
  }

  const result = await confirmQrTransfer(id, {
    faceDescriptor: faceDescriptor ?? undefined,
    pin: typeof body.pin === "string" ? body.pin : undefined,
  });
  if (result.error === "not_found" || !result.transfer) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (result.error === "pin_failed") {
    return Response.json({ error: "PIN không đúng" }, { status: 401 });
  }
  if (result.error === "face_no_template") {
    return Response.json({ error: "Chưa có mẫu khuôn mặt" }, { status: 409 });
  }
  if (result.error === "face_required") {
    return Response.json({ error: "Cần xác minh khuôn mặt" }, { status: 400 });
  }
  if (result.error === "face_failed") {
    return Response.json(
      {
        error: "Khuôn mặt không khớp",
        matchDistance: result.matchDistance,
        threshold: result.threshold,
      },
      { status: 401 },
    );
  }

  return Response.json({
    matchDistance: result.matchDistance,
    threshold: result.threshold,
    transfer: publicQrTransfer(result.transfer),
  });
}
