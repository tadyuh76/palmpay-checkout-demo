import {
  clearActiveNfcSession,
  getActiveNfcSession,
  setActiveNfcSession,
} from "@/lib/nfc-session-store";

export const runtime = "nodejs";

function bridgeToken() {
  return process.env.PALMPAY_NFC_BRIDGE_TOKEN?.trim();
}

function bridgeAuthorized(request: Request) {
  const token = bridgeToken();
  return !token || request.headers.get("x-palmpay-bridge-token") === token;
}

export async function GET(request: Request) {
  if (!bridgeAuthorized(request)) {
    return Response.json({ error: "Unauthorized NFC bridge" }, { status: 401 });
  }

  return Response.json({ session: await getActiveNfcSession() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    amount?: unknown;
    acceptedCardRef?: unknown;
    transactionId?: unknown;
  } | null;

  if (
    !body ||
    typeof body.acceptedCardRef !== "string" ||
    typeof body.transactionId !== "string"
  ) {
    return Response.json({ error: "Invalid NFC session" }, { status: 400 });
  }

  const session = await setActiveNfcSession({
    acceptedCardRef: body.acceptedCardRef.trim().slice(0, 80),
    amount: typeof body.amount === "number" ? body.amount : null,
    transactionId: body.transactionId.trim().slice(0, 80),
  });

  return Response.json({ session }, { status: 201 });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    transactionId?: unknown;
  } | null;

  await clearActiveNfcSession(
    typeof body?.transactionId === "string" ? body.transactionId : undefined,
  );

  return Response.json({ session: await getActiveNfcSession() });
}
