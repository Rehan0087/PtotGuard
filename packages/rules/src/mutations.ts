/**
 * Decision rules for a namjari (mutation). Pure — the backend enforces the
 * same gate server-side, so this is a shared-package candidate alongside
 * lib/inheritance.ts. The UI uses it to explain a hold, never as the only
 * thing standing between a request and an approval.
 */
import type { AcquisitionType, Mutation, MutationType } from "./types";

const DAY_MS = 86_400_000;

/**
 * What an approved mutation actually did to the chain of title, in
 * `OwnershipRecord.acquisitionType` terms. A correction isn't a transfer —
 * the land didn't change hands, the record naming who held it was wrong —
 * but the type still needs a value, so it gets one of its own rather than
 * being forced into "purchase" or another acquisition that didn't happen.
 */
export const ACQUISITION_TYPE_BY_MUTATION_TYPE: Record<MutationType, AcquisitionType> = {
  sale: "purchase",
  inheritance: "inheritance",
  gift: "gift",
  partition: "partition",
  correction: "correction",
};

/**
 * Why approval is held, as a code plus its numbers — not a sentence. The rule is
 * shared with the backend and the wording is not: the officer-facing string is
 * looked up per locale in the UI (`t.mutations.hold`), so the same gate explains
 * itself in English or Bangla without this module knowing either language.
 */
export type MutationHold =
  | { code: "objections"; count: number }
  | { code: "objection-window"; days: number }
  /** A handful of pre-existing rows predate requiring a linked recipient —
   * see Mutation.toOwnerId's own note. Nothing to key in fixes this from
   * here; it can still be rejected, just never approved. */
  | { code: "no-recipient" };

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

  if (!mutation.toOwnerId) {
    return {
      canApprove: false,
      canReject: true,
      hold: { code: "no-recipient" },
      daysToWindowClose: null,
    };
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
