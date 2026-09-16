import { INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { issueAuthTokens } from "../auth/dev-current-user";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { HearingsController } from "./hearings.controller";

type HearingFixture = {
  id: string;
  caseNumber: string;
  disputeId: string;
  parcelDagNo: string;
  mediatorId: string;
  status: string;
  parties: string[];
  hearingDate: Date | null;
  sessions: unknown[];
  ruling: string | null;
  ruledAt: Date | null;
};

let prismaFixture: Record<string, unknown>;
let auditFixture: Record<string, unknown>;

@Module({
  controllers: [HearingsController],
  providers: [
    AccessTokenGuard,
    RolesGuard,
    { provide: PrismaService, useFactory: () => prismaFixture },
    { provide: AuditService, useFactory: () => auditFixture },
  ],
})
class HearingsTestModule {}

function bearer(id: string, role: "mediator" | "citizen" | "land-office") {
  return `Bearer ${issueAuthTokens({ id, role }).accessToken}`;
}

describe("hearing lifecycle", () => {
  let app: INestApplication;
  let hearing: HearingFixture;
  let auditEntries: Array<Record<string, unknown>>;

  const mediator = () => bearer("usr-mediator", "mediator");

  beforeEach(async () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-that-is-long-enough";
    hearing = {
      id: "h-1",
      caseNumber: "HRG-2026-0044",
      disputeId: "ds-1",
      parcelDagNo: "CS-176",
      mediatorId: "usr-mediator",
      status: "in-hearing",
      parties: ["Md. Karim Uddin", "Sohel Rana"],
      hearingDate: new Date("2026-07-26T05:30:00Z"),
      sessions: [{ id: "s-1", at: "2026-07-19T05:30:00Z", summary: "First sitting", attendees: [] }],
      ruling: null,
      ruledAt: null,
    };
    auditEntries = [];

    const users: Record<string, { id: string; name: string; role: string; status: string }> = {
      "usr-mediator2": { id: "usr-mediator2", name: "Anwara Begum", role: "mediator", status: "active" },
      "usr-officer": { id: "usr-officer", name: "Nasrin Akter", role: "land-office", status: "active" },
      "usr-mediator": { id: "usr-mediator", name: "Shahida Khatun", role: "mediator", status: "active" },
    };

    prismaFixture = {
      hearing: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === hearing.id ? hearing : null,
        update: async ({ data }: { data: Partial<HearingFixture> }) => {
          hearing = { ...hearing, ...data };
          return hearing;
        },
      },
      dispute: {
        findUnique: async () => ({
          id: "ds-1",
          caseNumber: "DSP-2026-00388",
          filedById: "usr-karim",
          status: "hearing-scheduled",
          parties: [],
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => data,
      },
      disputeEvent: { create: async ({ data }: { data: unknown }) => data },
      appNotification: {
        create: async ({ data }: { data: unknown }) => data,
        createMany: async ({ data }: { data: unknown }) => ({ count: Array.isArray(data) ? data.length : 0 }),
      },
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => users[where.id] ?? null,
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaFixture),
    };
    auditFixture = {
      append: async (_tx: unknown, entry: Record<string, unknown>) => {
        auditEntries.push(entry);
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [HearingsTestModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    delete process.env.AUTH_TOKEN_SECRET;
    await app.close();
  });

  describe("who may run a hearing", () => {
    it("refuses an unauthenticated status change", async () => {
      await request(app.getHttpServer())
        .patch("/hearings/h-1/status")
        .send({ status: "deliberation" })
        .expect(401);
    });

    it("refuses a party to the case", async () => {
      await request(app.getHttpServer())
        .patch("/hearings/h-1/status")
        .set("authorization", bearer("usr-karim", "citizen"))
        .send({ status: "closed" })
        .expect(403);
    });

    it("refuses an officer adjourning somebody else's hearing", async () => {
      await request(app.getHttpServer())
        .patch("/hearings/h-1/schedule")
        .set("authorization", bearer("usr-officer", "land-office"))
        .send({ hearingDate: "2026-11-05T11:00:00Z" })
        .expect(403);
    });
  });

  describe("the gate", () => {
    it("reserves a ruling after the case has been heard", async () => {
      await request(app.getHttpServer())
        .patch("/hearings/h-1/status")
        .set("authorization", mediator())
        .send({ status: "deliberation" })
        .expect(200);

      expect(hearing.status).toBe("deliberation");
      expect(auditEntries.at(-1)).toMatchObject({ action: "status-change" });
    });

    it("sends a ruling through the ruling endpoint", async () => {
      const response = await request(app.getHttpServer())
        .patch("/hearings/h-1/status")
        .set("authorization", mediator())
        .send({ status: "ruled" })
        .expect(422);

      expect(response.body.reason).toMatchObject({ code: "rule-via-ruling" });
      expect(hearing.status).toBe("in-hearing");
    });

    it("will not call a case heard before a sitting is recorded", async () => {
      hearing.status = "scheduled";
      const response = await request(app.getHttpServer())
        .patch("/hearings/h-1/status")
        .set("authorization", mediator())
        .send({ status: "in-hearing" })
        .expect(422);

      expect(response.body.reason).toMatchObject({ code: "hear-via-session" });
    });

    it("refuses a value outside the union", async () => {
      await request(app.getHttpServer())
        .patch("/hearings/h-1/status")
        .set("authorization", mediator())
        .send({ status: "banana" })
        .expect(400);
    });

    it("closes a case, then refuses everything that follows", async () => {
      await request(app.getHttpServer())
        .patch("/hearings/h-1/status")
        .set("authorization", mediator())
        .send({ status: "closed", note: "Parties settled" })
        .expect(200);

      const moved = await request(app.getHttpServer())
        .patch("/hearings/h-1/status")
        .set("authorization", mediator())
        .send({ status: "deliberation" })
        .expect(422);
      expect(moved.body.reason).toMatchObject({ code: "already-closed" });

      const adjourned = await request(app.getHttpServer())
        .patch("/hearings/h-1/schedule")
        .set("authorization", mediator())
        .send({ hearingDate: "2026-11-05T11:00:00Z" })
        .expect(422);
      expect(adjourned.body.reason).toMatchObject({ code: "already-decided" });
    });
  });

  describe("adjournment", () => {
    it("moves the date", async () => {
      await request(app.getHttpServer())
        .patch("/hearings/h-1/schedule")
        .set("authorization", mediator())
        .send({ hearingDate: "2026-11-05T11:00:00Z", reason: "Respondent did not attend" })
        .expect(200);

      expect(hearing.hearingDate?.toISOString()).toBe("2026-11-05T11:00:00.000Z");
    });

    it("refuses a date it cannot read", async () => {
      const response = await request(app.getHttpServer())
        .patch("/hearings/h-1/schedule")
        .set("authorization", mediator())
        .send({ hearingDate: "not-a-date" })
        .expect(422);

      expect(response.body.reason).toMatchObject({ code: "need-date" });
    });
  });

  describe("reassignment", () => {
    it("hands the case to another mediator", async () => {
      await request(app.getHttpServer())
        .patch("/hearings/h-1/mediator")
        .set("authorization", mediator())
        .send({ mediatorId: "usr-mediator2" })
        .expect(200);

      expect(hearing.mediatorId).toBe("usr-mediator2");
      expect(auditEntries.at(-1)).toMatchObject({ action: "assign" });
    });

    it("will not hand a case to somebody who is not a mediator", async () => {
      await request(app.getHttpServer())
        .patch("/hearings/h-1/mediator")
        .set("authorization", mediator())
        .send({ mediatorId: "usr-officer" })
        .expect(404);
    });

    it("refuses handing it to the mediator who already has it", async () => {
      await request(app.getHttpServer())
        .patch("/hearings/h-1/mediator")
        .set("authorization", mediator())
        .send({ mediatorId: "usr-mediator" })
        .expect(409);
    });
  });
});
