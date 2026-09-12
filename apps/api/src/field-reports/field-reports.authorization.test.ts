import { INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { issueAuthTokens } from "../auth/dev-current-user";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { FieldReportsController } from "./field-reports.controller";

type ReportFixture = {
  id: string;
  parcelId: string;
  parcelDagNo: string;
  disputeId: null;
  mutationId: null;
  purpose: string;
  status: string;
  assignedAgentId: string;
  assignedAt: Date;
  acceptedAt: Date | null;
  scheduledFor: Date;
  addressHint: string;
  gpsCaptures: unknown[];
  photos: unknown[];
  notes: null;
  submittedAt: null;
};

let prismaFixture: Record<string, unknown>;
let auditFixture: Record<string, unknown>;

@Module({
  controllers: [FieldReportsController],
  providers: [
    AccessTokenGuard,
    RolesGuard,
    { provide: PrismaService, useFactory: () => prismaFixture },
    { provide: AuditService, useFactory: () => auditFixture },
  ],
})
class FieldReportsTestModule {}

function bearer(id: string, role: "field-agent" | "land-office") {
  return `Bearer ${issueAuthTokens({ id, role }).accessToken}`;
}

describe("field report assignment authorization", () => {
  let app: INestApplication;
  let report: ReportFixture;
  let auditEntries: Array<Record<string, unknown>>;

  beforeEach(async () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-that-is-long-enough";
    report = {
      id: "fr-1",
      parcelId: "parcel-1",
      parcelDagNo: "1452",
      disputeId: null,
      mutationId: null,
      purpose: "boundary-survey",
      status: "assigned",
      assignedAgentId: "usr-agent",
      assignedAt: new Date("2026-09-10T08:00:00Z"),
      acceptedAt: null,
      scheduledFor: new Date("2026-09-15T08:00:00Z"),
      addressHint: "Rajamehar, Debidwar",
      gpsCaptures: [],
      photos: [],
      notes: null,
      submittedAt: null,
    };

    const fieldReport = {
      findMany: async ({ where }: { where: { assignedAgentId?: string } }) =>
        !where.assignedAgentId || where.assignedAgentId === report.assignedAgentId ? [report] : [],
      findFirst: async ({ where }: { where: { id: string; assignedAgentId?: string } }) =>
        where.id === report.id &&
        (!where.assignedAgentId || where.assignedAgentId === report.assignedAgentId)
          ? report
          : null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === report.id ? report : null,
      updateMany: async ({ where, data }: { where: { id: string; assignedAgentId: string; status: string }; data: Record<string, unknown> }) => {
        if (
          where.id !== report.id ||
          where.assignedAgentId !== report.assignedAgentId ||
          where.status !== report.status
        ) {
          return { count: 0 };
        }
        report = { ...report, ...data } as ReportFixture;
        return { count: 1 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        report = { ...report, ...data } as ReportFixture;
        return report;
      },
    };

    prismaFixture = {
      fieldReport,
      parcel: {
        findUnique: async () => ({
          id: "parcel-1",
          dagNo: "1452",
          khatianNo: "88",
          area: 0.35,
          areaUnit: "acre",
          landUse: "agricultural",
          status: "active",
          currentOwnerId: "owner-1",
          jurisdictionId: "j-1",
          owner: { name: "Rahim Uddin" },
        }),
      },
      ownershipRecord: { findMany: async () => [] },
      landDocument: { findMany: async () => [] },
      dispute: { findMany: async () => [], groupBy: async () => [] },
      mutation: { findMany: async () => [] },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(prismaFixture),
    };
    auditEntries = [];
    auditFixture = {
      append: async (_tx: unknown, entry: Record<string, unknown>) => {
        auditEntries.push(entry);
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [FieldReportsTestModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    delete process.env.AUTH_TOKEN_SECRET;
    await app.close();
  });

  it("rejects an unauthenticated assigned-case request", async () => {
    await request(app.getHttpServer()).get("/field-reports/assigned").expect(401);
  });

  it("rejects an authenticated non-field-agent", async () => {
    await request(app.getHttpServer())
      .get("/field-reports/assigned")
      .set("authorization", bearer("usr-officer", "land-office"))
      .expect(403);
  });

  it("returns assigned cases to the authenticated field agent", async () => {
    const response = await request(app.getHttpServer())
      .get("/field-reports/assigned")
      .set("authorization", bearer("usr-agent", "field-agent"))
      .expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: "fr-1", status: "assigned" });
  });

  it("returns an empty assignment list for a field agent with no cases", async () => {
    const response = await request(app.getHttpServer())
      .get("/field-reports/assigned")
      .set("authorization", bearer("usr-agent-2", "field-agent"))
      .expect(200);
    expect(response.body).toEqual([]);
  });

  it("returns the correct owned case and handles an invalid id", async () => {
    const token = bearer("usr-agent", "field-agent");
    const response = await request(app.getHttpServer())
      .get("/field-reports/fr-1")
      .set("authorization", token)
      .expect(200);
    expect(response.body.report).toMatchObject({ id: "fr-1", parcelDagNo: "1452" });
    await request(app.getHttpServer())
      .get("/field-reports/missing")
      .set("authorization", token)
      .expect(404);
  });

  it("accepts an assigned case exactly once", async () => {
    const token = bearer("usr-agent", "field-agent");
    const accepted = await request(app.getHttpServer())
      .post("/field-reports/fr-1/accept")
      .set("authorization", token)
      .expect(200);
    expect(accepted.body).toMatchObject({ id: "fr-1", status: "accepted" });
    expect(accepted.body.acceptedAt).toBeTruthy();
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({
      entityId: "fr-1",
      action: "status-change",
      actorId: "usr-agent",
      payload: {
        caseId: "fr-1",
        agentId: "usr-agent",
        previousStatus: "assigned",
        newStatus: "accepted",
      },
    });

    await request(app.getHttpServer())
      .post("/field-reports/fr-1/accept")
      .set("authorization", token)
      .expect(409);
  });

  it("does not expose or accept another agent's case", async () => {
    const token = bearer("usr-agent-2", "field-agent");
    await request(app.getHttpServer())
      .get("/field-reports/fr-1")
      .set("authorization", token)
      .expect(404);
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/accept")
      .set("authorization", token)
      .expect(404);
  });

  it("does not let the generic update endpoint accept or skip a case state", async () => {
    const token = bearer("usr-agent", "field-agent");
    await request(app.getHttpServer())
      .patch("/field-reports/fr-1")
      .set("authorization", token)
      .send({ status: "accepted" })
      .expect(400);
    await request(app.getHttpServer())
      .patch("/field-reports/fr-1")
      .set("authorization", token)
      .send({ status: "in-progress" })
      .expect(422);
  });

  it("allows only one concurrent acceptance", async () => {
    const token = bearer("usr-agent", "field-agent");
    const results = await Promise.all([
      request(app.getHttpServer()).post("/field-reports/fr-1/accept").set("authorization", token),
      request(app.getHttpServer()).post("/field-reports/fr-1/accept").set("authorization", token),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
  });
});
