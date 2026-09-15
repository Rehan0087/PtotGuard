/**
 * scrypt hash of the local demo password — demo1234 — which the sign-in
 * screen publishes deliberately.
 *
 * Shared by the seed and by ensure-demo-logins so the two can never drift.
 * A second copy of a hash is how a database ends up with credentials that
 * match nothing: the literal is unreadable, so a wrong one looks right.
 */
export const DEMO_PASSWORD_HASH =
  "scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede";
