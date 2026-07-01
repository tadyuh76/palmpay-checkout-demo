import { getNfcTap, recordNfcTap } from "@/lib/nfc-tap-store";
import {
  clearActiveNfcSession,
  getActiveNfcSession,
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
  const { searchParams } = new URL(request.url);
  const transactionId = searchParams.get("transactionId");

  if (!transactionId) {
    return Response.json({ error: "Missing transactionId" }, { status: 400 });
  }

  return Response.json({ tap: await getNfcTap(transactionId) });
}

export async function POST(request: Request) {
  if (!bridgeAuthorized(request)) {
    return Response.json({ error: "Unauthorized NFC bridge" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    cardRef?: unknown;
    transactionId?: unknown;
  } | null;
  const activeSession = await getActiveNfcSession();
  const transactionId =
    typeof body?.transactionId === "string" && body.transactionId.trim()
      ? body.transactionId.trim().slice(0, 80)
      : activeSession?.transactionId;

  if (
    !body ||
    typeof body.cardRef !== "string" ||
    !transactionId
  ) {
    return Response.json({ error: "Invalid NFC tap" }, { status: 400 });
  }

  const tap = await recordNfcTap({
    cardRef: body.cardRef.trim().slice(0, 80),
    transactionId,
  });

  if (
    activeSession?.transactionId === transactionId &&
    activeSession.acceptedCardRef === tap.cardRef
  ) {
    await clearActiveNfcSession(transactionId);
  }

  return Response.json({ tap }, { status: 201 });
}
