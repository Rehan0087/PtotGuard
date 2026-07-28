/**
 * Decision rules for a namjari (mutation). Pure — the backend enforces the
 * same gate server-side, so this is a shared-package candidate alongside
 * lib/inheritance.ts. The UI uses it to explain a hold, never as the only
 * thing standing between a request and an approval.
 */
import type { Mutation } from "./types";

const DAY_MS = 86_400_000;

/**
 * Why approval is held, as a code plus its numbers — not a sentence. The rule is
 * shared with the backend and the wording is not: the officer-facing string is
 * looked up per locale in the UI (`t.mutations.hold`), so the same gate explains
 * itself in English or Bangla without this module knowing either language.
 */
export type MutationHold =
  | { code: "objections"; count: number }
  | { code: "objection-window"; days: number };

export interface ApprovalGate {
  canApprove: boolean;
  canReject: boolean;
  /** Reason approval is held. null when nothing blocks it. */
  hold: MutationHold | null;
  /** Whole days until the objection window closes; null once it has. */
  daysToWindowClose: number | null;
}

export function approvalGate(mutation: Mutation, now: Date = new Date()): ApprovalGate {
  if (mutation.status === "approved" || mutation.status === "rejected") {
    return { canApprove: false, canReject: false, hold: null, daysToWindowClose: null };
  }

  const endsAt = mutation.objectionWindowEndsAt
    ? new Date(mutation.objectionWindowEndsAt)
    : null;
  const msLeft = endsAt ? endsAt.getTime() - now.getTime() : 0;
  const daysToWindowClose = endsAt && msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : null;

  // A standing objection outranks the clock: it has to be settled before the
  // record moves, even once the window has closed.
  if (mutation.objections.length > 0) {
    return {
      canApprove: false,
      canReject: true,
      hold: { code: "objections", count: mutation.objections.length },
      daysToWindowClose,
    };
  }

  if (daysToWindowClose !== null) {
    return {
      canApprove: false,
      canReject: true,
      hold: { code: "objection-window", days: daysToWindowClose },
      daysToWindowClose,
    };
  }

  return { canApprove: true, canReject: true, hold: null, daysToWindowClose: null };
}
