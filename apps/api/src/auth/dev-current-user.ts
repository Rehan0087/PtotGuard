import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { AuthTokens, Role } from "@plotguard/rules";

export interface AuthTokenPayload {
  sub: string;
  role: Role;
  type: "access" | "refresh";
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: Role };
}

const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 7;

function tokenSecret(): string {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret) throw new Error("AUTH_TOKEN_SECRET is required");
  return secret;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(encodedHeader: string, encodedPayload: string): string {
  return createHmac("sha256", tokenSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
}

function issueToken(
  subject: { id: string; role: Role },
  type: AuthTokenPayload["type"],
  lifetimeSeconds: number,
  now: Date,
): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: subject.id,
    role: subject.role,
    type,
    iat,
    exp: iat + lifetimeSeconds,
  } satisfies AuthTokenPayload);
  return `${header}.${payload}.${sign(header, payload)}`;
}

export function issueAuthTokens(
  subject: { id: string; role: Role },
  now = new Date(),
): AuthTokens {
  return {
    accessToken: issueToken(subject, "access", ACCESS_TOKEN_SECONDS, now),
    refreshToken: issueToken(subject, "refresh", REFRESH_TOKEN_SECONDS, now),
    expiresIn: ACCESS_TOKEN_SECONDS,
  };
}

export function verifyAuthToken(
  token: string,
  expectedType: AuthTokenPayload["type"],
  now = new Date(),
): AuthTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");
  const [header, payload, signature] = parts;
  const expectedSignature = sign(header, payload);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw new Error("Invalid token signature");
  }

  let parsed: AuthTokenPayload;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid token payload");
  }
  if (parsed.type !== expectedType) throw new Error("Invalid token type");
  if (!parsed.sub || !parsed.role || !parsed.exp) throw new Error("Invalid token payload");
  if (parsed.exp <= Math.floor(now.getTime() / 1000)) throw new Error("Token expired");
  return parsed;
}

export function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash) return false;
  const [algorithm, saltHex, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !expectedHex) return false;
  try {
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Compatibility identities for older, unguarded portal endpoints. */
export const CURRENT_USER_BY_ROLE: Record<string, string> = {
  citizen: "usr-ayesha",
  "land-office": "usr-officer",
  "field-agent": "usr-agent",
  mediator: "usr-mediator",
  admin: "usr-admin",
};

export function currentUserId(req: Request): string {
  // Protected endpoints always arrive here with a verified token identity.
  const authenticated = (req as AuthenticatedRequest).user;
  if (authenticated) return authenticated.id;
  const role = req.header("x-plotguard-role") ?? "citizen";
  return CURRENT_USER_BY_ROLE[role] ?? CURRENT_USER_BY_ROLE.citizen;
}
