ALTER TABLE "mutations"
ADD COLUMN "dcrAmount" INTEGER,
ADD COLUMN "dcrPaymentMethod" TEXT,
ADD COLUMN "dcrTransactionId" TEXT;

UPDATE "mutations"
SET "dcrAmount" = 1170
WHERE "status" IN ('awaiting-dcr-payment', 'complete');
