-- "under-mutation" is now a read projection of active related Mutation rows.
-- Keep Parcel.registryStatus as the parcel's non-workflow registry state so a
-- rejected or completed mutation cannot leave Records permanently active.
UPDATE "parcels"
SET "registryStatus" = 'verified'
WHERE "registryStatus" = 'under-mutation';
