ALTER TABLE "service_applications" ADD COLUMN "assignedMediatorId" TEXT;

CREATE INDEX "service_applications_assignedMediatorId_idx"
ON "service_applications"("assignedMediatorId");

ALTER TABLE "service_applications"
ADD CONSTRAINT "service_applications_assignedMediatorId_fkey"
FOREIGN KEY ("assignedMediatorId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
