import type { Role } from "@/lib/types";

/**
 * The five seeded sign-in choices shown by the demo UI. The real API verifies
 * their shared local-demo password against a scrypt hash; MSW mirrors that
 * contract when the frontend runs without Postgres.
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
