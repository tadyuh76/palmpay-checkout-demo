# Prototype User Journeys

The prototype is a full experiment walkthrough wrapped in a coffee shop checkout. Research steps remain part of the flow, while the buying task uses a catalog and cart instead of a forced single product.

## Shared Experiment Flow

1. Researcher creates a new participant session with a display name.
2. Participant reviews consent and continues.
3. Participant completes the pre-survey without seeing internal item ids or construct labels.
4. App randomly assigns `QR_PIN`, `NFC_CARD`, `FACE_POS`, or `PALM_VEIN`.
5. Participant completes the setup task for the assigned method.
6. Participant browses the coffee catalog and adds one or more products to the cart.
7. Participant reviews the cart total and remaining test balance.
8. POS opens only the assigned payment method.
9. Receipt confirms the selected order and transaction id.
10. Participant completes the post-survey, sees the debrief, and exports data if needed.

## QR_PIN

1. Open the DemoBank phone mock.
2. Create a sender name and four-digit test PIN.
3. At payment, scan the POS QR code with a phone.
4. Review the mobile mock transfer screen: sender, receiver, amount, and product summary.
5. Enter the test PIN on the phone.
6. Confirm payment and watch the POS screen complete automatically.

## NFC_CARD

1. Link the physical NFC test card.
2. At payment, the POS registers the active transaction for the local reader bridge.
3. Tap the NFC test card on the USB reader connected to the Mac.
4. The local bridge posts the detected card token to `/api/nfc-taps`.
5. No PIN is requested in the simulated transaction.

## FACE_POS

1. Confirm biometric data consent in setup.
2. Register a Face ID account name.
3. Enroll three real webcam face samples.
4. At payment, scan the POS QR code with a phone.
5. Review the mobile mock transfer screen: sender, receiver, amount, and product summary.
6. Confirm the transfer with the phone camera face check.
7. Watch the POS screen complete automatically.

## PALM_VEIN

1. Confirm biometric data consent in setup.
2. Capture three palm samples.
3. At payment, place the palm over the PalmPay scanner.
4. Complete the simulated palm-vein match.

## Research Notes

- Setup duration and checkout duration are stored separately.
- Retry count and error type are logged from the payment screen.
- CSV export includes the current session and completed browser-local sessions.
- Biometric template deletion is recorded during the debrief step for face and palm groups.
