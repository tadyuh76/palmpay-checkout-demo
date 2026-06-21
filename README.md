# PalmPay Coffee Experiment

Coffee-themed point-of-sale prototype for the PalmPay experiment. The app keeps the full research sequence visible to the researcher and participant: named session creation, consent, pre-survey, randomized method assignment, method setup, coffee catalog selection, checkout, assigned payment, receipt, post-survey, debrief, and CSV export.

## Experiment Groups

- `QR_PIN`: DemoBank QR payment with sender name and a four-digit test PIN. The POS QR opens a mobile mock transfer page and the POS reacts when that page confirms payment.
- `NFC_CARD`: Physical contactless NFC test card with a POS reader. The app exposes an NFC tap bridge endpoint for a local reader process.
- `FACE_POS`: Browser webcam face enrollment and recognition at the point of sale using `@vladmandic/face-api`.
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

## QR Phone Flow

The POS payment screen creates a QR transfer and displays a URL QR code. Scanning it opens `/?qrPay=<transfer-id>` on the phone, showing a DemoBank-style mobile transfer screen with sender name, receiver `Palm Pay`, cart total, and product summary. After the participant enters the PIN created during setup, the phone marks the transfer paid and the POS screen completes automatically.

For real phone testing, run the dev server on the local network and open the site by your Mac LAN IP instead of `localhost`, for example:

```bash
npm run dev -- -H 0.0.0.0 -p 7999
```

Then use `http://<your-mac-ip>:7999` on the POS browser before generating the QR.

## NFC Reader Bridge

Desktop browsers do not directly expose most USB-A NFC readers to normal web pages. To sync a real reader, run a small local bridge process that listens to your reader with PC/SC or the vendor SDK, then POSTs a tap to this app:

```bash
curl -X POST http://localhost:7999/api/nfc-taps \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"TX-EXAMPLE","cardRef":"CARD-POS-042"}'
```

The NFC payment screen polls that endpoint and completes when `CARD-POS-042` is posted for the active transaction.

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
