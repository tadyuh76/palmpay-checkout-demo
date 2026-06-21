# PalmPay POS Experiment

Prototype for a controlled point-of-sale payment experiment. A research staff member creates an anonymous participant session, the system runs consent and pre-survey screens, assigns one of four groups by randomized blocks, guides setup, runs the same 35.000 VND purchase, collects post-survey/ranking data, and exports analysis-ready CSV files.

## Experiment Groups

- `QR_PIN`: DemoBank QR payment with a four-digit test PIN.
- `NFC_CARD`: Physical contactless NFC test card with a POS reader.
- `FACE_POS`: Face recognition at the point of sale using a POS camera.
- `PALM_VEIN`: PalmPay palm-vein recognition using a palm scanner.

The NFC condition is intentionally a physical card, not a phone, so it does not overlap with the QR phone flow or phone-based biometric payment.

## Stack

- Next.js + React + TypeScript
- `qrcode.react` for the QR payment payload
- Local browser storage for prototype persistence and CSV export
- Survey questions in `src/data/survey-questions.json`
- Existing drink imagery in `public/menu` reused as the fixed product visual

## Run

```bash
npm install
npm run dev -- -p 7999
```

Open `http://localhost:7999`.

## Protocol Shape

1. Research staff creates an anonymous participant, for example `P0001`.
2. Participant confirms academic study consent.
3. Participant completes the pre-survey from JSON config.
4. System assigns `QR_PIN`, `NFC_CARD`, `FACE_POS`, or `PALM_VEIN` by shuffled four-person blocks.
5. Participant completes method setup; setup timing is stored separately from checkout timing.
6. Participant buys one `Ly nước` for 35.000 VND from a 100.000 VND test balance.
7. POS routes directly to the assigned payment method.
8. Success screen is identical for all groups.
9. Participant completes post-survey, ranks the four methods, and reaches the debrief.
10. Biometric template references are deleted at session end for face and palm groups.

## Data

The prototype records:

- Participant-level fields: `participant_id`, `assigned_group`, consent/survey timestamps, `protocol_version`, and status.
- Transaction fields: amount, balance before/after, setup duration, checkout duration, retry/error counts, assistance flag, and status.
- Event logs: screen, timestamp, participant, transaction, event name, and metadata.
- Raw survey item responses, including `reverse_scored` metadata in the question config.

Use the admin home or final debrief buttons to export `palmpay-wide.csv` and `palmpay-events.csv`.
