# PalmPay Coffee Experiment

Coffee-themed point-of-sale prototype for the PalmPay experiment. The app keeps the full research sequence visible to the researcher and participant: consent, pre-survey, randomized method assignment, method setup, coffee catalog selection, checkout, assigned payment, receipt, post-survey, debrief, and CSV export.

## Experiment Groups

- `QR_PIN`: DemoBank QR payment with a four-digit test PIN.
- `NFC_CARD`: Physical contactless NFC test card with a POS reader.
- `FACE_POS`: Face recognition at the point of sale using a POS camera.
- `PALM_VEIN`: PalmPay palm-vein recognition using a palm scanner.

The NFC condition is intentionally a physical card, not a phone, so it stays separate from the QR phone flow and phone-based payment expectations.

## Main Flow

1. Researcher creates an anonymous participant session.
2. Participant confirms consent.
3. Participant completes the pre-survey.
4. App assigns one of the four payment groups by shuffled blocks.
5. Participant completes setup for the assigned method.
6. Participant selects one or more coffee catalog items within the test balance.
7. Participant reviews the cart and pays with only the assigned method.
8. Receipt shows the selected order, paid amount, remaining test balance, and transaction id.
9. Participant completes the post-survey and goes straight to the debrief/export screen.
10. Biometric templates are marked deleted at the end of biometric sessions.

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
