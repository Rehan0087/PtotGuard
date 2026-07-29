import { Controller, ForbiddenException, Get, Logger, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "./domain-exceptions";
import { HttpExceptionFilter } from "./http-exception.filter";

/**
 * Every way an error can leave the app, exercised through a real HTTP round
 * trip. These are contract tests: the assertions are the shapes MSW already
 * returns (`lib/mocks/handlers.ts` — `notFound`, `unprocessable`, `conflict`)
 * and the web client already parses (`lib/api-client.ts`). If the two drift,
 * refusals stop being explainable in the UI and degrade to "something went
 * wrong", so the shapes are pinned rather than assumed.
 */
@Controller("boom")
class BoomController {
  @Get("not-found")
  notFound(): never {
    throw new NotFoundError("Dispute not found");
  }

  @Get("unheard")
  unheard(): never {
    // The exact blocker `rulingGate` returns when a party has not attended.
    throw new ValidationError({ code: "unheard", parties: ["Upazila Land Office"] }, "ruling");
  }

  @Get("no-field")
  noField(): never {
    throw new ValidationError({ code: "already-decided" });
  }

  @Get("in-use")
  inUse(): never {
    throw new ConflictError("Still in use: children.", [
      { code: "children", count: 2, childLevel: "mouza" },
    ]);
  }

  @Get("forbidden")
  forbidden(): never {
    // Thrown by Nest itself, not by us — it must still leave in our envelope.
    throw new ForbiddenException();
  }

  @Get("crash")
  crash(): never {
    throw new Error("secret internal detail");
  }
}

@Module({
  controllers: [BoomController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
class BoomModule {}

describe("error envelope", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // The crash test logs a stack on purpose; keep the run readable.
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ imports: [BoomModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it("returns a not-found in the shape the mock returns", async () => {
    const res = await request(app.getHttpServer()).get("/boom/not-found").expect(404);

    expect(res.body).toEqual({ error: "not_found", message: "Dispute not found" });
  });

  it("carries a rule's refusal through untouched", async () => {
    // The codes, and the names the sentence needs — never the sentence. This is
    // what lets the client word it in English or Bangla.
    const res = await request(app.getHttpServer()).get("/boom/unheard").expect(422);

    expect(res.body).toEqual({
      error: "validation_failed",
      field: "ruling",
      reason: { code: "unheard", parties: ["Upazila Land Office"] },
      message: "Validation failed: unheard",
    });
  });

  it("omits the field when the rule does not name one", async () => {
    const res = await request(app.getHttpServer()).get("/boom/no-field").expect(422);

    expect(res.body).toEqual({
      error: "validation_failed",
      reason: { code: "already-decided" },
      message: "Validation failed: already-decided",
    });
    expect(res.body).not.toHaveProperty("field");
  });

  it("returns a referential refusal as a conflict, with its blockers", async () => {
    const res = await request(app.getHttpServer()).get("/boom/in-use").expect(409);

    expect(res.body).toEqual({
      error: "conflict",
      message: "Still in use: children.",
      reason: [{ code: "children", count: 2, childLevel: "mouza" }],
    });
  });

  it("puts Nest's own exceptions in the same envelope", async () => {
    // Otherwise a guard's rejection arrives in a shape the client cannot read.
    const res = await request(app.getHttpServer()).get("/boom/forbidden").expect(403);

    expect(res.body).toEqual({ error: "forbidden", message: "Forbidden" });
  });

  it("puts an unrouted path in the same envelope", async () => {
    const res = await request(app.getHttpServer()).get("/boom/nope").expect(404);

    expect(res.body.error).toBe("not_found");
    expect(typeof res.body.message).toBe("string");
  });

  it("tells the client nothing about an unexpected crash", async () => {
    const res = await request(app.getHttpServer()).get("/boom/crash").expect(500);

    expect(res.body).toEqual({ error: "internal_error", message: "Something went wrong." });
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
  });

  it("always answers with error and message, whatever went wrong", async () => {
    // The client reads these two on every failure path; nothing may omit them.
    const paths = ["/boom/not-found", "/boom/unheard", "/boom/in-use", "/boom/crash", "/boom/x"];

    for (const path of paths) {
      const res = await request(app.getHttpServer()).get(path);
      expect(typeof res.body.error, path).toBe("string");
      expect(typeof res.body.message, path).toBe("string");
    }
  });
});
