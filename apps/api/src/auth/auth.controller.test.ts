import { Module, ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthController } from "./auth.controller";
import { PrismaService } from "../prisma/prisma.service";
import { configureBodyParser } from "../common/configure-body-parser";

const passwordHash =
  "scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede";

const fieldAgent = {
  id: "usr-agent",
  name: "Abdul Karim",
  email: "agent@plotguard.bd",
  phone: null,
  role: "field-agent",
  jurisdictionId: "j-rajamehar",
  nationalId: null,
  avatarUrl: null,
  profileDetails: { employeeCode: "FA-1042" },
  status: "active",
  title: "Survey Officer",
  passwordHash,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

let prismaFixture: Record<string, unknown>;
let lastUserUpdate: Record<string, unknown> | undefined;

@Module({
  controllers: [AuthController],
  providers: [{ provide: PrismaService, useFactory: () => prismaFixture }],
})
class AuthTestModule {}

describe("AuthController", () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-that-is-long-enough";
    lastUserUpdate = undefined;
    prismaFixture = {
      user: {
        findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.email === "used@plotguard.bd") {
            return { ...fieldAgent, id: "usr-other", email: where.email };
          }
          return where.email === fieldAgent.email || where.id === fieldAgent.id ? fieldAgent : null;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          if (data.email === "race@plotguard.bd") {
            throw { code: "P2002", meta: { target: ["email"] } };
          }
          lastUserUpdate = data;
          return { ...fieldAgent, ...data };
        },
      },
      jurisdiction: {
        findUnique: async () => ({
          id: "j-rajamehar",
          code: "CTG-CUM-DEB-RAJ",
          name: "Rajamehar Mouza",
          level: "mouza",
          parentId: "j-debidwar",
        }),
      },
    };

    const testingModule = await Test.createTestingModule({ imports: [AuthTestModule] }).compile();
    app = testingModule.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureBodyParser(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    delete process.env.AUTH_TOKEN_SECRET;
    await app.close();
  });

  it("authenticates an active field agent and returns signed tokens", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "demo1234" })
      .expect(200);

    expect(response.body.user).toMatchObject({
      id: "usr-agent",
      role: "field-agent",
    });
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.tokens).toMatchObject({ expiresIn: 3600 });
    expect(response.body.tokens.accessToken.split(".")).toHaveLength(3);
  });

  it("rejects an incorrect password", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "wrong" })
      .expect(401);
  });

  it("rejects an unauthenticated session lookup", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);
  });

  it("returns the signed-in user for a valid access token", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "demo1234" });

    const response = await request(app.getHttpServer())
      .get("/auth/me")
      .set("authorization", `Bearer ${login.body.tokens.accessToken}`)
      .expect(200);

    expect(response.body.user.id).toBe("usr-agent");
  });

  it("updates only the signed-in user's editable profile fields and preserves managed details", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "demo1234" });

    const response = await request(app.getHttpServer())
      .patch("/auth/me")
      .set("authorization", `Bearer ${login.body.tokens.accessToken}`)
      .send({
        name: "  Md. Abdul Karim  ",
        email: "  KARIM@PLOTGUARD.BD ",
        phone: "+8801711000000",
        avatarUrl: "https://example.bd/karim.jpg",
        currentAddress: "Debidwar, Cumilla",
        emergencyContact: "+8801811000000",
      })
      .expect(200);

    expect(lastUserUpdate).toEqual({
      name: "Md. Abdul Karim",
      email: "karim@plotguard.bd",
      phone: "+8801711000000",
      avatarUrl: "https://example.bd/karim.jpg",
      profileDetails: {
        employeeCode: "FA-1042",
        currentAddress: "Debidwar, Cumilla",
        emergencyContact: "+8801811000000",
      },
    });
    expect(response.body.role).toBe("field-agent");
  });

  it("accepts a supported local profile photo and rejects unsafe or oversized image data", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "demo1234" });
    const avatarUrl = "data:image/webp;base64,UklGRg==";

    await request(app.getHttpServer())
      .patch("/auth/me")
      .set("authorization", `Bearer ${login.body.tokens.accessToken}`)
      .send({ avatarUrl })
      .expect(200);
    expect(lastUserUpdate).toMatchObject({ avatarUrl });

    lastUserUpdate = undefined;
    await request(app.getHttpServer())
      .patch("/auth/me")
      .set("authorization", `Bearer ${login.body.tokens.accessToken}`)
      .send({ avatarUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" })
      .expect(400);
    expect(lastUserUpdate).toBeUndefined();

    const oversized = Buffer.alloc(512 * 1024 + 1).toString("base64");
    await request(app.getHttpServer())
      .patch("/auth/me")
      .set("authorization", `Bearer ${login.body.tokens.accessToken}`)
      .send({ avatarUrl: `data:image/jpeg;base64,${oversized}` })
      .expect(400);
    expect(lastUserUpdate).toBeUndefined();
  });

  it("accepts a profile photo at the documented 512 KB limit", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "demo1234" });
    const encoded = Buffer.alloc(512 * 1024).toString("base64");

    await request(app.getHttpServer())
      .patch("/auth/me")
      .set("authorization", `Bearer ${login.body.tokens.accessToken}`)
      .send({ avatarUrl: `data:image/jpeg;base64,${encoded}` })
      .expect(200);
  });

  it("rejects role and employment-controlled fields on self-service updates", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "demo1234" });

    await request(app.getHttpServer())
      .patch("/auth/me")
      .set("authorization", `Bearer ${login.body.tokens.accessToken}`)
      .send({ role: "admin", title: "Administrator", jurisdictionId: "j-cumilla" })
      .expect(400);

    expect(lastUserUpdate).toBeUndefined();
  });

  it("prevents a field agent from rewriting managed profile details directly", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "demo1234" });

    await request(app.getHttpServer())
      .patch("/auth/me")
      .set("authorization", `Bearer ${login.body.tokens.accessToken}`)
      .send({ profileDetails: { employeeCode: "ADMIN" } })
      .expect(400);

    expect(lastUserUpdate).toBeUndefined();
  });

  it("returns a conflict instead of assigning an email used by another account", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "demo1234" });

    await request(app.getHttpServer())
      .patch("/auth/me")
      .set("authorization", `Bearer ${login.body.tokens.accessToken}`)
      .send({ email: "used@plotguard.bd" })
      .expect(409);

    expect(lastUserUpdate).toBeUndefined();
  });

  it("maps a concurrent unique-email race to a conflict", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "demo1234" });

    await request(app.getHttpServer())
      .patch("/auth/me")
      .set("authorization", `Bearer ${login.body.tokens.accessToken}`)
      .send({ email: "race@plotguard.bd" })
      .expect(409);
  });

  it("rejects unauthenticated profile updates", async () => {
    await request(app.getHttpServer()).patch("/auth/me").send({ name: "Intruder" }).expect(401);
  });

  it("rejects an expired access token", async () => {
    const expired = Buffer.from(
      JSON.stringify({ sub: "usr-agent", role: "field-agent", type: "access", exp: 1 }),
    ).toString("base64url");

    await request(app.getHttpServer())
      .get("/auth/me")
      .set("authorization", `Bearer x.${expired}.invalid`)
      .expect(401);
  });

  it("accepts a valid refresh token and rejects an access token at that endpoint", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fieldAgent.email, password: "demo1234" });

    const refreshed = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.tokens.refreshToken })
      .expect(200);
    expect(refreshed.body).toMatchObject({ expiresIn: 3600 });
    expect(refreshed.body.accessToken).toBeTruthy();

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.tokens.accessToken })
      .expect(401);
  });
});
