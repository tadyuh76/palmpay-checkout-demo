# Prototype User Journeys

The participant-facing screen is a coffee checkout. Research forms are available from the `Research` button and do not block the main buying flow.

## Shared Checkout Flow

1. App opens with an anonymous participant id and assigned payment method.
2. Participant browses the coffee catalog.
3. Participant adds one or more products to the cart.
4. Participant clicks `Setup & checkout` if the assigned method is not ready.
5. Participant completes setup for the assigned method.
6. Participant reviews the cart.
7. Participant pays using only the assigned method.
8. Receipt appears with transaction id and remaining test balance.
9. Researcher opens `Research` for post-survey, ranking, debrief, and export when needed.

## QR_PIN

1. Open the DemoBank phone mock.
2. Create a four-digit test PIN.
3. At payment, scan the QR code.
4. Confirm the amount shown by DemoBank.
5. Enter the test PIN.
6. Confirm payment.

## NFC_CARD

1. Link the physical NFC test card.
2. At payment, tap the NFC test card on the reader.
3. No PIN is requested for the small POS transaction.

## FACE_POS

1. Confirm biometric data consent in setup.
2. Capture three face samples.
3. At payment, look at the POS camera.
4. Complete the simulated face match.

## PALM_VEIN

1. Confirm biometric data consent in setup.
2. Capture three palm samples.
3. At payment, place the palm over the PalmPay scanner.
4. Complete the simulated palm-vein match.

## Research Panel

- `Consent`, `Pre`, `Post`, `Rank`, `Debrief`, and `Data` are hidden behind the `Research` button.
- Setup duration and checkout duration are still stored separately.
- Retry count and error type are logged.
- CSV export includes the current session and archived browser-local sessions.
