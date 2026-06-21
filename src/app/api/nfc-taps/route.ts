import { getNfcTap, recordNfcTap } from "@/lib/nfc-tap-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const transactionId = searchParams.get("transactionId");

  if (!transactionId) {
    return Response.json({ error: "Missing transactionId" }, { status: 400 });
  }

  return Response.json({ tap: getNfcTap(transactionId) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    cardRef?: unknown;
    transactionId?: unknown;
  } | null;

  if (
    !body ||
    typeof body.cardRef !== "string" ||
    typeof body.transactionId !== "string"
  ) {
    return Response.json({ error: "Invalid NFC tap" }, { status: 400 });
  }

  const tap = recordNfcTap({
    cardRef: body.cardRef.trim().slice(0, 80),
    transactionId: body.transactionId,
  });

  return Response.json({ tap }, { status: 201 });
}
