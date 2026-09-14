CREATE TABLE "field_survey_sessions" (
    "id" TEXT NOT NULL,
    "fieldReportId" TEXT NOT NULL,
    "bhumiId" TEXT,
    "assignedAgentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "field_survey_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "field_survey_sessions_fieldReportId_key"
ON "field_survey_sessions"("fieldReportId");

CREATE INDEX "field_survey_sessions_assignedAgentId_idx"
ON "field_survey_sessions"("assignedAgentId");

CREATE INDEX "field_survey_sessions_status_idx"
ON "field_survey_sessions"("status");

ALTER TABLE "field_survey_sessions"
ADD CONSTRAINT "field_survey_sessions_fieldReportId_fkey"
FOREIGN KEY ("fieldReportId") REFERENCES "field_reports"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "field_survey_sessions"
ADD CONSTRAINT "field_survey_sessions_assignedAgentId_fkey"
FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
