import { INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditService } from "../audit/audit.service";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { issueAuthTokens } from "../auth/dev-current-user";
import { RolesGuard } from "../auth/roles.guard";
import { GrievancesController } from "../grievances/grievances.controller";
import { NotificationsController } from "../notifications/notifications.controller";
import { PrismaService } from "../prisma/prisma.service";
import { ServiceApplicationsController } from "./service-applications.controller";

let prismaFixture: Record<string, unknown>;
let auditFixture: Record<string, unknown>;

@Module({
  controllers: [ServiceApplicationsController, GrievancesController, NotificationsController],
  providers: [
    AccessTokenGuard,
    RolesGuard,
    { provide: PrismaService, useFactory: () => prismaFixture },
    { provide: AuditService, useFactory: () => auditFixture },
  ],
})
class SelfServiceTestModule {}

function bearer(id: string, role: "admin" | "citizen" | "land-office") {
  return `Bearer ${issueAuthTokens({ id, role }).accessToken}`;
}

/**
 * The citizen self-service writes used to fall back to the demo citizen when
 * no token was sent, and several never checked the record was the caller's.
 * These pin both halves: a real sign-in, and your own record only.
 */
describe("self-service authorization", () => {
  let app: INestApplication;
  let application: Record<string, unknown>;
  let grievance: Record<string, unknown>;

  beforeEach(async () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-that-is-long-enough";
    application = {
      id: "sa-1",
      applicationNo: "ADM-2026-001000",
      serviceType: "land-admin",
      status: "submitted",
      applicantId: "usr-ayesha",
      submittedAt: new Date(),
      paidAt: null,
    };
    grievance = {
      id: "g-1",
      caseNumber: "GRV-2026-0001",
      status: "submitted",
      filedById: "usr-ayesha",
      assignedOfficerId: "usr-officer",
      escalatedToId: null,
    };

    prismaFixture = {
      serviceApplication: {
        findUnique: async () => application,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          application = { ...application, ...data };
          return application;
        },
      },
      serviceApplicationEvent: { create: async () => ({}) },
      grievance: {
        findUnique: async () => grievance,
        findFirst: async () => null,
        count: async () => 0,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          grievance = data;
          return grievance;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          grievance = { ...grievance, ...data };
          return grievance;
        },
      },
      user: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === "usr-ayesha"
            ? { id: "usr-ayesha", name: "Ayesha Siddika", role: "citizen", jurisdictionId: "j-mouza" }
            : null,
        findMany: async () => [{ id: "usr-admin", name: "Registry Administrator", role: "admin" }],
      },
      grievanceEvent: { create: async () => ({}) },
      appNotification: { create: vi.fn().mockResolvedValue({}), updateMany: async () => ({ count: 0 }) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaFixture),
    };
    auditFixture = { append: async () => undefined };

    const moduleRef = await Test.createTestingModule({ imports: [SelfServiceTestModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    delete process.env.AUTH_TOKEN_SECRET;
    await app.close();
  });

  describe("paying a service application", () => {
    it("refuses an unauthenticated payment rather than booking it to the demo citizen", async () => {
      await request(app.getHttpServer()).patch("/service-applications/sa-1/pay").send({ paymentMethod: "bkash" }).expect(401);
      expect(application.paidAt).toBeNull();
    });

    it("refuses an officer — paying is the applicant's act", async () => {
      await request(app.getHttpServer())
        .patch("/service-applications/sa-1/pay")
        .set("authorization", bearer("usr-officer", "land-office"))
        .send({ paymentMethod: "bkash" })
        .expect(403);
    });

    it("answers another citizen as if the application did not exist", async () => {
      await request(app.getHttpServer())
        .patch("/service-applications/sa-1/pay")
        .set("authorization", bearer("usr-karim", "citizen"))
        .send({ paymentMethod: "bkash" })
        .expect(404);
      expect(application.paidAt).toBeNull();
    });

    it("lets the applicant pay their own", async () => {
      await request(app.getHttpServer())
        .patch("/service-applications/sa-1/pay")
        .set("authorization", bearer("usr-ayesha", "citizen"))
        .send({ paymentMethod: "bkash" })
        .expect(200);
      expect(application.paidAt).not.toBeNull();
    });
  });

  describe("resolving a grievance", () => {
    const resolution = { resolutionNote: "Delay explained and file expedited." };

    it("refuses the citizen who filed it — they rate, they don't resolve", async () => {
      await request(app.getHttpServer())
        .patch("/grievances/g-1/resolve")
        .set("authorization", bearer("usr-ayesha", "citizen"))
        .send(resolution)
        .expect(403);
      expect(grievance.status).toBe("submitted");
    });

    it("refuses every land-office officer, including a legacy assignee", async () => {
      await request(app.getHttpServer())
        .patch("/grievances/g-1/resolve")
        .set("authorization", bearer("usr-officer", "land-office"))
        .send(resolution)
        .expect(403);
      expect(grievance.status).toBe("submitted");
    });

    it("lets an administrator resolve it and notifies the citizen", async () => {
      await request(app.getHttpServer())
        .patch("/grievances/g-1/resolve")
        .set("authorization", bearer("usr-admin", "admin"))
        .send(resolution)
        .expect(200);
      expect(grievance.status).toBe("resolved");
      expect((prismaFixture.appNotification as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "usr-ayesha",
          severity: "success",
          title: "Grievance resolved",
          href: "/grievances/g-1",
        }),
      });
    });
  });

  describe("filing a grievance", () => {
    it("keeps the grievance queue out of the land-office portal", async () => {
      await request(app.getHttpServer())
        .get("/grievances")
        .set("authorization", bearer("usr-officer", "land-office"))
        .expect(403);
    });

    it("routes every complaint to admin and notifies both admin and citizen", async () => {
      const response = await request(app.getHttpServer())
        .post("/grievances")
        .set("authorization", bearer("usr-ayesha", "citizen"))
        .send({
          category: "technical",
          description: "The payment receipt page repeatedly fails to load.",
        })
        .expect(201);

      expect(response.body).toMatchObject({
        filedById: "usr-ayesha",
        escalatedToId: "usr-admin",
      });
      expect(response.body.assignedOfficerId).toBeUndefined();
      const createNotification = (prismaFixture.appNotification as { create: ReturnType<typeof vi.fn> }).create;
      expect(createNotification).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: "usr-ayesha", title: "Grievance submitted" }),
      });
      expect(createNotification).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: "usr-admin", title: "New grievance assigned" }),
      });
    });
  });

  describe("notifications", () => {
    it("refuses marking an inbox read without a sign-in", async () => {
      await request(app.getHttpServer()).post("/notifications/read-all").expect(401);
    });

    it("lets any signed-in role clear their own inbox", async () => {
      await request(app.getHttpServer())
        .post("/notifications/read-all")
        .set("authorization", bearer("usr-officer", "land-office"))
        .expect(200);
    });
  });
});
