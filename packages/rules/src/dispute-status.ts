/**
 * Which status a dispute may move to next, and through which channel.
 *
 * Status on a dispute is not a free-text field, and two of its values are
 * not this endpoint's to write. `hearing-scheduled` is stamped by convening
 * a hearing — which also assigns the mediator and creates the hearing row —
 * and `resolved` is stamped by a mediator's ruling, which also records the
 * resolution text. A plain status write that reached either one would leave
 * a case claiming a hearing that does not exist, or a resolution with no
 * ruling behind it. So the gate names the right channel instead of allowing
 * the shortcut.
 *
 * Pure like every rule here: the mediator's screen offers exactly the moves
 * the endpoint will accept, because both ask this function.
 */
import type { DisputeStatus } from "./types";

/** A dispute in one of these is finished; nothing moves it again. */
export const DISPUTE_CLOSED_STATUSES: DisputeStatus[] = ["resolved", "rejected", "withdrawn"];

/**
 * What a plain status write may do. `hearing-scheduled` and `resolved` are
 * deliberately absent from every list — see `schedule-via-hearing` and
 * `resolve-via-ruling`. A listed case may fall back to `in-mediation`
 * because a hearing can be adjourned without the case itself closing.
 */
const ALLOWED: Record<DisputeStatus, DisputeStatus[]> = {
  submitted: ["under-review", "rejected", "withdrawn"],
  "under-review": ["field-visit-scheduled", "in-mediation", "rejected", "withdrawn"],
  "field-visit-scheduled": ["under-review", "in-mediation", "rejected", "withdrawn"],
  "in-mediation": ["under-review", "rejected", "withdrawn"],
  "hearing-scheduled": ["in-mediation", "rejected", "withdrawn"],
  resolved: [],
  rejected: [],
  withdrawn: [],
};

export type DisputeTransitionBlocker =
  | { code: "already-closed"; status: DisputeStatus }
  | { code: "same-status"; status: DisputeStatus }
  | { code: "schedule-via-hearing" }
  | { code: "resolve-via-ruling" }
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
  else if (to === "resolved") blockers.push({ code: "resolve-via-ruling" });
  else if (!ALLOWED[from].includes(to)) blockers.push({ code: "illegal-transition", from, to });

  return { canChange: blockers.length === 0, blockers };
}

/** The moves a screen may offer from `from`, already in workflow order. */
export function disputeNextStatuses(from: DisputeStatus): DisputeStatus[] {
  return ALLOWED[from];
}
