import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as auth from "./dev-current-user";

const user = { id: "usr-agent", role: "field-agent" };

describe("authentication tokens", () => {
  beforeEach(() => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-that-is-long-enough";
  });

  afterEach(() => {
    delete process.env.AUTH_TOKEN_SECRET;
  });

  const issue = () =>
    (auth as typeof auth & {
      issueAuthTokens: (
        subject: typeof user,
        now?: Date,
      ) => { accessToken: string; refreshToken: string; expiresIn: number };
    }).issueAuthTokens;

  const verify = () =>
    (auth as typeof auth & {
      verifyAuthToken: (
        token: string,
        type: "access" | "refresh",
        now?: Date,
      ) => { sub: string; role: string };
    }).verifyAuthToken;

  it("issues an access token that authenticates the field agent", () => {
    const tokens = issue()(user, new Date("2026-09-12T00:00:00Z"));

    expect(verify()(tokens.accessToken, "access", new Date("2026-09-12T00:30:00Z"))).toMatchObject({
      sub: "usr-agent",
      role: "field-agent",
    });
    expect(tokens.expiresIn).toBe(3600);
  });

  it("rejects an expired access token", () => {
    const tokens = issue()(user, new Date("2026-09-12T00:00:00Z"));

    expect(() =>
      verify()(tokens.accessToken, "access", new Date("2026-09-12T01:00:01Z")),
    ).toThrow("expired");
  });

  it("rejects a refresh token at an access-token boundary", () => {
    const tokens = issue()(user, new Date("2026-09-12T00:00:00Z"));

    expect(() =>
      verify()(tokens.refreshToken, "access", new Date("2026-09-12T00:30:00Z")),
    ).toThrow("type");
  });

  it("rejects a token whose payload was altered", () => {
    const tokens = issue()(user, new Date("2026-09-12T00:00:00Z"));
    const [header, payload, signature] = tokens.accessToken.split(".");
    const changedPayload = Buffer.from(
      JSON.stringify({ sub: "usr-admin", role: "admin", type: "access", exp: 9999999999 }),
    ).toString("base64url");

    expect(() => verify()(`${header}.${changedPayload}.${signature}`, "access")).toThrow(
      "signature",
    );
    expect(payload).not.toBe(changedPayload);
  });
});

describe("password verification", () => {
  const verifyPassword = () =>
    (auth as typeof auth & {
      verifyPassword: (password: string, storedHash: string | null | undefined) => boolean;
    }).verifyPassword;

  const stored =
    "scrypt$00112233445566778899aabbccddeeff$f2d31dd4461c5a6fe9b09ec97830ac3071d4314ded688bad919900cc7f645f15f70fa942dccd598209270ae8510abe83c4e54a92b58d420f216cc9c7cefcbede";

  it("accepts the password represented by the stored scrypt hash", () => {
    expect(verifyPassword()("demo1234", stored)).toBe(true);
  });

  it("rejects a wrong password and a user with no password", () => {
    expect(verifyPassword()("wrong", stored)).toBe(false);
    expect(verifyPassword()("demo1234", null)).toBe(false);
  });
});
