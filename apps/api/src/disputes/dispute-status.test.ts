import { INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { issueAuthTokens } from "../auth/dev-current-user";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { DisputesController } from "./disputes.controller";

let prismaFixture: Record<string, unknown>;
let auditFixture: Record<string, unknown>;

@Module({
  controllers: [DisputesController],
  providers: [
    AccessTokenGuard,
    RolesGuard,
    { provide: PrismaService, useFactory: () => prismaFixture },
    { provide: AuditService, useFactory: () => auditFixture },
  ],
})
class DisputesTestModule {}

function bearer(id: string, role: "mediator" | "citizen" | "land-office") {
  return `Bearer ${issueAuthTokens({ id, role }).accessToken}`;
}

describe("moving a dispute along", () => {
  let app: INestApplication;
  let dispute: { id: string; caseNumber: string; filedById: string; status: string; parties: unknown[]; updatedAt: Date };

  beforeEach(async () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-that-is-long-enough";
    dispute = {
      id: "ds-1",
      caseNumber: "DSP-2026-00381",
      filedById: "usr-ayesha",
      status: "submitted",
      parties: [],
      updatedAt: new Date("2026-09-01T00:00:00Z"),
    };

    prismaFixture = {
      dispute: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === dispute.id ? dispute : null,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          dispute = { ...dispute, ...data } as typeof dispute;
          return dispute;
        },
      },
      disputeEvent: { create: async ({ data }: { data: unknown }) => data },
      appNotification: {
        createMany: async ({ data }: { data: unknown }) => ({ count: Array.isArray(data) ? data.length : 0 }),
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaFixture),
    };
    auditFixture = { append: async () => undefined };

    const moduleRef = await Test.createTestingModule({ imports: [DisputesTestModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    delete process.env.AUTH_TOKEN_SECRET;
    await app.close();
  });

  it("refuses an unauthenticated move", async () => {
    await request(app.getHttpServer())
      .patch("/disputes/ds-1/status")
      .send({ status: "under-land-office-review" })
      .expect(401);
  });

  it("refuses the citizen who filed it — a party cannot move their own case", async () => {
    await request(app.getHttpServer())
      .patch("/disputes/ds-1/status")
      .set("authorization", bearer("usr-ayesha", "citizen"))
      .send({ status: "under-land-office-review" })
      .expect(403);
  });

  it("lets the officer handling it move the case", async () => {
    await request(app.getHttpServer())
      .patch("/disputes/ds-1/status")
      .set("authorization", bearer("usr-officer", "land-office"))
      .send({ status: "under-land-office-review" })
      .expect(200);

    expect(dispute.status).toBe("under-land-office-review");
  });

  it("sends listing through the hearing, not a status write", async () => {
    const response = await request(app.getHttpServer())
      .patch("/disputes/ds-1/status")
      .set("authorization", bearer("usr-mediator", "mediator"))
      .send({ status: "hearing-scheduled" })
      .expect(422);

    expect(response.body.reason).toMatchObject({ code: "schedule-via-hearing" });
  });

  it("sends resolution through the ruling", async () => {
    const response = await request(app.getHttpServer())
      .patch("/disputes/ds-1/status")
      .set("authorization", bearer("usr-mediator", "mediator"))
      .send({ status: "decided" })
      .expect(422);

    expect(response.body.reason).toMatchObject({ code: "decide-via-ruling" });
  });

  it("refuses a jump that skips review", async () => {
    const response = await request(app.getHttpServer())
      .patch("/disputes/ds-1/status")
      .set("authorization", bearer("usr-mediator", "mediator"))
      .send({ status: "forwarded-to-settlement" })
      .expect(422);

    expect(response.body.reason).toMatchObject({ code: "illegal-transition" });
  });

  it("refuses anything at all once the case is closed", async () => {
    dispute.status = "withdrawn";
    const response = await request(app.getHttpServer())
      .patch("/disputes/ds-1/status")
      .set("authorization", bearer("usr-mediator", "mediator"))
      .send({ status: "under-land-office-review" })
      .expect(422);

    expect(response.body.reason).toMatchObject({ code: "already-closed" });
  });
});
