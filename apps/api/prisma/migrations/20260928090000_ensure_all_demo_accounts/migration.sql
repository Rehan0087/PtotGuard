-- Older demo databases may not contain accounts added to the login screen
-- after their original seed. Ensure every advertised identity exists, then
-- give all of them the same documented local-demo password.
INSERT INTO "users" (
  "id", "name", "email", "role", "jurisdictionId", "title", "status", "passwordHash", "createdAt"
)
VALUES
  ('usr-ayesha', 'Ayesha Siddika', 'ayesha.siddika@example.bd', 'citizen', 'j-rajamehar', NULL, 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2024-02-11T09:00:00Z'),
  ('usr-fatema', 'Fatema Begum', 'demo2@example.bd', 'citizen', 'j-rajamehar', NULL, 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2025-01-15T09:00:00Z'),
  ('usr-rashed', 'Rashed Khan', 'demo3@example.bd', 'citizen', 'j-debidwar', NULL, 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2025-03-20T09:00:00Z'),
  ('usr-noor', 'Noor Jahan', 'demo4@example.bd', 'citizen', 'j-payalgacha', NULL, 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2025-06-10T09:00:00Z'),
  ('usr-habib', 'Habib Molla', 'demo5@example.bd', 'citizen', 'j-barura', NULL, 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2025-08-05T09:00:00Z'),
  ('usr-officer', 'Nasrin Akter', 'n.akter@minland.gov.bd', 'land-office', 'j-debidwar', 'Sub-Registrar', 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2021-01-05T09:00:00Z'),
  ('usr-officer2', 'Abdul Mannan', 'a.mannan@minland.gov.bd', 'land-office', 'j-barura', 'Registration Clerk', 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2022-08-22T09:00:00Z'),
  ('usr-agent', 'Jahangir Alam', 'j.alam@minland.gov.bd', 'field-agent', 'j-debidwar', 'Survey Amin', 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2022-03-14T09:00:00Z'),
  ('usr-agent2', 'Rezaul Karim', 'r.karim@minland.gov.bd', 'field-agent', 'j-barura', 'Survey Assistant', 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2023-05-30T09:00:00Z'),
  ('usr-mediator', 'Shahida Khatun', 's.khatun@landtribunal.gov.bd', 'mediator', 'j-cumilla', 'Settlement Officer (Retd. Judge)', 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2020-09-01T09:00:00Z'),
  ('usr-mediator2', 'Anwara Begum', 'a.begum@landtribunal.gov.bd', 'mediator', 'j-cumilla', 'Settlement Officer', 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2021-03-15T09:00:00Z'),
  ('usr-admin', 'Registry Administrator', 'admin@plotguard.gov.bd', 'admin', 'j-cumilla', 'Registry Administrator', 'active', 'scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede', '2020-01-01T09:00:00Z')
ON CONFLICT ("email") DO UPDATE
SET "status" = 'active',
    "passwordHash" = EXCLUDED."passwordHash";
