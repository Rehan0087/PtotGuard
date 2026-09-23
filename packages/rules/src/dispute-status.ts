/**
 * Which status a dispute may move to next, and through which channel.
 *
 * The new pipeline is strictly linear — no skipping stages:
 *   submitted → under-land-office-review → field-verified
 *   → forwarded-to-settlement → hearing-scheduled → decided
 *
 * Two statuses are special-channel only:
 * - `hearing-scheduled` is stamped by POST /hearings (also assigns the
 *   mediator and creates the hearing row).
 * - `decided` is stamped by PATCH /hearings/:id/ruling (also records the
 *   resolution text and decision notes).
 *
 * Escape hatches `rejected` and `withdrawn` are available from every
 * non-terminal status.
 *
 * Pure like every rule here: the Land Office and Settlement Office screens
 * offer exactly the moves the endpoint will accept, because both ask this
 * function.
 */
import type { DisputeStatus } from "./types";

/** A dispute in one of these is finished; nothing moves it again. */
export const DISPUTE_CLOSED_STATUSES: DisputeStatus[] = ["decided", "rejected", "withdrawn"];

/**
 * What a plain status write may do. `hearing-scheduled` and `decided` are
 * deliberately absent from every list — see `schedule-via-hearing` and
 * `decide-via-ruling`. The pipeline is strictly ordered; Land Office
 * cannot forward to Settlement directly without field verification first.
 */
const ALLOWED: Record<DisputeStatus, DisputeStatus[]> = {
  submitted: ["under-land-office-review", "rejected", "withdrawn"],
  "under-land-office-review": ["field-verified", "rejected", "withdrawn"],
  "field-verified": ["forwarded-to-settlement", "rejected", "withdrawn"],
  "forwarded-to-settlement": ["rejected", "withdrawn"],
  "hearing-scheduled": ["rejected", "withdrawn"],
  decided: [],
  rejected: [],
  withdrawn: [],
};

export type DisputeTransitionBlocker =
  | { code: "already-closed"; status: DisputeStatus }
  | { code: "same-status"; status: DisputeStatus }
  | { code: "schedule-via-hearing" }
  | { code: "decide-via-ruling" }
  | { code: "illegal-transition"; from: DisputeStatus; to: DisputeStatus };

export interface DisputeTransitionReview {
  canChange: boolean;
  blockers: DisputeTransitionBlocker[];
}

/**
 * @param from The dispute's current status.
 * @param to The status being asked for.
 */
export function disputeTransition(
  from: DisputeStatus,
  to: DisputeStatus,
): DisputeTransitionReview {
  // A closed case is closed whatever the target — one blocker, not a pile
  // of them, so the screen has one sentence to show.
  if (DISPUTE_CLOSED_STATUSES.includes(from)) {
    return { canChange: false, blockers: [{ code: "already-closed", status: from }] };
  }

  const blockers: DisputeTransitionBlocker[] = [];
  if (to === from) blockers.push({ code: "same-status", status: from });
  else if (to === "hearing-scheduled") blockers.push({ code: "schedule-via-hearing" });
  else if (to === "decided") blockers.push({ code: "decide-via-ruling" });
  else if (!ALLOWED[from].includes(to)) blockers.push({ code: "illegal-transition", from, to });

  return { canChange: blockers.length === 0, blockers };
}

/** The moves a screen may offer from `from`, already in workflow order. */
export function disputeNextStatuses(from: DisputeStatus): DisputeStatus[] {
  return ALLOWED[from];
}
