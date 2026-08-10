import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { JurisdictionsModule } from "./jurisdictions/jurisdictions.module";
import { ParcelsModule } from "./parcels/parcels.module";
import { UsersModule } from "./users/users.module";
import { DocumentsModule } from "./documents/documents.module";
import { DisputesModule } from "./disputes/disputes.module";
import { PoliciesModule } from "./policies/policies.module";
import { MutationsModule } from "./mutations/mutations.module";
import { ServiceApplicationsModule } from "./service-applications/service-applications.module";
import { LandTaxModule } from "./land-tax/land-tax.module";
import { FieldReportsModule } from "./field-reports/field-reports.module";
import { HearingsModule } from "./hearings/hearings.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";

/**
 * The root module. Domain modules (parcels, disputes, mutations, …) hang off
 * here as they are built; each one wraps the matching group of the frozen spec.
 */
@Module({
  imports: [
    PrismaModule,
    JurisdictionsModule,
    ParcelsModule,
    UsersModule,
    DocumentsModule,
    DisputesModule,
    PoliciesModule,
    MutationsModule,
    ServiceApplicationsModule,
    LandTaxModule,
    FieldReportsModule,
    HearingsModule,
    NotificationsModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    // Registered here rather than in main.ts so it is also active in tests that
    // build the module directly — an envelope only the production bootstrap
    // applies is an envelope the contract tests never actually check.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
