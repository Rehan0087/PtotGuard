import { getAccessToken, useSessionStore } from "@/store/session";

/**
 * The single choke point for all data fetching. It uses the same-origin /api
 * proxy; production and local demo traffic goes to the NestJS
 * backend by default. Set NEXT_PUBLIC_API_MOCKING=enabled only when working
 * with the in-browser fixture API.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

/** Mocking is deliberately opt-in: persistence must not silently be bypassed. */
export const API_MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /**
     * The refusal as the rule stated it — a structured code plus its numbers,
     * not a sentence. Present when the server refused on a domain rule, so the
     * client can word it in the reader's language; `message` is the English
     * fallback for logs and codes the client doesn't recognise.
     */
    public reason?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let code = "error";
    let message = res.statusText;
    let reason: unknown;
    try {
      const body = await res.json();
      code = body.error ?? code;
      message = body.message ?? message;
      reason = body.reason;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && accessToken) useSessionStore.getState().logout();
    throw new ApiError(res.status, code, message, reason);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  postIdempotent: <T>(path: string, idempotencyKey: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      headers: { "idempotency-key": idempotencyKey },
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Build a querystring from a params object, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
