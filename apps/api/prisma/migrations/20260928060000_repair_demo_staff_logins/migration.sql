-- Existing development databases may predate passwordHash seeding. These are
-- documented demo identities, so keep their shared password deterministic.
UPDATE "users"
SET "passwordHash" = 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede'
WHERE "status" = 'active'
  AND "email" IN (
    'ayesha.siddika@example.bd',
    'demo2@example.bd',
    'demo3@example.bd',
    'demo4@example.bd',
    'demo5@example.bd',
    'n.akter@minland.gov.bd',
    'a.mannan@minland.gov.bd',
    'j.alam@minland.gov.bd',
    'r.karim@minland.gov.bd',
    's.khatun@landtribunal.gov.bd',
    'a.begum@landtribunal.gov.bd',
    'admin@plotguard.gov.bd'
  );
