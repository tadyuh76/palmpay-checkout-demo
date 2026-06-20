# PalmPay Checkout Demo

Retail checkout prototype for the PalmPay experiment. Users sign in, add at least one payment method, shop from a small catalog, and pay with QR code, NFC card, face recognition, or palm-vein scan.

## Stack

- Next.js + React + TypeScript
- Better Auth with email/password and optional Google OAuth
- SQLite via `better-sqlite3`
- `@vladmandic/face-api` for browser face enrollment and matching
- `qrcode.react` for QR payment payloads
- Web NFC `NDEFReader` when the browser/device supports it

## Run

```bash
npm install
npm run setup
npm run dev -- -p 7999
```

Open `http://localhost:7999`.

The email form is prefilled for local testing. Create the user once, then sign in with the same credentials.

## Environment

Copy `.env.example` to `.env.local` if you want to override defaults.

Google sign-in is optional. Set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`, then add this callback URL in Google Cloud:

```text
http://localhost:7999/api/auth/callback/google
```

On Vercel, Better Auth uses the generated `VERCEL_URL` unless
`BETTER_AUTH_URL` is explicitly set. The demo falls back to SQLite in `/tmp`
on Vercel, which is writable but ephemeral; use a hosted database for
long-lived accounts and payment history.

## Payment Notes

- QR: displays a merchant checkout QR and records wallet confirmation.
- NFC: uses Web NFC on supported Android Chromium browsers over a secure context; desktop browsers can use the demo tap fallback.
- Face: stores the face descriptor in local browser storage and stores only method metadata on the server.
- Palm: models a scanner/API payment token. The existing Flask palm-vein service can later replace this simulator behind the same UI step.
