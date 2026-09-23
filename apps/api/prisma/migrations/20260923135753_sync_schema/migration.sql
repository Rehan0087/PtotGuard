-- AlterTable
ALTER TABLE "policies" ADD COLUMN     "leaseSettlementApplicationFeeBdt" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "service_applications" ADD COLUMN     "khasPlotId" TEXT;

-- CreateTable
CREATE TABLE "grievances" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "description" TEXT NOT NULL,
    "filedById" TEXT NOT NULL,
    "filedByName" TEXT NOT NULL,
    "assignedOfficerId" TEXT,
    "escalatedToId" TEXT,
    "resolutionNote" TEXT,
    "satisfactionRating" INTEGER,
    "slaDeadline" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grievances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grievance_events" (
    "id" TEXT NOT NULL,
    "grievanceId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,

    CONSTRAINT "grievance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khas_land_plots" (
    "id" TEXT NOT NULL,
    "mouza" TEXT NOT NULL,
    "upazila" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "jlNo" TEXT,
    "dagNo" TEXT NOT NULL,
    "landUse" TEXT NOT NULL,
    "areaDecimals" INTEGER NOT NULL,
    "centroidLat" DOUBLE PRECISION NOT NULL,
    "centroidLng" DOUBLE PRECISION NOT NULL,
    "boundaryGeoJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'available',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khas_land_plots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grievances_caseNumber_key" ON "grievances"("caseNumber");

-- CreateIndex
CREATE INDEX "grievances_filedById_idx" ON "grievances"("filedById");

-- CreateIndex
CREATE INDEX "grievances_status_idx" ON "grievances"("status");

-- CreateIndex
CREATE INDEX "grievances_assignedOfficerId_idx" ON "grievances"("assignedOfficerId");

-- CreateIndex
CREATE INDEX "grievance_events_grievanceId_idx" ON "grievance_events"("grievanceId");

-- AddForeignKey
ALTER TABLE "service_applications" ADD CONSTRAINT "service_applications_khasPlotId_fkey" FOREIGN KEY ("khasPlotId") REFERENCES "khas_land_plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_assignedOfficerId_fkey" FOREIGN KEY ("assignedOfficerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievance_events" ADD CONSTRAINT "grievance_events_grievanceId_fkey" FOREIGN KEY ("grievanceId") REFERENCES "grievances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievance_events" ADD CONSTRAINT "grievance_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
