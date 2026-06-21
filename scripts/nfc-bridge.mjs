#!/usr/bin/env node

const appUrl = (process.env.PALMPAY_APP_URL || "http://localhost:7999").replace(/\/$/, "");
const bridgeToken = process.env.PALMPAY_NFC_BRIDGE_TOKEN || "";
const defaultCardRef = process.env.PALMPAY_NFC_CARD_REF || "CARD-POS-042";
const pollMs = Number(process.env.PALMPAY_NFC_POLL_MS || 1000);
const aid = process.env.PALMPAY_NFC_AID || "";
const mockMode = process.argv.includes("--mock");

function log(message, details) {
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[nfc-bridge] ${message}${suffix}`);
}

function requestHeaders() {
  return {
    "Content-Type": "application/json",
    ...(bridgeToken ? { "x-palmpay-bridge-token": bridgeToken } : {}),
  };
}

function normalizeUid(uid) {
  return String(uid || "")
    .replace(/[^a-fA-F0-9]/g, "")
    .toUpperCase();
}

function cardMap() {
  const raw = process.env.PALMPAY_NFC_CARD_MAP;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(parsed).map(([uid, ref]) => [normalizeUid(uid), String(ref)]),
    );
  } catch {
    log("PALMPAY_NFC_CARD_MAP is not valid JSON; ignoring it");
    return {};
  }
}

function printableText(value) {
  if (!value) return "";
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  return text.replace(/[^\x20-\x7E]+/g, " ").trim();
}

function extractRefFromPayload(text) {
  const direct = text.match(/\bCARD-[A-Z0-9-]+\b/i)?.[0];
  if (direct) return direct.toUpperCase();

  const urlText = text.match(/(?:https?:\/\/|palmpay:\/\/)[^\s"'<>]+/i)?.[0];
  if (!urlText) return null;

  try {
    const url = new URL(urlText);
    const queryRef =
      url.searchParams.get("cardRef") ||
      url.searchParams.get("nfcCard") ||
      url.searchParams.get("token");
    if (queryRef) return queryRef.slice(0, 80);

    const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
    return lastSegment ? decodeURIComponent(lastSegment).slice(0, 80) : null;
  } catch {
    return null;
  }
}

function resolveCardRef(card, activeSession) {
  const uid = normalizeUid(card?.uid);
  const mappedRef = uid ? cardMap()[uid] : null;
  if (mappedRef) return mappedRef;

  const payloadRef = extractRefFromPayload(
    [printableText(card?.data), printableText(card?.payload)].filter(Boolean).join(" "),
  );
  if (payloadRef) return payloadRef;

  return defaultCardRef || activeSession?.acceptedCardRef || (uid ? `UID:${uid}` : "UNKNOWN_CARD");
}

async function getActiveSession() {
  const response = await fetch(`${appUrl}/api/nfc-session`, {
    headers: requestHeaders(),
  });
  if (response.status === 401) {
    throw new Error("Bridge token rejected by /api/nfc-session");
  }
  if (!response.ok) {
    throw new Error(`Could not read active NFC session: HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.session || null;
}

async function postTap({ cardRef, transactionId }) {
  const response = await fetch(`${appUrl}/api/nfc-taps`, {
    body: JSON.stringify({ cardRef, transactionId }),
    headers: requestHeaders(),
    method: "POST",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Could not post NFC tap: HTTP ${response.status}`);
  }
  return data.tap;
}

async function handleCard(card) {
  const activeSession = await getActiveSession();
  if (!activeSession) {
    log("card tapped but no POS NFC transaction is waiting", {
      uid: normalizeUid(card?.uid) || null,
    });
    return;
  }

  const cardRef = resolveCardRef(card, activeSession);
  const tap = await postTap({
    cardRef,
    transactionId: activeSession.transactionId,
  });

  log("tap posted", {
    cardRef: tap.cardRef,
    transactionId: tap.transactionId,
  });
}

async function runMock() {
  log("mock mode waiting for active POS NFC session", { appUrl, cardRef: defaultCardRef });
  while (true) {
    try {
      const session = await getActiveSession();
      if (session) {
        const tap = await postTap({
          cardRef: defaultCardRef,
          transactionId: session.transactionId,
        });
        log("mock tap posted", tap);
        return;
      }
    } catch (error) {
      log(error instanceof Error ? error.message : "mock bridge error");
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

async function loadNfcPcsc() {
  try {
    const nfcPcsc = await import("nfc-pcsc");
    return nfcPcsc.NFC || nfcPcsc.default?.NFC;
  } catch {
    console.error(
      [
        "[nfc-bridge] Missing nfc-pcsc.",
        "Install it on the Mac connected to the reader:",
        "  npm install nfc-pcsc --save-optional",
        "Then run:",
        "  npm run nfc:bridge",
      ].join("\n"),
    );
    process.exit(1);
  }
}

async function runReader() {
  const NFC = await loadNfcPcsc();
  if (!NFC) {
    throw new Error("nfc-pcsc did not export NFC");
  }

  const nfc = new NFC();
  log("reader bridge started", { appUrl, defaultCardRef });

  nfc.on("reader", (reader) => {
    log("reader attached", { reader: reader.reader.name });
    if (aid) reader.aid = aid;

    reader.on("card", (card) => {
      log("card detected", {
        standard: card.standard || card.type || null,
        uid: normalizeUid(card.uid) || null,
      });
      handleCard(card).catch((error) => {
        log(error instanceof Error ? error.message : "tap handling failed");
      });
    });

    reader.on("card.off", () => {
      log("card removed", { reader: reader.reader.name });
    });

    reader.on("error", (error) => {
      log("reader error", { message: error.message });
    });

    reader.on("end", () => {
      log("reader removed", { reader: reader.reader.name });
    });
  });

  nfc.on("error", (error) => {
    log("nfc error", { message: error.message });
  });
}

if (mockMode) {
  await runMock();
} else {
  await runReader();
}
