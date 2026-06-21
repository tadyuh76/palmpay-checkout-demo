# PalmPay Coffee Experiment

Coffee-shop checkout prototype for the PalmPay point-of-sale study. The visible participant experience stays close to a normal cafe checkout: browse the menu, add products to the cart, review the order, and pay with the method assigned by the experiment.

Research-only pieces such as consent, pre/post surveys, ranking, debrief, and CSV export are still available, but they are tucked into the compact `Research` panel instead of driving the main UI.

## Experiment Groups

- `QR_PIN`: DemoBank QR payment with a four-digit test PIN.
- `NFC_CARD`: Physical contactless NFC test card with a POS reader.
- `FACE_POS`: Face recognition at the point of sale using a POS camera.
- `PALM_VEIN`: PalmPay palm-vein recognition using a palm scanner.

The NFC condition is intentionally a physical card, not a phone, so it does not overlap with the QR phone flow or phone-based biometric payment.

## Main Flow

1. The app creates an anonymous participant session and assigns one payment method by shuffled blocks.
2. Participant browses the coffee catalog and builds a cart.
3. If the assigned method has not been set up, checkout opens the method setup step.
4. Participant reviews the cart.
5. POS opens only the assigned payment method.
6. Success receipt shows the paid amount, remaining test balance, method, and transaction id.
7. Researcher can open the `Research` panel for consent, surveys, ranking, debrief, and exports.

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

The prototype records participant id, assigned group, setup and checkout timing, transaction details, retries/errors, survey answers, ranking answers, and event logs. Use the `Research` panel to export `palmpay-wide.csv` and `palmpay-events.csv`.
