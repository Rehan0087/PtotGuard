import { INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthController } from "./auth.controller";
import { PrismaService } from "../prisma/prisma.service";

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
  profileDetails: null,
  status: "active",
  title: "Survey Officer",
  passwordHash,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

let prismaFixture: Record<string, unknown>;

@Module({
  controllers: [AuthController],
  providers: [{ provide: PrismaService, useFactory: () => prismaFixture }],
})
class AuthTestModule {}

describe("AuthController", () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-that-is-long-enough";
    prismaFixture = {
      user: {
        findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
          where.email === fieldAgent.email || where.id === fieldAgent.id ? fieldAgent : null,
        update: async () => fieldAgent,
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

    const module = await Test.createTestingModule({ imports: [AuthTestModule] }).compile();
    app = module.createNestApplication();
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
