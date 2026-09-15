ALTER TABLE "mutations"
  ADD COLUMN "disputeId" TEXT,
  ADD COLUMN "orderSheet" TEXT,
  ADD COLUMN "digitalSignature" TEXT,
  ADD COLUMN "mutationKhatianNumber" TEXT,
  ADD COLUMN "dcrPaidAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "mutations_disputeId_key" ON "mutations"("disputeId");
CREATE UNIQUE INDEX "mutations_mutationKhatianNumber_key" ON "mutations"("mutationKhatianNumber");
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_disputeId_fkey"
  FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "field_reports"
  ADD COLUMN "sketchMapUrl" TEXT,
  ADD COLUMN "sketchMapFileName" TEXT;

UPDATE "mutations" SET "status" = CASE
  WHEN "status" = 'verification' THEN 'under-primary-verification'
  WHEN "status" = 'objection-period' THEN 'field-investigation'
  ELSE "status"
END;
