/**
 * Ensures every advertised demo account exists and has the documented
 * password, including on a database that already has rows.
 *
 * The seed writes this hash, but the seed only ever runs on an empty
 * database: its createMany calls pass no skipDuplicates, so re-running it
 * against a populated one dies on the first unique constraint. Any machine
 * seeded before a login was added can therefore have a missing user or a
 * passwordHash of NULL. In either case the API answers with "Invalid email or
 * password" even though the sign-in screen advertises that account.
 *
 * These are explicit demo identities, so the upserts keep their documented
 * shared password deterministic and are safe to run as often as needed.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEMO_PASSWORD_HASH } from "./demo-password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const demoAccounts = [
    { id: "usr-ayesha", name: "Ayesha Siddika", email: "ayesha.siddika@example.bd", role: "citizen", jurisdictionId: "j-rajamehar" },
    { id: "usr-fatema", name: "Fatema Begum", email: "demo2@example.bd", role: "citizen", jurisdictionId: "j-rajamehar" },
    { id: "usr-rashed", name: "Rashed Khan", email: "demo3@example.bd", role: "citizen", jurisdictionId: "j-debidwar" },
    { id: "usr-noor", name: "Noor Jahan", email: "demo4@example.bd", role: "citizen", jurisdictionId: "j-payalgacha" },
    { id: "usr-habib", name: "Habib Molla", email: "demo5@example.bd", role: "citizen", jurisdictionId: "j-barura" },
    { id: "usr-officer", name: "Nasrin Akter", email: "n.akter@minland.gov.bd", role: "land-office", jurisdictionId: "j-debidwar", title: "Sub-Registrar" },
    { id: "usr-officer2", name: "Abdul Mannan", email: "a.mannan@minland.gov.bd", role: "land-office", jurisdictionId: "j-barura", title: "Registration Clerk" },
    { id: "usr-agent", name: "Jahangir Alam", email: "j.alam@minland.gov.bd", role: "field-agent", jurisdictionId: "j-debidwar", title: "Survey Amin" },
    { id: "usr-agent2", name: "Rezaul Karim", email: "r.karim@minland.gov.bd", role: "field-agent", jurisdictionId: "j-barura", title: "Survey Assistant" },
    { id: "usr-mediator", name: "Shahida Khatun", email: "s.khatun@landtribunal.gov.bd", role: "mediator", jurisdictionId: "j-cumilla", title: "Settlement Officer (Retd. Judge)" },
    { id: "usr-mediator2", name: "Anwara Begum", email: "a.begum@landtribunal.gov.bd", role: "mediator", jurisdictionId: "j-cumilla", title: "Settlement Officer" },
    { id: "usr-admin", name: "Registry Administrator", email: "admin@plotguard.gov.bd", role: "admin", jurisdictionId: "j-cumilla", title: "Registry Administrator" },
  ] as const;

  await prisma.$transaction(
    demoAccounts.map((account) =>
      prisma.user.upsert({
        where: { email: account.email },
        create: {
          ...account,
          status: "active",
          passwordHash: DEMO_PASSWORD_HASH,
        },
        update: {
          status: "active",
          passwordHash: DEMO_PASSWORD_HASH,
        },
      }),
    ),
  );
  console.log(`Ensured ${demoAccounts.length} demo accounts use the documented password.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
