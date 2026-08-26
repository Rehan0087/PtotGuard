/**
 * Whether — and how — a mediator's ruling may be executed against the
 * parcel record it concerns.
 *
 * A ruling closes the dispute, but closing a dispute is not the same as
 * updating the register: the land office still has to read the ruling and
 * decide what it actually does to the record — nothing (dismissed / record
 * stands), a new encumbrance (an injunction, an acquisition notice), the
 * lifting of one, or a signal that the rightful owner now needs to file a
 * Mutation. This module is the gate on that last, missing step — pure, like
 * every rule here, so the officer's screen and the endpoint that writes the
 * parcel agree on when it's allowed.
 *
 * Deliberately does not touch `Parcel.ownerId` under any outcome. Ownership
 * transfer already has one real, tested channel — Mutation — with its own
 * objection window and officer decision. A ruling that requires a transfer
 * is executed by unblocking that channel (`referred-to-mutation`), not by
 * duplicating it here with a weaker, dispute-shaped copy.
 */
import type { Dispute, RestrictionType } from "./types";

export type RulingOutcome =
  | { action: "no-change" }
  | {
      action: "restriction-added";
      restrictionType: RestrictionType;
      authority: string;
      note?: string;
    }
  | { action: "restriction-removed"; restrictionId: string }
  | { action: "referred-to-mutation" };

export type ExecutionBlocker =
  | { code: "not-resolved" }
  | { code: "already-executed" }
  | { code: "need-outcome" }
  | { code: "need-restriction-type" }
  | { code: "need-authority" }
  | { code: "need-restriction-id" }
  | { code: "restriction-not-found" };

export interface ExecutionReview {
  canExecute: boolean;
  blockers: ExecutionBlocker[];
}

/**
 * @param dispute Only `status` and `recordsExecutedAt` matter here.
 * @param outcome The officer's in-progress selection — undefined while
 *   nothing is picked yet, so the screen can react before a request is sent.
 * @param activeRestrictionIds Ids of restrictions currently in force on the
 *   dispute's parcel, so `restriction-removed` can't target one that has
 *   already lapsed or belongs to a different plot.
 */
export function executionGate(
  dispute: Pick<Dispute, "status"> & { recordsExecutedAt?: string | null },
  outcome: RulingOutcome | undefined,
  activeRestrictionIds: string[],
): ExecutionReview {
  const blockers: ExecutionBlocker[] = [];

  // Mirrors rulingGate()'s own "already-decided" shape: a case not yet
  // resolved has no ruling to execute, and one already executed does not
  // take a second bite at the record.
  if (dispute.status !== "resolved") blockers.push({ code: "not-resolved" });
  if (dispute.recordsExecutedAt) blockers.push({ code: "already-executed" });

  if (!outcome) {
    blockers.push({ code: "need-outcome" });
  } else if (outcome.action === "restriction-added") {
    if (!outcome.restrictionType) blockers.push({ code: "need-restriction-type" });
    if (!outcome.authority.trim()) blockers.push({ code: "need-authority" });
  } else if (outcome.action === "restriction-removed") {
    if (!outcome.restrictionId) {
      blockers.push({ code: "need-restriction-id" });
    } else if (!activeRestrictionIds.includes(outcome.restrictionId)) {
      blockers.push({ code: "restriction-not-found" });
    }
  }

  return { canExecute: blockers.length === 0, blockers };
}

/**
 * The `RegistryStatus` an outcome leaves the parcel in, once applied.
 *
 * `restriction-removed` is the one case that depends on more than the
 * outcome itself — lifting one restriction only clears the flag if no
 * other active one remains, so the caller passes what's left.
 */
export function registryStatusAfter(
  outcome: RulingOutcome,
  remainingActiveRestrictionCount: number,
): "verified" | "flagged" | "under-mutation" {
  switch (outcome.action) {
    case "no-change":
      return "verified";
    case "restriction-added":
      return "flagged";
    case "restriction-removed":
      return remainingActiveRestrictionCount > 0 ? "flagged" : "verified";
    case "referred-to-mutation":
      return "under-mutation";
  }
}
