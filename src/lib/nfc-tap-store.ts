export type NfcTap = {
  cardRef: string;
  createdAt: string;
  transactionId: string;
};

const globalForNfcTaps = globalThis as unknown as {
  palmpayNfcTaps?: Map<string, NfcTap>;
};

function taps() {
  if (!globalForNfcTaps.palmpayNfcTaps) {
    globalForNfcTaps.palmpayNfcTaps = new Map();
  }
  return globalForNfcTaps.palmpayNfcTaps;
}

export function recordNfcTap(input: { cardRef: string; transactionId: string }) {
  const tap: NfcTap = {
    cardRef: input.cardRef,
    createdAt: new Date().toISOString(),
    transactionId: input.transactionId,
  };
  taps().set(input.transactionId, tap);
  return tap;
}

export function getNfcTap(transactionId: string) {
  return taps().get(transactionId) ?? null;
}
