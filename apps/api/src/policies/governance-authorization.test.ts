import { INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { issueAuthTokens } from "../auth/dev-current-user";
import { RolesGuard } from "../auth/roles.guard";
import { JurisdictionsController } from "../jurisdictions/jurisdictions.controller";
import { PrismaService } from "../prisma/prisma.service";
import { PoliciesController } from "./policies.controller";

let prismaFixture: Record<string, unknown>;
let auditFixture: Record<string, unknown>;

@Module({
  controllers: [PoliciesController, JurisdictionsController],
  providers: [
    AccessTokenGuard,
    RolesGuard,
    { provide: PrismaService, useFactory: () => prismaFixture },
    { provide: AuditService, useFactory: () => auditFixture },
  ],
})
class GovernanceTestModule {}

function bearer(id: string, role: "admin" | "citizen" | "land-office") {
  return `Bearer ${issueAuthTokens({ id, role }).accessToken}`;
}

/**
 * The two surfaces that change the rules rather than a record: what every
 * service costs, and the shape of the jurisdiction tree every scope check
 * reads. Both answered an unauthenticated caller until this pass.
 */
describe("governance authorization", () => {
  let app: INestApplication;
  let policy: Record<string, unknown>;
  let auditEntries: Array<Record<string, unknown>>;

  beforeEach(async () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-that-is-long-enough";
    policy = {
      id: "singleton",
      mutationFeeBdt: 1000,
      objectionWindowDays: 15,
      fraudScoreThreshold: 0.7,
      landTaxRatePerDecimalBdt: {},
      landTaxAgriculturalExemptionDecimals: 825,
      landTaxArrearSurchargePercent: 0,
      landTaxMaxArrearYears: 3,
      landAdminCertifiedCopyFeeBdt: 200,
      landAdminCorrectionFeeBdt: 500,
      revenueCaseFilingFeeBdt: 300,
      leaseSettlementAgriculturalFeeBdt: 300,
      leaseSettlementNonAgriculturalFeeBdt: 1000,
    };
    auditEntries = [];

    prismaFixture = {
      policy: {
        findUnique: async () => policy,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          policy = { ...policy, ...data };
          return policy;
        },
      },
      jurisdiction: {
        findMany: async () => [{ id: "j-cumilla", code: "CTG-CUM", name: "Cumilla", level: "district", parentId: null }],
        findUnique: async () => null,
        create: async ({ data }: { data: unknown }) => data,
        update: async ({ data }: { data: unknown }) => data,
        delete: async () => ({}),
      },
      parcel: { count: async () => 0, findMany: async () => [] },
      user: { count: async () => 0, findMany: async () => [] },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaFixture),
    };
    auditFixture = {
      append: async (_tx: unknown, entry: Record<string, unknown>) => {
        auditEntries.push(entry);
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [GovernanceTestModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    delete process.env.AUTH_TOKEN_SECRET;
    await app.close();
  });

  describe("fee policy", () => {
    it("refuses an unauthenticated change to what every service costs", async () => {
      await request(app.getHttpServer())
        .patch("/policies")
        .send({ mutationFeeBdt: 1 })
        .expect(401);
      expect(policy.mutationFeeBdt).toBe(1000);
    });

    it("refuses a citizen setting their own mutation fee", async () => {
      await request(app.getHttpServer())
        .patch("/policies")
        .set("authorization", bearer("usr-ayesha", "citizen"))
        .send({ mutationFeeBdt: 1 })
        .expect(403);
      expect(policy.mutationFeeBdt).toBe(1000);
    });

    it("refuses an officer — deciding cases is not setting fees", async () => {
      await request(app.getHttpServer())
        .patch("/policies")
        .set("authorization", bearer("usr-officer", "land-office"))
        .send({ mutationFeeBdt: 1 })
        .expect(403);
    });

    it("lets an administrator through, and records it", async () => {
      await request(app.getHttpServer())
        .patch("/policies")
        .set("authorization", bearer("usr-admin", "admin"))
        .send({ mutationFeeBdt: 1200 })
        .expect(200);

      expect(policy.mutationFeeBdt).toBe(1200);
      expect(auditEntries.at(-1)).toMatchObject({ entityType: "policy", actorId: "usr-admin" });
    });

    // The read stays open: every citizen fee display asks for it.
    it("still shows the fees to anybody", async () => {
      await request(app.getHttpServer()).get("/policies").expect(200);
    });
  });

  describe("the jurisdiction tree", () => {
    it("refuses an unauthenticated creation", async () => {
      await request(app.getHttpServer())
        .post("/jurisdictions")
        .send({ code: "X", name: "Nowhere", level: "district" })
        .expect(401);
    });

    it("refuses a citizen deleting a district", async () => {
      await request(app.getHttpServer())
        .delete("/jurisdictions/j-cumilla")
        .set("authorization", bearer("usr-ayesha", "citizen"))
        .expect(403);
    });

    it("refuses an officer renaming one", async () => {
      await request(app.getHttpServer())
        .patch("/jurisdictions/j-cumilla")
        .set("authorization", bearer("usr-officer", "land-office"))
        .send({ name: "Renamed" })
        .expect(403);
    });

    it("still lists the tree for everybody — scope checks everywhere read it", async () => {
      await request(app.getHttpServer()).get("/jurisdictions").expect(200);
    });
  });
});
