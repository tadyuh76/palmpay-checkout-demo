# Prototype User Journeys

The prototype is a coffee shop checkout demo focused on enrollment and buying. Research questions are handled outside the app through the linked Google Form after purchase completion.

## Shared Experiment Flow

1. Researcher enters the participant name and selects the test method.
2. Participant reviews consent and continues.
3. Participant completes the setup task for the selected method.
4. Participant browses the coffee catalog and adds one or more products to the cart.
5. Participant reviews the cart total and remaining test balance.
6. POS opens only the selected payment method.
7. Receipt confirms the selected order and transaction status.
8. Participant opens the external Google Form from the purchase-complete screen.

## QR_PIN

1. Enter participant name on the first screen.
2. Confirm consent.
3. Create a four-digit test PIN in setup.
4. At payment, scan the POS QR code with a phone.
5. Review the mobile mock transfer screen: sender, receiver, amount, and product summary.
6. Enter the test PIN on the phone.
7. Confirm payment and watch the POS screen complete automatically.

## NFC_CARD

1. Link the physical NFC test card.
2. At payment, the POS registers the active transaction for the local reader bridge.
3. Tap the NFC test card on the USB reader connected to the Mac.
4. The local bridge posts the detected card token to `/api/nfc-taps`.
5. No PIN is requested in the simulated transaction.

## FACE_POS

1. Enter participant name on the first screen.
2. Confirm study consent.
3. Confirm biometric data consent in setup.
4. Enroll three real webcam face samples.
5. At payment, scan the POS QR code with a phone.
6. Review the mobile mock transfer screen: sender, receiver, amount, and product summary.
7. Confirm the transfer with the phone camera face check.
8. Watch the POS screen complete automatically.

## PALM_VEIN

1. Confirm biometric data consent in setup.
2. Capture three palm samples.
3. At payment, place the palm over the PalmPay scanner.
4. Complete the simulated palm-vein match.

## Research Notes

- Setup duration and checkout duration are stored separately.
- Retry count and error type are logged from the payment screen.
- CSV export includes the current session and completed browser-local sessions.
- Biometric template deletion is recorded when face and palm sessions complete.
- Research responses are collected in the external Google Form linked after purchase completion.
