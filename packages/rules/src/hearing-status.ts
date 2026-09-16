/**
 * Where a hearing may go next, and through which door.
 *
 * Two statuses are not a status write's to set. `in-hearing` is stamped by
 * recording the first sitting — a case is being heard because a sitting
 * exists, not because someone said so — and `ruled` is stamped by the
 * ruling, which also records the ruling text and closes the dispute behind
 * it. The gate names those doors instead of letting a bare status write
 * walk past them.
 *
 * `closed` is how a hearing ends without a ruling: the parties settled, the
 * dispute was withdrawn, or the matter went elsewhere. Without it, a hearing
 * nobody will ever rule on stays open forever and keeps blocking a second
 * hearing on the same dispute.
 */
import type { HearingStatus } from "./types";

/** Nothing moves a hearing out of these. `ruled` is not one: an appeal follows it. */
export const HEARING_DECIDED_STATUSES: HearingStatus[] = ["appealed", "closed"];

/** Open to sittings, adjournment, and reassignment. */
export function isHearingOpen(status: HearingStatus): boolean {
  return !HEARING_DECIDED_STATUSES.includes(status) && status !== "ruled";
}

/**
 * `scheduled` cannot jump straight to `in-hearing`: record the sitting and
 * the sitting moves it. `deliberation` and `in-hearing` swap freely, because
 * a mediator who reserved a ruling may reopen for one more sitting.
 */
const ALLOWED: Record<HearingStatus, HearingStatus[]> = {
  scheduled: ["closed"],
  "in-hearing": ["deliberation", "closed"],
  deliberation: ["in-hearing", "closed"],
  ruled: ["appealed"],
  appealed: [],
  closed: [],
};

export type HearingTransitionBlocker =
  | { code: "already-closed"; status: HearingStatus }
  | { code: "same-status"; status: HearingStatus }
  | { code: "hear-via-session" }
  | { code: "rule-via-ruling" }
  | { code: "illegal-transition"; from: HearingStatus; to: HearingStatus };

export interface HearingTransitionReview {
  canChange: boolean;
  blockers: HearingTransitionBlocker[];
}

export function hearingTransition(
  from: HearingStatus,
  to: HearingStatus,
): HearingTransitionReview {
  if (HEARING_DECIDED_STATUSES.includes(from)) {
    return { canChange: false, blockers: [{ code: "already-closed", status: from }] };
  }

  const blockers: HearingTransitionBlocker[] = [];
  if (to === from) blockers.push({ code: "same-status", status: from });
  else if (to === "ruled") blockers.push({ code: "rule-via-ruling" });
  else if (to === "in-hearing" && from === "scheduled") blockers.push({ code: "hear-via-session" });
  else if (!ALLOWED[from].includes(to)) blockers.push({ code: "illegal-transition", from, to });

  return { canChange: blockers.length === 0, blockers };
}

/** The moves a mediator's screen may offer from `from`. */
export function hearingNextStatuses(from: HearingStatus): HearingStatus[] {
  return ALLOWED[from];
}
