import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { JurisdictionsModule } from "./jurisdictions/jurisdictions.module";
import { ParcelsModule } from "./parcels/parcels.module";

/**
 * The root module. Domain modules (parcels, disputes, mutations, …) hang off
 * here as they are built; each one wraps the matching group of the frozen spec.
 */
@Module({
  imports: [PrismaModule, JurisdictionsModule, ParcelsModule],
  controllers: [HealthController],
  providers: [
    // Registered here rather than in main.ts so it is also active in tests that
    // build the module directly — an envelope only the production bootstrap
    // applies is an envelope the contract tests never actually check.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
