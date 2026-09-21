ALTER TABLE "field_reports"
  ADD COLUMN "disputeFound" BOOLEAN,
  ADD COLUMN "disputeDescription" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT;

-- Preserve already-progressed fixtures/records as officer-reviewed. New
-- reports only receive these values through POST /field-reports/:id/review.
UPDATE "field_reports" AS report
SET "reviewedAt" = COALESCE(report."submittedAt", report."assignedAt"),
    "reviewedById" = mutation."assignedOfficerId"
FROM "mutations" AS mutation
WHERE report."mutationId" = mutation."id"
  AND report."status" = 'completed'
  AND mutation."status" IN ('field-verification-complete', 'approved', 'awaiting-dcr-payment', 'complete', 'rejected');
