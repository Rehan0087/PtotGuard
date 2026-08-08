-- Fields the citizen-filing wizard needs that officer-decision-only mutations
-- never had: the deed the transfer rests on, and a simulated payment record
-- (no gateway — same stand-in pattern as the OCR worker elsewhere).
ALTER TABLE "mutations"
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "transactionId" TEXT,
  ADD COLUMN "deedNumber" TEXT,
  ADD COLUMN "deedDate" TIMESTAMP(3);
