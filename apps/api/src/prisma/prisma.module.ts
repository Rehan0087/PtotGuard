import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Global so every feature module can inject PrismaService without importing
 * this module itself — the database connection is infrastructure, not a
 * feature dependency any one module owns.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
