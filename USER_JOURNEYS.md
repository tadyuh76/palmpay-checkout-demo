# Prototype User Journeys

The prototype is a full experiment walkthrough wrapped in a coffee shop checkout. Research steps remain part of the flow, while the buying task uses a catalog and cart instead of a forced single product.

## Shared Experiment Flow

1. Researcher creates a new anonymous participant session.
2. Participant reviews consent and continues.
3. Participant completes the pre-survey without seeing internal item ids or construct labels.
4. App randomly assigns `QR_PIN`, `NFC_CARD`, `FACE_POS`, or `PALM_VEIN`.
5. Participant completes the setup task for the assigned method.
6. Participant browses the coffee catalog and adds one or more products to the cart.
7. Participant reviews the cart total and remaining test balance.
8. POS opens only the assigned payment method.
9. Receipt confirms the selected order and transaction id.
10. Participant completes the post-survey, ranks all four methods, sees the debrief, and exports data if needed.

## QR_PIN

1. Open the DemoBank phone mock.
2. Create a four-digit test PIN.
3. At payment, scan the POS QR code.
4. Enter the exact cart total.
5. Enter the test PIN.
6. Confirm payment.

## NFC_CARD

1. Link the physical NFC test card.
2. At payment, tap the NFC test card on the reader.
3. No PIN is requested in the simulated transaction.

## FACE_POS

1. Confirm biometric data consent in setup.
2. Capture three face samples at the POS camera.
3. At payment, look at the POS camera.
4. Complete the simulated face match.

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
