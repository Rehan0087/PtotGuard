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
  disputeId: string | null;
  mutationId: string | null;
  purpose: string;
  status: string;
  assignedAgentId: string;
  assignedAt: Date;
  acceptedAt: Date | null;
  scheduledFor: Date;
  addressHint: string;
  gpsCaptures: unknown[];
  photos: unknown[];
  notes: string | null;
  submittedAt: Date | null;
  disputeFound?: boolean | null;
  disputeDescription?: string | null;
  reviewedAt?: Date | null;
  reviewedById?: string | null;
};

type SurveyFixture = {
  id: string;
  localSessionId: string | null;
  fieldReportId: string;
  bhumiId: string | null;
  assignedAgentId: string;
  status: string;
  version: number;
  startedAt: Date;
  completedAt: Date | null;
  summary: unknown | null;
};

type GpsPointFixture = {
  id: string;
  fieldSurveySessionId: string;
  sequence: number;
  latitude: number;
  longitude: number;
  recordedAt: Date;
  receivedAt: Date;
  accuracyMeters: number;
  altitudeMeters: number | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  issues: string[];
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
  let survey: SurveyFixture | null;
  let dispute: {
    id: string;
    caseNumber: string;
    filedById: string;
    status: string;
    updatedAt: Date;
  };
  let disputeEvents: Array<Record<string, unknown>>;
  let notifications: Array<Record<string, unknown>>;
  let auditEntries: Array<Record<string, unknown>>;
  let gpsPoints: GpsPointFixture[];
  let syncReceipts: Array<Record<string, unknown>>;
  let mutation: {
    id: string;
    mutationNumber: string;
    status: string;
    assignedOfficerId: string;
    updatedAt: Date;
  };

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
    survey = null;
    dispute = {
      id: "ds-1",
      caseNumber: "DSP-2026-00001",
      filedById: "usr-citizen",
      status: "field-visit-scheduled",
      updatedAt: new Date("2026-09-10T08:00:00Z"),
    };
    disputeEvents = [];
    notifications = [];
    gpsPoints = [];
    syncReceipts = [];
    mutation = {
      id: "m-1",
      mutationNumber: "MUT-2026-00001",
      status: "field-investigation",
      assignedOfficerId: "usr-officer",
      updatedAt: new Date("2026-09-10T08:00:00Z"),
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
      updateMany: async ({ where, data }: { where: { id: string; assignedAgentId?: string; status: string; reviewedAt?: null }; data: Record<string, unknown> }) => {
        if (
          where.id !== report.id ||
          (where.assignedAgentId !== undefined && where.assignedAgentId !== report.assignedAgentId) ||
          (where.reviewedAt === null && report.reviewedAt != null) ||
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

    const fieldSurveySession = {
      findUnique: async ({ where }: { where: { id?: string; fieldReportId?: string } }) =>
        survey &&
        ((where.id && survey.id === where.id) ||
          (where.fieldReportId && survey.fieldReportId === where.fieldReportId))
          ? survey
          : null,
      findFirst: async ({
        where,
      }: {
        where: { fieldReportId?: string; assignedAgentId?: string; status?: string };
      }) =>
        survey &&
        (!where.fieldReportId || survey.fieldReportId === where.fieldReportId) &&
        (!where.assignedAgentId || survey.assignedAgentId === where.assignedAgentId) &&
        (!where.status || survey.status === where.status)
          ? survey
          : null,
      create: async ({ data }: { data: SurveyFixture }) => {
        if (survey?.fieldReportId === data.fieldReportId) {
          throw new Error("Unique constraint failed on fieldReportId");
        }
        survey = { ...data };
        return survey;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; assignedAgentId: string; status: string; version?: number };
        data: Partial<SurveyFixture>;
      }) => {
        if (
          !survey ||
          survey.id !== where.id ||
          survey.assignedAgentId !== where.assignedAgentId ||
          survey.status !== where.status ||
          (where.version !== undefined && survey.version !== where.version)
        ) {
          return { count: 0 };
        }
        survey = { ...survey, ...data };
        return { count: 1 };
      },
      update: async ({ data }: { data: Partial<SurveyFixture> }) => {
        if (!survey) throw new Error("Survey missing");
        survey = { ...survey, ...data };
        return survey;
      },
    };

    const fieldSurveyGpsPoint = {
      findMany: async ({ where }: { where: { fieldSurveySessionId: string } }) =>
        gpsPoints
          .filter((point) => point.fieldSurveySessionId === where.fieldSurveySessionId)
          .sort((a, b) => a.sequence - b.sequence),
      create: async ({ data }: { data: GpsPointFixture }) => {
        gpsPoints.push(data);
        return data;
      },
    };

    const fieldSurveySyncReceipt = {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        syncReceipts.find((receipt) => receipt.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        syncReceipts.push(data);
        return data;
      },
    };

    prismaFixture = {
      fieldReport,
      fieldSurveySession,
      fieldSurveyGpsPoint,
      fieldSurveySyncReceipt,
      parcel: {
        findUnique: async () => ({
          id: "parcel-1",
          ulpin: "ILR-CUM-DEB-0001452",
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
      dispute: {
        findMany: async () => [],
        groupBy: async () => [],
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === dispute.id ? dispute : null,
        update: async ({ data }: { data: Partial<typeof dispute> }) => {
          dispute = { ...dispute, ...data };
          return dispute;
        },
      },
      disputeEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          disputeEvents.push(data);
          return data;
        },
      },
      appNotification: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          notifications.push(data);
          return data;
        },
      },
      mutation: {
        findMany: async () => [],
        findUnique: async ({ where }: { where: { id: string } }) => where.id === mutation.id ? mutation : null,
        updateMany: async ({ where, data }: { where: { id: string; status: string; updatedAt: Date }; data: Partial<typeof mutation> }) => {
          if (where.id !== mutation.id || where.status !== mutation.status || where.updatedAt !== mutation.updatedAt) return { count: 0 };
          mutation = { ...mutation, ...data };
          return { count: 1 };
        },
      },
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
    expect(response.body.survey).toBeNull();
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

  it("lets the responsible land officer accept a completed mutation investigation", async () => {
    report.status = "completed";
    report.mutationId = mutation.id;
    report.submittedAt = new Date("2026-09-15T09:00:00Z");
    report.disputeFound = false;

    const response = await request(app.getHttpServer())
      .post("/field-reports/fr-1/review")
      .set("authorization", bearer("usr-officer", "land-office"))
      .expect(200);

    expect(response.body.reviewedAt).toBeTruthy();
    expect(response.body.reviewedById).toBe("usr-officer");
    expect(mutation.status).toBe("field-verification-complete");
    expect(auditEntries.map((entry) => entry.action)).toEqual([
      "review-accepted",
      "field-verification-complete",
    ]);
  });

  it("does not let the field agent accept their own investigation as the officer review", async () => {
    report.status = "completed";
    report.mutationId = mutation.id;
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/review")
      .set("authorization", bearer("usr-agent", "field-agent"))
      .expect(403);
    expect(mutation.status).toBe("field-investigation");
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
      .expect(400);
  });

  it("allows only one concurrent acceptance", async () => {
    const token = bearer("usr-agent", "field-agent");
    const results = await Promise.all([
      request(app.getHttpServer()).post("/field-reports/fr-1/accept").set("authorization", token),
      request(app.getHttpServer()).post("/field-reports/fr-1/accept").set("authorization", token),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
  });

  it("starts an accepted owned case and records its BhumiID and audit event", async () => {
    report.status = "accepted";
    const response = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", bearer("usr-agent", "field-agent"))
      .expect(201);

    expect(response.body.report.status).toBe("in-progress");
    expect(response.body.survey).toMatchObject({
      fieldReportId: "fr-1",
      assignedAgentId: "usr-agent",
      bhumiId: "ILR-CUM-DEB-0001452",
      status: "in-progress",
    });
    expect(response.body.survey.startedAt).toBeTruthy();
    expect(auditEntries.at(-1)).toMatchObject({
      entityType: "field-survey",
      entityId: response.body.survey.id,
      action: "start",
      actorId: "usr-agent",
      payload: {
        fieldReportId: "fr-1",
        bhumiId: "ILR-CUM-DEB-0001452",
      },
    });
  });

  it("replays an idempotent offline start without creating a second session", async () => {
    report.status = "accepted";
    const token = bearer("usr-agent", "field-agent");
    const requestBody = { localSessionId: "550e8400-e29b-41d4-a716-446655440000" };

    const first = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .set("idempotency-key", "550e8400-e29b-41d4-a716-446655440010")
      .send(requestBody)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .set("idempotency-key", "550e8400-e29b-41d4-a716-446655440010")
      .send(requestBody)
      .expect(201);

    expect(replay.body.survey.id).toBe(first.body.survey.id);
    expect(auditEntries.filter((entry) => entry.action === "start")).toHaveLength(1);
    expect(syncReceipts).toHaveLength(1);

    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .set("idempotency-key", "550e8400-e29b-41d4-a716-446655440010")
      .send({ localSessionId: "550e8400-e29b-41d4-a716-446655440099" })
      .expect(409);
  });

  it("appends ordered GPS points once and restores them through detail", async () => {
    report.status = "accepted";
    const token = bearer("usr-agent", "field-agent");
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .send({ localSessionId: "550e8400-e29b-41d4-a716-446655440000" })
      .expect(201);
    const body = {
      points: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          sequence: 1,
          latitude: 23.55,
          longitude: 90.99,
          recordedAt: "2026-09-14T05:00:00.000Z",
          accuracyMeters: 4,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440002",
          sequence: 2,
          latitude: 23.5501,
          longitude: 90.9901,
          recordedAt: "2026-09-14T05:00:10.000Z",
          accuracyMeters: 6,
          altitudeMeters: 12,
        },
      ],
    };

    const first = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/points")
      .set("authorization", token)
      .set("idempotency-key", "550e8400-e29b-41d4-a716-446655440011")
      .send(body)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/points")
      .set("authorization", token)
      .set("idempotency-key", "550e8400-e29b-41d4-a716-446655440011")
      .send(body)
      .expect(201);
    const detail = await request(app.getHttpServer())
      .get("/field-reports/fr-1")
      .set("authorization", token)
      .expect(200);

    expect(first.body.acceptedThroughSequence).toBe(2);
    expect(replay.body.acceptedThroughSequence).toBe(2);
    expect(gpsPoints).toHaveLength(2);
    expect(detail.body.survey.points.map((point: GpsPointFixture) => point.sequence)).toEqual([1, 2]);
    expect(detail.body.survey.points[1].altitudeMeters).toBe(12);
  });

  it("rejects changed payload reuse, sequence gaps, and another agent's points", async () => {
    report.status = "accepted";
    const token = bearer("usr-agent", "field-agent");
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .send({ localSessionId: "550e8400-e29b-41d4-a716-446655440000" })
      .expect(201);
    const basePoint = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      sequence: 2,
      latitude: 23.55,
      longitude: 90.99,
      recordedAt: "2026-09-14T05:00:00.000Z",
      accuracyMeters: 4,
    };

    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/points")
      .set("authorization", token)
      .set("idempotency-key", "550e8400-e29b-41d4-a716-446655440012")
      .send({ points: [basePoint] })
      .expect(409);
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/points")
      .set("authorization", bearer("usr-agent-2", "field-agent"))
      .send({ points: [{ ...basePoint, sequence: 1 }] })
      .expect(404);
  });

  it("completes from durable points and replays without duplicate side effects", async () => {
    report.status = "accepted";
    const token = bearer("usr-agent", "field-agent");
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .send({ localSessionId: "550e8400-e29b-41d4-a716-446655440000" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/points")
      .set("authorization", token)
      .send({
        points: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            sequence: 1,
            latitude: 23.55,
            longitude: 90.99,
            recordedAt: "2026-09-14T05:00:00.000Z",
            accuracyMeters: 4,
          },
          {
            id: "550e8400-e29b-41d4-a716-446655440002",
            sequence: 2,
            latitude: 23.5501,
            longitude: 90.9901,
            recordedAt: "2026-09-14T05:00:10.000Z",
            accuracyMeters: 6,
          },
        ],
      })
      .expect(201);
    const completion = {
      notes: "Boundary walk retained and reviewed.",
      expectedVersion: 2,
    };
    const first = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/complete")
      .set("authorization", token)
      .set("idempotency-key", "550e8400-e29b-41d4-a716-446655440013")
      .send(completion)
      .expect(200);
    const replay = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/complete")
      .set("authorization", token)
      .set("idempotency-key", "550e8400-e29b-41d4-a716-446655440013")
      .send(completion)
      .expect(200);

    expect(first.body.survey.summary).toMatchObject({
      totalPoints: 2,
      geometry: "insufficient-points",
      confidence: "low",
    });
    expect(first.body.survey.points).toHaveLength(2);
    expect(replay.body.survey.summary.totalPoints).toBe(2);
    expect(auditEntries.filter((entry) => entry.action === "complete")).toHaveLength(1);
  });

  it("starts an accepted case from the optional en-route marker", async () => {
    report.status = "en-route";
    const response = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", bearer("usr-agent", "field-agent"))
      .expect(201);
    expect(response.body.report.status).toBe("in-progress");
    expect(response.body.survey.status).toBe("in-progress");
  });

  it("resumes the same active session through report detail", async () => {
    report.status = "accepted";
    const token = bearer("usr-agent", "field-agent");
    const started = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .expect(201);
    const detail = await request(app.getHttpServer())
      .get("/field-reports/fr-1")
      .set("authorization", token)
      .expect(200);
    expect(detail.body.survey.id).toBe(started.body.survey.id);
    expect(detail.body.report.status).toBe("in-progress");
  });

  it("does not let another agent start an owned case", async () => {
    report.status = "accepted";
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", bearer("usr-agent-2", "field-agent"))
      .expect(404);
    expect(survey).toBeNull();
  });

  it.each(["assigned", "completed", "cancelled"])(
    "rejects starting a case in %s state",
    async (status) => {
      report.status = status;
      await request(app.getHttpServer())
        .post("/field-reports/fr-1/survey/start")
        .set("authorization", bearer("usr-agent", "field-agent"))
        .expect(409);
      expect(survey).toBeNull();
    },
  );

  it("prevents duplicate and concurrent survey starts", async () => {
    report.status = "accepted";
    const token = bearer("usr-agent", "field-agent");
    const results = await Promise.all([
      request(app.getHttpServer()).post("/field-reports/fr-1/survey/start").set("authorization", token),
      request(app.getHttpServer()).post("/field-reports/fr-1/survey/start").set("authorization", token),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(survey?.fieldReportId).toBe("fr-1");

    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .expect(409);
  });

  it("rejects completion when a survey was never started", async () => {
    report.status = "in-progress";
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/complete")
      .set("authorization", bearer("usr-agent", "field-agent"))
      .send({ notes: "Boundary verified." })
      .expect(409);
  });

  it("does not let another agent complete an active survey", async () => {
    report.status = "accepted";
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", bearer("usr-agent", "field-agent"))
      .expect(201);
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/complete")
      .set("authorization", bearer("usr-agent-2", "field-agent"))
      .send({ notes: "Boundary verified." })
      .expect(404);
  });

  it("rejects completion until the report has its required evidence", async () => {
    report.status = "accepted";
    const token = bearer("usr-agent", "field-agent");
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .expect(201);
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/complete")
      .set("authorization", token)
      .send({ notes: "Boundary verified." })
      .expect(422);
  });

  it("completes session and synchronizes report and dispute", async () => {
    report.status = "accepted";
    report.disputeId = "ds-1";
    const token = bearer("usr-agent", "field-agent");
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .expect(201);
    report.gpsCaptures = [{ id: "g-1" }, { id: "g-2" }];

    const response = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/complete")
      .set("authorization", token)
      .send({ notes: "Boundary verified." })
      .expect(200);

    expect(response.body.report).toMatchObject({
      status: "completed",
      notes: "Boundary verified.",
    });
    expect(response.body.report.submittedAt).toBeTruthy();
    expect(response.body.survey.status).toBe("completed");
    expect(response.body.survey.completedAt).toBeTruthy();
    expect(dispute.status).toBe("under-review");
    expect(disputeEvents.at(-1)).toMatchObject({
      type: "field-visit",
      title: "Field survey filed",
    });
    expect(notifications.at(-1)).toMatchObject({
      userId: "usr-citizen",
      content: {
        code: "dispute-status",
        caseNumber: "DSP-2026-00001",
        status: "under-review",
      },
    });
    expect(auditEntries.at(-1)).toMatchObject({
      entityType: "field-survey",
      entityId: response.body.survey.id,
      action: "complete",
      actorId: "usr-agent",
    });
  });

  it("advances a no-dispute mutation when the field agent files the report", async () => {
    report.status = "accepted";
    report.mutationId = mutation.id;
    const token = bearer("usr-agent", "field-agent");
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .expect(201);
    report.gpsCaptures = [{ id: "g-1" }, { id: "g-2" }];

    const response = await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/complete")
      .set("authorization", token)
      .send({ notes: "Boundaries match the deed.", disputeFound: false })
      .expect(200);

    expect(response.body.report).toMatchObject({
      status: "completed",
      disputeFound: false,
    });
    expect(mutation.status).toBe("field-verification-complete");
    expect(auditEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entityType: "mutation",
        entityId: mutation.id,
        action: "field-verification-complete",
        actorId: "usr-agent",
      }),
    ]));
    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "usr-officer",
        body: expect.stringContaining("field verification complete"),
      }),
    ]));
  });

  it("allows only one concurrent survey completion", async () => {
    report.status = "accepted";
    const token = bearer("usr-agent", "field-agent");
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/start")
      .set("authorization", token)
      .expect(201);
    report.gpsCaptures = [{ id: "g-1" }, { id: "g-2" }];

    const results = await Promise.all([
      request(app.getHttpServer())
        .post("/field-reports/fr-1/survey/complete")
        .set("authorization", token)
        .send({ notes: "Boundary verified." }),
      request(app.getHttpServer())
        .post("/field-reports/fr-1/survey/complete")
        .set("authorization", token)
        .send({ notes: "Boundary verified." }),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);

    await request(app.getHttpServer())
      .post("/field-reports/fr-1/survey/complete")
      .set("authorization", token)
      .send({ notes: "Boundary verified." })
      .expect(409);
  });

  it("requires an active survey before accepting existing media writes", async () => {
    report.status = "in-progress";
    await request(app.getHttpServer())
      .post("/field-reports/fr-1/media")
      .set("authorization", bearer("usr-agent", "field-agent"))
      .send({ photo: { url: "", caption: "Boundary marker" } })
      .expect(409);
    expect(report.photos).toEqual([]);
  });
});
