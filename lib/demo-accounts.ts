import type { Role } from "@/lib/types";

/**
 * The five seeded identities real auth will eventually replace — one per
 * role, matching CURRENT_USER_BY_ROLE in lib/mocks/data.ts and
 * apps/api/src/auth/dev-current-user.ts exactly, since every request is
 * still scoped by role alone (see api-client.ts).
 *
 * The password check is real (wrong password is rejected) but not secure:
 * one shared value, compared in plain text, in code that ships to the
 * browser. That's a fine trust boundary for a demo login and not a real
 * one — real hashing and a real server-side check arrive with real auth
 * (Phase 4).
 */
export interface DemoAccount {
  email: string;
  name: string;
  role: Role;
  title?: string;
}

/** Shared by every demo account, so a live demo only needs to remember one thing. */
export const DEMO_PASSWORD = "demo1234";

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "ayesha.siddika@example.bd", name: "Ayesha Siddika", role: "citizen" },
  {
    email: "n.akter@minland.gov.bd",
    name: "Nasrin Akter",
    role: "land-office",
    title: "Sub-Registrar",
  },
  {
    email: "j.alam@minland.gov.bd",
    name: "Jahangir Alam",
    role: "field-agent",
    title: "Survey Amin",
  },
  { email: "s.khatun@landtribunal.gov.bd", name: "Shahida Khatun", role: "mediator" },
  { email: "admin@plotguard.gov.bd", name: "Registry Administrator", role: "admin" },
];

export function findDemoAccount(email: string): DemoAccount | undefined {
  const normalized = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === normalized);
}

/** Why a sign-in attempt didn't go through. A code, not a sentence — the screen words it. */
export type LoginFailure = { code: "unknown-email" } | { code: "wrong-password" };

export type LoginResult = { ok: true; account: DemoAccount } | ({ ok: false } & LoginFailure);

export function verifyDemoCredentials(email: string, password: string): LoginResult {
  const account = findDemoAccount(email);
  if (!account) return { ok: false, code: "unknown-email" };
  if (password !== DEMO_PASSWORD) return { ok: false, code: "wrong-password" };
  return { ok: true, account };
}
