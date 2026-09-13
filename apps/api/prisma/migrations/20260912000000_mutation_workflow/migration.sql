-- Durable mutation-workflow facts. Every new column starts nullable so a
-- production registry can be upgraded without manufacturing officer actions.
ALTER TABLE "mutations"
  ADD COLUMN "fromOwnerId" TEXT,
  ADD COLUMN "verificationStartedAt" TIMESTAMP(3),
  ADD COLUMN "verificationStartedById" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedById" TEXT,
  ADD COLUMN "verificationNotes" TEXT,
  ADD COLUMN "verificationChecklist" JSONB,
  ADD COLUMN "objectionStartDate" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvalNote" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedById" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3);

ALTER TABLE "ownership_records"
  ADD COLUMN "mutationId" TEXT;

-- Preserve the filing date for rows that predate lifecycle timestamps.
UPDATE "mutations"
SET "createdAt" = "requestedAt",
    "updatedAt" = "requestedAt"
WHERE "createdAt" IS NULL
   OR "updatedAt" IS NULL;

-- Active legacy filings gain the owner currently recorded for the parcel.
-- Terminal rows deliberately remain nullable: their historical owner may no
-- longer be represented by an account, and guessing would falsify the record.
UPDATE "mutations" AS mutation
SET "fromOwnerId" = parcel."ownerId"
FROM "parcels" AS parcel
WHERE parcel."id" = mutation."parcelId"
  AND mutation."fromOwnerId" IS NULL
  AND mutation."status" IN ('submitted', 'verification', 'objection-period');

ALTER TABLE "mutations"
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "mutations_fromOwnerId_idx" ON "mutations"("fromOwnerId");
CREATE INDEX "mutations_toOwnerId_idx" ON "mutations"("toOwnerId");
CREATE INDEX "mutations_requestedById_idx" ON "mutations"("requestedById");
CREATE INDEX "mutations_assignedOfficerId_idx" ON "mutations"("assignedOfficerId");
CREATE INDEX "mutations_verificationStartedById_idx" ON "mutations"("verificationStartedById");
CREATE INDEX "mutations_verifiedById_idx" ON "mutations"("verifiedById");
CREATE INDEX "mutations_approvedById_idx" ON "mutations"("approvedById");
CREATE INDEX "mutations_rejectedById_idx" ON "mutations"("rejectedById");
CREATE INDEX "ownership_records_mutationId_idx" ON "ownership_records"("mutationId");

ALTER TABLE "mutations" ADD CONSTRAINT "mutations_fromOwnerId_fkey"
  FOREIGN KEY ("fromOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_verificationStartedById_fkey"
  FOREIGN KEY ("verificationStartedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_rejectedById_fkey"
  FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_mutationId_fkey"
  FOREIGN KEY ("mutationId") REFERENCES "mutations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
