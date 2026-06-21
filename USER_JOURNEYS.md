# Prototype User Journeys

All participants follow the same controlled purchase task. They do not create an account, choose products, or choose a payment method.

## Shared Flow

1. Research staff opens the admin screen and clicks `Tạo người tham gia mới`.
2. Participant confirms consent.
3. Participant completes the pre-survey.
4. System reveals the randomized group assignment.
5. Participant completes setup for the assigned method.
6. Participant selects `Ly nước` priced at 35.000 VND.
7. Participant confirms the cart and starts payment.
8. Participant completes the assigned payment flow or reaches a technical failure after two retries.
9. Participant completes the post-survey.
10. Participant ranks all four methods and reaches the debrief.

## QR_PIN

1. Open the DemoBank phone mock.
2. Create a four-digit test PIN.
3. At POS payment, scan the QR code.
4. Enter `35000`.
5. Enter the test PIN.
6. Confirm payment.

## NFC_CARD

1. Link the physical NFC test card.
2. At POS payment, tap the NFC test card on the reader.
3. No PIN is requested for the 35.000 VND transaction.

## FACE_POS

1. Confirm biometric data consent for the session.
2. Capture three face samples.
3. At POS payment, look at the POS camera.
4. Complete the simulated face match.

## PALM_VEIN

1. Confirm biometric data consent for the session.
2. Capture three palm samples.
3. At POS payment, place the palm over the PalmPay scanner.
4. Complete the simulated palm-vein match.

## Capture Checks

- Setup duration and checkout duration are stored separately.
- Retry count and error type are logged.
- Post-survey opens only after success or recorded technical failure.
- Interview contact information is saved separately from survey responses.
