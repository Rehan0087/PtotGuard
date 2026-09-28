/**
 * Gives every active demo account the documented password, on a database
 * that already has rows.
 *
 * The seed writes this hash, but the seed only ever runs on an empty
 * database: its createMany calls pass no skipDuplicates, so re-running it
 * against a populated one dies on the first unique constraint. Any machine
 * seeded before the hash was added therefore holds users with
 * passwordHash = NULL, and the API answers every sign-in with "Invalid email
 * or password" — the app is unusable against the real backend even though
 * the sign-in screen prints the password on the page.
 *
 * These are explicit demo identities, so this repair keeps their documented
 * shared password deterministic and is safe to run as often as needed.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEMO_PASSWORD_HASH } from "./demo-password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const demoEmails = [
    "ayesha.siddika@example.bd",
    "demo2@example.bd",
    "demo3@example.bd",
    "demo4@example.bd",
    "demo5@example.bd",
    "n.akter@minland.gov.bd",
    "a.mannan@minland.gov.bd",
    "j.alam@minland.gov.bd",
    "r.karim@minland.gov.bd",
    "s.khatun@landtribunal.gov.bd",
    "a.begum@landtribunal.gov.bd",
    "admin@plotguard.gov.bd",
  ];
  const { count } = await prisma.user.updateMany({
    where: { status: "active", email: { in: demoEmails } },
    data: { passwordHash: DEMO_PASSWORD_HASH },
  });
  console.log(`Set the documented demo password on ${count} active demo accounts.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
