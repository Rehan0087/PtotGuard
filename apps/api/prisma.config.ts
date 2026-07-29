import path from "node:path";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

// `dotenv`-less on purpose: Nest's own bootstrap loads .env for the running
// app, but the Prisma CLI (migrate, studio, db seed) invokes this file
// directly with nothing else in the process, so it has to load its own.
import "dotenv/config";

/**
 * Prisma 7 reads the connection string through a driver adapter rather than
 * `datasource.url` in schema.prisma, so Migrate and the runtime PrismaService
 * (src/prisma/prisma.service.ts) share exactly one place that says how to
 * connect — not a schema-file URL that can drift from an env-based one.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  // Migrate needs a plain URL (it runs raw SQL outside the query engine);
  // the runtime PrismaService uses `adapter` below instead. Same env var,
  // two consumers, so they can never point at different databases.
  datasource: { url: process.env.DATABASE_URL },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  adapter: async () => new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
