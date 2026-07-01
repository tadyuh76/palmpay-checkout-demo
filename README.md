# PalmPay Coffee Experiment

Coffee-themed point-of-sale prototype for the PalmPay experiment. The app keeps the full research sequence visible to the researcher and participant: named session creation, consent, pre-survey, randomized method assignment, method setup, coffee catalog selection, checkout, assigned payment, receipt, post-survey, debrief, and CSV export.

## Quick Start

Deployed demo: https://demo-experiment.vercel.app

Local hardware demo on Windows/POS, with NFC bridge and PalmPay palm scanner support:

```cmd
git pull && start-palmpay-local.cmd
```

Fresh Windows checkout:

```cmd
git clone https://github.com/tadyuh76/palmpay-checkout-demo.git && cd palmpay-checkout-demo && start-palmpay-local.cmd
```

The script installs app dependencies if needed, starts the NFC bridge in a second terminal, and starts the local app at `http://localhost:7999`. The palm scanner runs through the app API; set `PALMPAY_PALM_SDK_DIR` only if the SDK DLLs are outside the default local SDK folder.

Localhost and the deployed demo both write to the configured `DATABASE_URL`. Set the same hosted Postgres connection string in `.env.local` and in Vercel project environment variables before running an experiment. The app refuses to fall back to SQLite unless `PALMPAY_ALLOW_SQLITE_FALLBACK=true` is set for a disposable local-only test.

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
brew install node@20
cd "/Users/tadyuh/Documents/Coding Projects/ueh/research/palmpay/demo-experiment"
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npm install --no-save nfc-pcsc
PATH="/opt/homebrew/opt/node@20/bin:$PATH" \
  PALMPAY_NFC_BRIDGE_TOKEN=local-reader-token \
  npm run nfc:bridge
```

Run the web app with the same token in another terminal:

```bash
PALMPAY_NFC_BRIDGE_TOKEN=local-reader-token npm run dev -- -p 7999
```

To run the bridge as a background macOS launchd job for the reader station:

```bash
launchctl remove com.palmpay.nfc-bridge 2>/dev/null || true
launchctl submit -l com.palmpay.nfc-bridge -- /bin/zsh -lc \
  'cd "/Users/tadyuh/Documents/Coding Projects/ueh/research/palmpay/demo-experiment" && PALMPAY_APP_URL=http://localhost:7999 PALMPAY_NFC_BRIDGE_TOKEN=local-reader-token exec /opt/homebrew/opt/node@20/bin/node scripts/nfc-bridge.mjs >> /tmp/palmpay-nfc-bridge.log 2>&1'
```

Check the service with `launchctl list | grep palmpay` and `tail -f /tmp/palmpay-nfc-bridge.log`.

For a real card UID mapping, set:

```bash
PALMPAY_NFC_CARD_MAP='{"04AABBCCDD":"CARD-POS-042"}'
```

For a no-hardware smoke test while the POS is waiting on the NFC payment screen:

```bash
npm run nfc:bridge:mock
```

Do not encode a public payment-success URL that directly marks the order paid. If you write a URL or token to an NFC tag, make it a card token such as `CARD-POS-042` or `https://local-palmpay/nfc?cardRef=CARD-POS-042`; the local bridge still decides whether there is an active waiting transaction.

## Palm Vein Scanner

The `PALM_VEIN` condition uses the bundled Windows palm vein SDK directly from the Next.js API layer. The app calls `scripts/palm-sdk-worker.py`, which loads `SonixCamera.dll` and `XRCommonVeinAlgAPI.dll` from `data/palm-python-sdk/PythonProject1920`, enrolls three palm samples during setup, stores the active feature template in the shared database, restores a temporary SDK working copy before verification, then verifies that template during payment.

By default the repo includes the required Windows SDK runtime files. If needed, override the SDK or template path with:

```bash
PALMPAY_PALM_SDK_DIR="C:\path\to\CameraSDK\run"
PALMPAY_PALM_TEMPLATE_DIR=data/palm-templates
PALMPAY_PALM_SCAN_TIMEOUT_MS=45000
PALMPAY_PALM_PYTHON=python
```

The palm scanner must appear in Windows as the SDK camera device, typically `USB Camera` with VID/PID `0C45:636B`. `PALMPAY_PALM_TEMPLATE_DIR` is only an SDK working directory; the database is the source of truth. Palm template bytes are wiped through `/api/palm/delete` when the biometric session reaches the debrief step.

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

For the full local hardware setup, prefer the one-line command above:

```cmd
git pull && start-palmpay-local.cmd
```

## Data

The prototype records participant id, assigned group, setup and checkout timing, selected cart items, transaction total, retries/errors, survey answers, biometric deletion timestamp, event logs, completed experiment-session records, QR transfers, face-auth QR transfer templates, NFC taps, active NFC reader sessions, and active PalmPay palm-vein templates in the shared database configured by `DATABASE_URL`. The admin method counters read completed experiment-session records from the database. Export `palmpay-wide.csv` and `palmpay-events.csv` from the final debrief screen or admin screen.
