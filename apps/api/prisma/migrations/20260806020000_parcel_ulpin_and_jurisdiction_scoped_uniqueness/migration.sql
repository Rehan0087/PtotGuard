-- ULPIN: a citable, unique identifier for one plot. Nullable, because a parcel
-- whose jurisdiction chain lacks a district or upazila genuinely cannot be
-- given one — see buildUlpin() in @plotguard/rules, which refuses rather than
-- stamping a placeholder that looks citable and resolves to nothing.
ALTER TABLE "parcels" ADD COLUMN "ulpin" TEXT;

CREATE UNIQUE INDEX "parcels_ulpin_key" ON "parcels"("ulpin");

-- Fix a latent correctness bug, not a refactor.
--
-- dag + khatian was unique across the whole table. A dag number only carries
-- meaning within its mouza: two mouzas can each legitimately hold a dag 142 /
-- khatian 512, and the old constraint would refuse to store the second one.
-- Invisible with six seeded parcels in distinct mouzas; a hard failure on the
-- first real district import.
--
-- Cheap now (6 rows), expensive and data-losing later.
DROP INDEX "parcels_dagNo_khatianNo_key";

CREATE UNIQUE INDEX "parcels_jurisdictionId_dagNo_khatianNo_key"
  ON "parcels"("jurisdictionId", "dagNo", "khatianNo");
