import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * One client for the app's lifetime, connected explicitly rather than lazily
 * on first query — a bad DATABASE_URL then fails at boot, next to the log
 * line that explains it, instead of on whichever request happens to run
 * first in production.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      // Global, not per-query: a controller that forgets to select around
      // passwordHash would otherwise serialise it straight into a JSON
      // response the moment Phase 4 gives it a real value. One place makes
      // every current and future User query safe by construction.
      omit: { user: { passwordHash: true } },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Connected to Postgres");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
