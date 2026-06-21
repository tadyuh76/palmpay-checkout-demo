export type ActiveNfcSession = {
  acceptedCardRef: string;
  amount: number | null;
  createdAt: string;
  expiresAt: string;
  transactionId: string;
};

const sessionTtlMs = 5 * 60 * 1000;

const globalForNfcSession = globalThis as unknown as {
  palmpayActiveNfcSession?: ActiveNfcSession | null;
};

function isExpired(session: ActiveNfcSession) {
  return Date.parse(session.expiresAt) <= Date.now();
}

export function setActiveNfcSession(input: {
  acceptedCardRef: string;
  amount?: number | null;
  transactionId: string;
}) {
  const now = Date.now();
  const session: ActiveNfcSession = {
    acceptedCardRef: input.acceptedCardRef,
    amount: input.amount ?? null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + sessionTtlMs).toISOString(),
    transactionId: input.transactionId,
  };

  globalForNfcSession.palmpayActiveNfcSession = session;
  return session;
}

export function getActiveNfcSession() {
  const session = globalForNfcSession.palmpayActiveNfcSession ?? null;
  if (!session) return null;
  if (isExpired(session)) {
    globalForNfcSession.palmpayActiveNfcSession = null;
    return null;
  }
  return session;
}

export function clearActiveNfcSession(transactionId?: string) {
  const session = globalForNfcSession.palmpayActiveNfcSession ?? null;
  if (!session) return null;
  if (transactionId && session.transactionId !== transactionId) {
    return session;
  }

  globalForNfcSession.palmpayActiveNfcSession = null;
  return null;
}
