-- CreateTable
CREATE TABLE "service_applications" (
    "id" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "parcelId" TEXT,
    "applicantId" TEXT NOT NULL,
    "assignedOfficerId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "documentIds" TEXT[],
    "feeAmount" INTEGER,
    "paymentMethod" TEXT,
    "transactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_application_events" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,

    CONSTRAINT "service_application_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_applications_applicationNo_key" ON "service_applications"("applicationNo");

-- CreateIndex
CREATE INDEX "service_applications_parcelId_idx" ON "service_applications"("parcelId");

-- CreateIndex
CREATE INDEX "service_applications_applicantId_idx" ON "service_applications"("applicantId");

-- CreateIndex
CREATE INDEX "service_applications_assignedOfficerId_idx" ON "service_applications"("assignedOfficerId");

-- CreateIndex
CREATE INDEX "service_applications_status_idx" ON "service_applications"("status");

-- CreateIndex
CREATE INDEX "service_applications_serviceType_idx" ON "service_applications"("serviceType");

-- CreateIndex
CREATE INDEX "service_application_events_applicationId_idx" ON "service_application_events"("applicationId");

-- AddForeignKey
ALTER TABLE "service_applications" ADD CONSTRAINT "service_applications_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_applications" ADD CONSTRAINT "service_applications_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_applications" ADD CONSTRAINT "service_applications_assignedOfficerId_fkey" FOREIGN KEY ("assignedOfficerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_application_events" ADD CONSTRAINT "service_application_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "service_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_application_events" ADD CONSTRAINT "service_application_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

