/**
 * What an administrator may do to somebody's account.
 *
 * Account governance is the one place where the person acting and the person
 * acted upon can be the same, so the gates here are about that relationship
 * rather than about a record's state. Suspension already refuses self —
 * inside the endpoint, since it predates this module — and role change
 * refuses it for the same reason: an administrator who can demote themselves
 * can lock the registry out of its own administration with one click, and no
 * remaining account could undo it.
 */
import type { Role, UserStatus } from "./types";

export type RoleChangeBlocker =
  | { code: "self-role-change" }
  | { code: "same-role"; role: Role };

export interface RoleChangeReview {
  canChange: boolean;
  blockers: RoleChangeBlocker[];
}

/**
 * @param actorId Who is making the change.
 * @param target The account being changed — only `id` and `role` matter.
 * @param to The role being asked for.
 */
export function roleChangeGate(
  actorId: string,
  target: { id: string; role: Role },
  to: Role,
): RoleChangeReview {
  const blockers: RoleChangeBlocker[] = [];
  if (target.id === actorId) blockers.push({ code: "self-role-change" });
  if (target.role === to) blockers.push({ code: "same-role", role: to });
  return { canChange: blockers.length === 0, blockers };
}

export type PasswordResetBlocker = { code: "never-signed-in"; status: UserStatus };

export interface PasswordResetReview {
  canReset: boolean;
  blockers: PasswordResetBlocker[];
}

/**
 * An invited account has no password to reset — it has an invitation that was
 * never taken up. Handing it a second temporary password would leave two
 * live credentials for an account nobody has ever used; the invitation gets
 * reissued instead.
 */
export function passwordResetGate(target: { status: UserStatus }): PasswordResetReview {
  const blockers: PasswordResetBlocker[] =
    target.status === "invited" ? [{ code: "never-signed-in", status: target.status }] : [];
  return { canReset: blockers.length === 0, blockers };
}
