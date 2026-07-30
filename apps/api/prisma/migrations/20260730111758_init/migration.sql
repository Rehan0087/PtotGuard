-- CreateTable
CREATE TABLE "jurisdictions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "level" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "jurisdictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "nationalId" TEXT,
    "avatarUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcels" (
    "id" TEXT NOT NULL,
    "dagNo" TEXT NOT NULL,
    "khatianNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "landUse" TEXT NOT NULL,
    "area" JSONB NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownershipType" TEXT NOT NULL,
    "registryStatus" TEXT NOT NULL,
    "centroid" JSONB NOT NULL,
    "boundary" JSONB,
    "marketValue" JSONB,
    "registeredAt" TIMESTAMP(3) NOT NULL,
    "lastMutationAt" TIMESTAMP(3),

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownership_records" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "acquisitionType" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),
    "documentId" TEXT,

    CONSTRAINT "ownership_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT,
    "ownerId" TEXT,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    "ocrStatus" TEXT NOT NULL DEFAULT 'pending',
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "fraudScore" DOUBLE PRECISION,
    "extractedFields" JSONB,
    "thumbnailUrl" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "parcelDagNo" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "filedById" TEXT NOT NULL,
    "filedByName" TEXT NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "parties" JSONB NOT NULL,
    "assignedOfficerId" TEXT,
    "assignedAgentId" TEXT,
    "assignedMediatorId" TEXT,
    "evidenceDocumentIds" TEXT[],
    "hearingDate" TIMESTAMP(3),
    "resolution" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_events" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB,
    "description" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,

    CONSTRAINT "dispute_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mutations" (
    "id" TEXT NOT NULL,
    "mutationNumber" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "parcelDagNo" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "fromOwnerName" TEXT NOT NULL,
    "toOwnerName" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedOfficerId" TEXT,
    "documentIds" TEXT[],
    "objections" JSONB NOT NULL DEFAULT '[]',
    "fee" JSONB,
    "objectionWindowEndsAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "mutations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_reports" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "parcelDagNo" TEXT NOT NULL,
    "disputeId" TEXT,
    "mutationId" TEXT,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "assignedAgentId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "addressHint" TEXT,
    "gpsCaptures" JSONB NOT NULL DEFAULT '[]',
    "photos" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "field_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hearings" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "parcelDagNo" TEXT NOT NULL,
    "mediatorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "parties" JSONB NOT NULL,
    "hearingDate" TIMESTAMP(3),
    "sessions" JSONB NOT NULL DEFAULT '[]',
    "ruling" TEXT,
    "ruledAt" TIMESTAMP(3),

    CONSTRAINT "hearings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "content" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "href" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "mutationFeeBdt" INTEGER NOT NULL,
    "objectionWindowDays" INTEGER NOT NULL,
    "fraudScoreThreshold" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jurisdictions_code_key" ON "jurisdictions"("code");

-- CreateIndex
CREATE INDEX "jurisdictions_parentId_idx" ON "jurisdictions"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_jurisdictionId_idx" ON "users"("jurisdictionId");

-- CreateIndex
CREATE INDEX "parcels_jurisdictionId_idx" ON "parcels"("jurisdictionId");

-- CreateIndex
CREATE INDEX "parcels_ownerId_idx" ON "parcels"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "parcels_dagNo_khatianNo_key" ON "parcels"("dagNo", "khatianNo");

-- CreateIndex
CREATE INDEX "ownership_records_parcelId_idx" ON "ownership_records"("parcelId");

-- CreateIndex
CREATE INDEX "documents_parcelId_idx" ON "documents"("parcelId");

-- CreateIndex
CREATE INDEX "documents_ownerId_idx" ON "documents"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_caseNumber_key" ON "disputes"("caseNumber");

-- CreateIndex
CREATE INDEX "disputes_parcelId_idx" ON "disputes"("parcelId");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_assignedOfficerId_idx" ON "disputes"("assignedOfficerId");

-- CreateIndex
CREATE INDEX "disputes_assignedAgentId_idx" ON "disputes"("assignedAgentId");

-- CreateIndex
CREATE INDEX "disputes_assignedMediatorId_idx" ON "disputes"("assignedMediatorId");

-- CreateIndex
CREATE INDEX "dispute_events_disputeId_idx" ON "dispute_events"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "mutations_mutationNumber_key" ON "mutations"("mutationNumber");

-- CreateIndex
CREATE INDEX "mutations_parcelId_idx" ON "mutations"("parcelId");

-- CreateIndex
CREATE INDEX "mutations_status_idx" ON "mutations"("status");

-- CreateIndex
CREATE INDEX "field_reports_parcelId_idx" ON "field_reports"("parcelId");

-- CreateIndex
CREATE INDEX "field_reports_disputeId_idx" ON "field_reports"("disputeId");

-- CreateIndex
CREATE INDEX "field_reports_assignedAgentId_idx" ON "field_reports"("assignedAgentId");

-- CreateIndex
CREATE INDEX "field_reports_status_idx" ON "field_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "hearings_caseNumber_key" ON "hearings"("caseNumber");

-- CreateIndex
CREATE INDEX "hearings_disputeId_idx" ON "hearings"("disputeId");

-- CreateIndex
CREATE INDEX "hearings_mediatorId_idx" ON "hearings"("mediatorId");

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_hash_key" ON "audit_events"("hash");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");

-- AddForeignKey
ALTER TABLE "jurisdictions" ADD CONSTRAINT "jurisdictions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "jurisdictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "jurisdictions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "jurisdictions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assignedOfficerId_fkey" FOREIGN KEY ("assignedOfficerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assignedMediatorId_fkey" FOREIGN KEY ("assignedMediatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_events" ADD CONSTRAINT "dispute_events_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_events" ADD CONSTRAINT "dispute_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_assignedOfficerId_fkey" FOREIGN KEY ("assignedOfficerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_mutationId_fkey" FOREIGN KEY ("mutationId") REFERENCES "mutations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_mediatorId_fkey" FOREIGN KEY ("mediatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
