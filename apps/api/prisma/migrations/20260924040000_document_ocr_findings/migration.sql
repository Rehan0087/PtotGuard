ALTER TABLE "documents"
  ADD COLUMN "ocrFindings" JSONB,
  ADD COLUMN "ocrModel" TEXT;
