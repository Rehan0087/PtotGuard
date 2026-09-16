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
 * This is the narrow repair for that. It fills in the hash only where one is
 * missing, so it never overwrites a password someone set deliberately, and
 * it is safe to run as often as you like.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEMO_PASSWORD_HASH } from "./demo-password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  // Suspended and invited accounts are skipped on purpose: login refuses them
  // by status, so a password would not make them usable, and writing one
  // would quietly undo an admin's suspension the day the status changed back.
  const { count } = await prisma.user.updateMany({
    where: { status: "active", passwordHash: null },
    data: { passwordHash: DEMO_PASSWORD_HASH },
  });
  const active = await prisma.user.count({ where: { status: "active" } });

  console.log(
    count === 0
      ? `Nothing to do — all ${active} active accounts already have a password.`
      : `Set the demo password on ${count} of ${active} active accounts.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
