import { NextResponse } from "next/server";
import { isApiMockingEnabled } from "@/lib/api-mode";
import { DEMO_PASSWORD } from "@/lib/demo-accounts";
import { users } from "@/lib/mocks/data";

const PERSISTENT_API = process.env.API_BACKEND_URL ?? "http://localhost:3001/api";

function invalidCredentials() {
  return NextResponse.json(
    { statusCode: 401, error: "Unauthorized", message: "Invalid email or password" },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!isApiMockingEnabled()) {
    try {
      const response = await fetch(`${PERSISTENT_API}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rawBody,
        cache: "no-store",
      });
      return new NextResponse(response.body, {
        status: response.status,
        headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
      });
    } catch {
      return NextResponse.json(
        {
          statusCode: 503,
          error: "Service Unavailable",
          message: "The authentication service is not running on port 3001.",
        },
        { status: 503 },
      );
    }
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = JSON.parse(rawBody) as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json(
      { statusCode: 400, error: "Bad Request", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const user = users.find((candidate) => candidate.email.toLowerCase() === email);
  if (!user || user.status === "suspended" || body.password !== DEMO_PASSWORD) {
    return invalidCredentials();
  }

  return NextResponse.json({
    user,
    tokens: {
      accessToken: `mock.${user.id}.access`,
      refreshToken: `mock.${user.id}.refresh`,
      expiresIn: 3600,
    },
  });
}
