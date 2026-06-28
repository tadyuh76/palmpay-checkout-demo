# PalmPay Coffee Experiment

Coffee-themed point-of-sale prototype for the PalmPay experiment. The demo app now keeps only the enrollment and buying flow: named session creation, consent, method setup, coffee catalog selection, checkout, assigned payment, receipt, a link to the external research form, and CSV export.

## Experiment Groups

- `QR_PIN`: DemoBank QR payment with sender name and a four-digit test PIN. The POS QR opens a mobile mock transfer page and the POS reacts when that page confirms payment.
- `NFC_CARD`: Physical contactless NFC test card with a POS reader. The app exposes an NFC tap bridge endpoint for a local reader process.
- `FACE_POS`: Face ID-style account registration with browser camera enrollment. Payment still begins from the POS QR, then the mobile mock transfer confirms with face recognition instead of PIN.
- `PALM_VEIN`: PalmPay palm-vein recognition using a palm scanner.

The NFC condition is intentionally a physical card, not a phone, so it stays separate from the QR phone flow and phone-based payment expectations.

## Main Flow

1. Researcher enters the participant name and selects the test method.
2. Participant confirms consent.
3. Participant completes setup for the selected method.
4. Participant selects one or more coffee catalog items within the test balance.
5. Participant reviews the cart and pays with only the assigned method.
6. Receipt shows the selected order, paid amount, remaining test balance, and transaction status.
7. Participant opens the external Google Form linked from the purchase-complete screen.
8. Biometric templates are marked deleted when biometric sessions complete.

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

Browsers cannot read most USB NFC readers directly, so the POS uses a small
Node bridge script. Run the web app and the bridge in two terminals with the
same bridge token.

### macOS

Install Node 20 and the NFC bridge package:

```bash
brew install node@20
cd "/path/to/palmpay/demo-experiment"
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npm install
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npm install --no-save nfc-pcsc
```

Terminal 1: run the web app.

```bash
PATH="/opt/homebrew/opt/node@20/bin:$PATH" \
PALMPAY_NFC_BRIDGE_TOKEN=local-reader-token \
npm run dev -- -p 7999
```

Terminal 2: run the NFC bridge on the Mac connected to the reader.

```bash
PATH="/opt/homebrew/opt/node@20/bin:$PATH" \
PALMPAY_APP_URL=http://localhost:7999 \
PALMPAY_NFC_BRIDGE_TOKEN=local-reader-token \
npm run nfc:bridge
```

### Windows

Install Node.js 20 LTS, then install the NFC reader driver from the reader
vendor if Windows does not detect it automatically.

In PowerShell:

```powershell
cd "C:\path\to\palmpay\demo-experiment"
npm install
npm install --no-save nfc-pcsc
```

Terminal 1: run the web app.

```powershell
$env:PALMPAY_NFC_BRIDGE_TOKEN="local-reader-token"
npm run dev -- -p 7999
```

Terminal 2: run the NFC bridge on the Windows PC connected to the reader.

```powershell
$env:PALMPAY_APP_URL="http://localhost:7999"
$env:PALMPAY_NFC_BRIDGE_TOKEN="local-reader-token"
npm run nfc:bridge
```

### Test Without Hardware

Open the app, choose the NFC method, and wait on the NFC payment screen. In a
second terminal, run:

```bash
PALMPAY_NFC_BRIDGE_TOKEN=local-reader-token npm run nfc:bridge:mock
```

PowerShell version:

```powershell
$env:PALMPAY_NFC_BRIDGE_TOKEN="local-reader-token"
npm run nfc:bridge:mock
```

### Optional Card Mapping

By default, any detected card maps to the demo card reference. To map a real
card UID yourself:

macOS/Linux:

```bash
PALMPAY_NFC_CARD_MAP='{"04AABBCCDD":"CARD-POS-042"}' npm run nfc:bridge
```

Windows PowerShell:

```powershell
$env:PALMPAY_NFC_CARD_MAP='{"04AABBCCDD":"CARD-POS-042"}'
npm run nfc:bridge
```

Keep the bridge token the same in the web app and bridge terminal.

## Stack

- Next.js + React + TypeScript
- `qrcode.react` for QR payment payloads
- Local browser storage for prototype persistence and CSV export
- Coffee catalog imagery in `public/menu`

## Run

```bash
npm install
npm run dev -- -p 7999
```

Open `http://localhost:7999`.

## Data

The prototype records participant id, assigned group, setup and checkout timing, selected cart items, transaction total, retries/errors, biometric deletion timestamp, and event logs. Export `palmpay-wide.csv` and `palmpay-events.csv` from the purchase-complete screen or admin screen. The research questionnaire is handled outside the app at [this Google Form](https://docs.google.com/forms/d/1pYmhACf0Wx1OrOFsVFZSctAhfpcce85E2D2MWceLTEc).
