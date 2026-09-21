import { INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { issueAuthTokens } from "../auth/dev-current-user";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { UsersController } from "./users.controller";

type UserFixture = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  jurisdictionId: string;
  title: string | null;
  passwordHash: string | null;
  createdAt: Date;
};

let prismaFixture: Record<string, unknown>;
let auditFixture: Record<string, unknown>;

@Module({
  controllers: [UsersController],
  providers: [
    AccessTokenGuard,
    RolesGuard,
    { provide: PrismaService, useFactory: () => prismaFixture },
    { provide: AuditService, useFactory: () => auditFixture },
  ],
})
class UsersTestModule {}

function bearer(id: string, role: "admin" | "citizen" | "mediator") {
  return `Bearer ${issueAuthTokens({ id, role }).accessToken}`;
}

describe("account administration", () => {
  let app: INestApplication;
  let users: UserFixture[];
  let auditEntries: Array<Record<string, unknown>>;
  let notifications: Array<Record<string, unknown>>;

  const admin = (): UserFixture => users[0];
  const citizen = (): UserFixture => users[1];
  const invitee = (): UserFixture => users[2];

  beforeEach(async () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-that-is-long-enough";
    users = [
      {
        id: "usr-admin", name: "Registry Administrator", email: "admin@plotguard.gov.bd",
        role: "admin", status: "active", jurisdictionId: "j-cumilla", title: null,
        passwordHash: "scrypt$00$00", createdAt: new Date("2020-01-01T00:00:00Z"),
      },
      {
        id: "usr-ayesha", name: "Ayesha Siddika", email: "ayesha@example.bd",
        role: "citizen", status: "active", jurisdictionId: "j-rajamehar", title: null,
        passwordHash: "scrypt$00$00", createdAt: new Date("2024-02-11T00:00:00Z"),
      },
      {
        id: "usr-legacy", name: "Abdul Jalil Sarkar", email: "legacy@example.bd",
        role: "citizen", status: "invited", jurisdictionId: "j-rajamehar", title: null,
        passwordHash: null, createdAt: new Date("1998-03-01T00:00:00Z"),
      },
    ];
    auditEntries = [];
    notifications = [];

    const user = {
      findMany: async ({ where }: { where?: { role?: string } } = {}) =>
        where?.role ? users.filter((u) => u.role === where.role) : users,
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      create: async ({ data }: { data: UserFixture }) => {
        users.push(data);
        return data;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserFixture> }) => {
        const index = users.findIndex((u) => u.id === where.id);
        users[index] = { ...users[index], ...data };
        return users[index];
      },
    };

    prismaFixture = {
      user,
      jurisdiction: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === "j-cumilla" || where.id === "j-rajamehar" ? { id: where.id } : null,
      },
      appNotification: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          notifications.push(data);
          return data;
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaFixture),
    };
    auditFixture = {
      append: async (_tx: unknown, entry: Record<string, unknown>) => {
        auditEntries.push(entry);
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [UsersTestModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    delete process.env.AUTH_TOKEN_SECRET;
    await app.close();
  });

  const invitation = {
    name: "Rokeya Sultana",
    email: "r.sultana@minland.gov.bd",
    role: "field-agent",
    jurisdictionId: "j-cumilla",
  };

  describe("who may write", () => {
    it("refuses an unauthenticated invitation", async () => {
      await request(app.getHttpServer()).post("/users").send(invitation).expect(401);
    });

    it("refuses an invitation from a citizen", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("authorization", bearer("usr-ayesha", "citizen"))
        .send(invitation)
        .expect(403);
    });

    it("refuses an unauthenticated password reset", async () => {
      await request(app.getHttpServer()).post("/users/usr-ayesha/password-reset").expect(401);
    });

    it("refuses a password reset from a citizen", async () => {
      await request(app.getHttpServer())
        .post("/users/usr-ayesha/password-reset")
        .set("authorization", bearer("usr-ayesha", "citizen"))
        .expect(403);
    });

    it("refuses a suspension from a citizen", async () => {
      await request(app.getHttpServer())
        .patch("/users/usr-legacy")
        .set("authorization", bearer("usr-ayesha", "citizen"))
        .send({ status: "suspended" })
        .expect(403);
    });

    it("leaves the reads other portals depend on open", async () => {
      // A mediator lists mediators to hand a case over; a citizen searches
      // for a transfer recipient. Guarding the controller would break both.
      await request(app.getHttpServer()).get("/users?role=citizen").expect(200);
      await request(app.getHttpServer()).get("/users/search?q=ayesha").expect(200);
    });
  });

  describe("inviting", () => {
    it("creates the account as invited and returns the password once", async () => {
      const response = await request(app.getHttpServer())
        .post("/users")
        .set("authorization", bearer("usr-admin", "admin"))
        .send(invitation)
        .expect(201);

      expect(response.body.user.status).toBe("invited");
      expect(response.body.user.role).toBe("field-agent");
      expect(response.body.temporaryPassword).toBeTruthy();
      // The hash is the only copy that persists, and it never leaves the server.
      expect(response.body.user.passwordHash).toBeUndefined();
      expect(users).toHaveLength(4);
    });

    it("records the administrator, not the dev-header fallback", async () => {
      // currentUserId() falls back to x-plotguard-role and defaults to citizen.
      // Unguarded, this write was logged against whoever that resolved to.
      await request(app.getHttpServer())
        .post("/users")
        .set("authorization", bearer("usr-admin", "admin"))
        .send(invitation)
        .expect(201);

      expect(auditEntries.at(-1)).toMatchObject({ entityType: "user", actorId: "usr-admin" });
    });

    it("refuses an email already in use", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("authorization", bearer("usr-admin", "admin"))
        .send({ ...invitation, email: citizen().email })
        .expect(409);
    });

    it("refuses a jurisdiction that does not exist", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("authorization", bearer("usr-admin", "admin"))
        .send({ ...invitation, jurisdictionId: "j-nowhere" })
        .expect(404);
    });

    it("refuses something that is not an email", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("authorization", bearer("usr-admin", "admin"))
        .send({ ...invitation, email: "not-an-email" })
        .expect(400);
    });
  });

  describe("the gates", () => {
    it("refuses an administrator changing their own role", async () => {
      const response = await request(app.getHttpServer())
        .patch("/users/usr-admin")
        .set("authorization", bearer("usr-admin", "admin"))
        .send({ role: "citizen" })
        .expect(422);

      expect(response.body.reason).toMatchObject({ code: "self-role-change" });
      expect(admin().role).toBe("admin");
    });

    it("refuses a role change that changes nothing", async () => {
      const response = await request(app.getHttpServer())
        .patch("/users/usr-ayesha")
        .set("authorization", bearer("usr-admin", "admin"))
        .send({ role: "citizen" })
        .expect(422);

      expect(response.body.reason).toMatchObject({ code: "same-role" });
    });

    it("promotes somebody else", async () => {
      await request(app.getHttpServer())
        .patch("/users/usr-ayesha")
        .set("authorization", bearer("usr-admin", "admin"))
        .send({ role: "field-agent" })
        .expect(200);

      expect(citizen().role).toBe("field-agent");
    });

    it("refuses resetting an invitation nobody has used", async () => {
      const response = await request(app.getHttpServer())
        .post("/users/usr-legacy/password-reset")
        .set("authorization", bearer("usr-admin", "admin"))
        .expect(422);

      expect(response.body.reason).toMatchObject({ code: "never-signed-in" });
      expect(invitee().passwordHash).toBeNull();
    });

    it("resets a real account, tells its owner, and keeps the password off the ledger", async () => {
      const response = await request(app.getHttpServer())
        .post("/users/usr-ayesha/password-reset")
        .set("authorization", bearer("usr-admin", "admin"))
        .expect(200);

      expect(response.body.temporaryPassword).toBeTruthy();
      expect(citizen().passwordHash).not.toBe("scrypt$00$00");
      expect(notifications.at(-1)).toMatchObject({ userId: "usr-ayesha" });
      expect(JSON.stringify(auditEntries)).not.toContain(response.body.temporaryPassword);
    });
  });
});
