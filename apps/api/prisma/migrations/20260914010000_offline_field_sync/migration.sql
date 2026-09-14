ALTER TABLE "field_survey_sessions"
ADD COLUMN "localSessionId" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "summary" JSONB;

CREATE UNIQUE INDEX "field_survey_sessions_localSessionId_key"
ON "field_survey_sessions"("localSessionId");

CREATE TABLE "field_survey_gps_points" (
  "id" TEXT NOT NULL,
  "fieldSurveySessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accuracyMeters" DOUBLE PRECISION NOT NULL,
  "altitudeMeters" DOUBLE PRECISION,
  "speedMetersPerSecond" DOUBLE PRECISION,
  "headingDegrees" DOUBLE PRECISION,
  "issues" JSONB NOT NULL,
  CONSTRAINT "field_survey_gps_points_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "field_survey_gps_points_fieldSurveySessionId_sequence_key"
ON "field_survey_gps_points"("fieldSurveySessionId", "sequence");
CREATE INDEX "field_survey_gps_points_fieldSurveySessionId_recordedAt_idx"
ON "field_survey_gps_points"("fieldSurveySessionId", "recordedAt");
CREATE INDEX "field_survey_gps_points_receivedAt_idx"
ON "field_survey_gps_points"("receivedAt");

ALTER TABLE "field_survey_gps_points"
ADD CONSTRAINT "field_survey_gps_points_fieldSurveySessionId_fkey"
FOREIGN KEY ("fieldSurveySessionId") REFERENCES "field_survey_sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "field_survey_sync_receipts" (
  "idempotencyKey" TEXT NOT NULL,
  "assignedAgentId" TEXT NOT NULL,
  "fieldReportId" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "responseBody" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "field_survey_sync_receipts_pkey" PRIMARY KEY ("idempotencyKey")
);

CREATE INDEX "field_survey_sync_receipts_assignedAgentId_createdAt_idx"
ON "field_survey_sync_receipts"("assignedAgentId", "createdAt");
CREATE INDEX "field_survey_sync_receipts_fieldReportId_createdAt_idx"
ON "field_survey_sync_receipts"("fieldReportId", "createdAt");

ALTER TABLE "field_survey_sync_receipts"
ADD CONSTRAINT "field_survey_sync_receipts_assignedAgentId_fkey"
FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "field_survey_sync_receipts"
ADD CONSTRAINT "field_survey_sync_receipts_fieldReportId_fkey"
FOREIGN KEY ("fieldReportId") REFERENCES "field_reports"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
