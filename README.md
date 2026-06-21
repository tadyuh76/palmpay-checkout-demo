# PalmPay Coffee Checkout

Coffee shop checkout demo for PalmPay. Users sign in, add at least one payment method, search a coffee menu, build an order, and pay with QR code, NFC card, face recognition, or palm-vein scan.

## Stack

- Next.js + React + TypeScript
- Better Auth with email/password and optional Google OAuth
- Neon/Postgres via `pg` when `DATABASE_URL` is set
- SQLite via `better-sqlite3` as the local fallback
- `@vladmandic/face-api` for browser face enrollment and matching
- `qrcode.react` for QR payment payloads
- Web NFC `NDEFReader` when the browser/device supports it
- Generated product images stored in `public/menu`

## Run

```bash
npm install
npm run setup
npm run dev -- -p 7999
```

Open `http://localhost:7999`.

The email form is prefilled for local testing. Create the user once, then sign in with the same credentials. Use `USER_JOURNEYS.md` for one participant flow per payment method.

## Environment

Copy `.env.example` to `.env.local` if you want to override defaults.

Set `DATABASE_URL` to a Neon connection string to use hosted Postgres:

```text
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
```

Then run:

```bash
npm run setup
```

If `DATABASE_URL` is not set, the app uses local SQLite at `PALMPAY_DB_PATH`.

Google sign-in is optional. Set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`, then add this callback URL in Google Cloud:

```text
http://localhost:7999/api/auth/callback/google
```

On Vercel, set `BETTER_AUTH_URL` to the production URL and set `DATABASE_URL` to the Neon connection string so accounts, payment methods, and orders persist. Without `DATABASE_URL`, Vercel falls back to temporary SQLite in `/tmp`, which is only useful for short demo sessions.

## Payment Notes

- QR: displays a merchant checkout QR and records wallet confirmation.
- NFC: uses Web NFC on supported Android Chromium browsers over a secure context; desktop browsers can use the demo tap fallback.
- Face: stores the face descriptor in local browser storage and stores only method metadata on the server.
- Palm: models a scanner/API payment token. The existing Flask palm-vein service can later replace this simulator behind the same UI step.
