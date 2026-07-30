import type { Request } from "express";

/**
 * ponytail: stand-in for real auth (Phase 4 — JWT). Mirrors the mock's
 * `currentUser()`: the `x-plotguard-role` header picks a fixed demo user per
 * role, same ids the frontend already seeds against. Upgrade path: read the
 * user id out of a verified bearer token instead of this header.
 */
export const CURRENT_USER_BY_ROLE: Record<string, string> = {
  citizen: "usr-ayesha",
  "land-office": "usr-officer",
  "field-agent": "usr-agent",
  mediator: "usr-mediator",
  admin: "usr-admin",
};

export function currentUserId(req: Request): string {
  const role = req.header("x-plotguard-role") ?? "citizen";
  return CURRENT_USER_BY_ROLE[role] ?? CURRENT_USER_BY_ROLE.citizen;
}
