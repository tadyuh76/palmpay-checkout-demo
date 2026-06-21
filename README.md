# PalmPay Coffee Experiment

Coffee-themed point-of-sale prototype for the PalmPay experiment. The app keeps the full research sequence visible to the researcher and participant: named session creation, consent, pre-survey, randomized method assignment, method setup, coffee catalog selection, checkout, assigned payment, receipt, post-survey, debrief, and CSV export.

## Experiment Groups

- `QR_PIN`: DemoBank QR payment with sender name and a four-digit test PIN. The POS QR opens a mobile mock transfer page and the POS reacts when that page confirms payment.
- `NFC_CARD`: Physical contactless NFC test card with a POS reader. The app exposes an NFC tap bridge endpoint for a local reader process.
- `FACE_POS`: Face ID-style account registration with browser camera enrollment. Payment still begins from the POS QR, then the mobile mock transfer confirms with face recognition instead of PIN.
- `PALM_VEIN`: PalmPay palm-vein recognition using a palm scanner.

The NFC condition is intentionally a physical card, not a phone, so it stays separate from the QR phone flow and phone-based payment expectations.

## Main Flow

1. Researcher creates a participant session with a display name.
2. Participant confirms consent.
3. Participant completes the pre-survey.
4. App assigns one of the four payment groups by shuffled blocks.
5. Participant completes setup for the assigned method.
6. Participant selects one or more coffee catalog items within the test balance.
7. Participant reviews the cart and pays with only the assigned method.
8. Receipt shows the selected order, paid amount, remaining test balance, and transaction id.
9. Participant completes the post-survey and goes straight to the debrief/export screen.
10. Biometric templates are marked deleted at the end of biometric sessions.

## QR Phone Flows

The POS payment screen creates a QR transfer and displays a URL QR code. Scanning it opens `/?qrPay=<transfer-id>` on the phone, showing a DemoBank-style mobile transfer screen with sender name, receiver `Palm Pay`, cart total, and product summary.

For `QR_PIN`, the participant confirms with the PIN created during setup. For `FACE_POS`, the participant confirms with the enrolled face template on the mobile camera. In both cases, the phone marks the transfer paid and the POS screen completes automatically.

For real phone testing, run the dev server on the local network and open the site by your Mac LAN IP instead of `localhost`, for example:

```bash
npm run dev -- -H 0.0.0.0 -p 7999
```

Then use `http://<your-mac-ip>:7999` on the POS browser before generating the QR.

Mobile browser camera access for Face ID may require HTTPS when testing from a real phone on the local network. A tunnel or local HTTPS setup works better than a plain LAN `http://` URL for that condition.

## NFC Reader Bridge

Desktop browsers do not directly expose most USB-A NFC readers to normal web pages. To sync a real reader, run a small local bridge process that listens to your reader with PC/SC or the vendor SDK, then POSTs a tap to this app:

```bash
curl -X POST http://localhost:7999/api/nfc-taps \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"TX-EXAMPLE","cardRef":"CARD-POS-042"}'
```

The production bridge flow is automated:

1. The POS NFC payment screen registers the current active NFC transaction at `/api/nfc-session`.
2. The local bridge script polls `/api/nfc-session`.
3. When the USB reader detects a tag/card, the bridge posts that tap to `/api/nfc-taps`.
4. The POS screen polls `/api/nfc-taps` and completes when `CARD-POS-042` is posted for the active transaction.

On the Mac connected to the USB reader:

```bash
nvm use 20
npm install nfc-pcsc --save-optional
PALMPAY_NFC_BRIDGE_TOKEN=local-reader-token npm run nfc:bridge
```

Run the web app with the same token:

```bash
nvm use 20
PALMPAY_NFC_BRIDGE_TOKEN=local-reader-token npm run dev -- -p 7999
```

For a real card UID mapping, set:

```bash
PALMPAY_NFC_CARD_MAP='{"04AABBCCDD":"CARD-POS-042"}'
```

For a no-hardware smoke test while the POS is waiting on the NFC payment screen:

```bash
npm run nfc:bridge:mock
```

Do not encode a public payment-success URL that directly marks the order paid. If you write a URL or token to an NFC tag, make it a card token such as `CARD-POS-042` or `https://local-palmpay/nfc?cardRef=CARD-POS-042`; the local bridge still decides whether there is an active waiting transaction.

## Stack

- Next.js + React + TypeScript
- `qrcode.react` for QR payment payloads
- Local browser storage for prototype persistence and CSV export
- Survey questions in `src/data/survey-questions.json`
- Coffee catalog imagery in `public/menu`

## Run

```bash
npm install
npm run dev -- -p 7999
```

Open `http://localhost:7999`.

## Data

The prototype records participant id, assigned group, setup and checkout timing, selected cart items, transaction total, retries/errors, survey answers, biometric deletion timestamp, and event logs. Export `palmpay-wide.csv` and `palmpay-events.csv` from the final debrief screen or admin screen.
