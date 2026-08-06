-- Encumbrances on a plot: mortgages, injunctions, attachments, acquisition
-- notices, and non-transferable tenure. Their own table rather than Json on
-- parcels — each carries an identity, a date range, and an issuing authority,
-- and the public record view reads them without loading the whole parcel.
CREATE TABLE "parcel_restrictions" (
  "id"          TEXT NOT NULL,
  "parcelId"    TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "authority"   TEXT NOT NULL,
  "referenceNo" TEXT,
  "note"        TEXT,
  "fromDate"    TIMESTAMP(3) NOT NULL,
  -- NULL = still in force. See activeRestrictions() in @plotguard/rules.
  "toDate"      TIMESTAMP(3),

  CONSTRAINT "parcel_restrictions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parcel_restrictions_parcelId_idx" ON "parcel_restrictions"("parcelId");

ALTER TABLE "parcel_restrictions"
  ADD CONSTRAINT "parcel_restrictions_parcelId_fkey"
  FOREIGN KEY ("parcelId") REFERENCES "parcels"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
