import { describe, expect, it } from "vitest";
import {
  DISPUTE_CLOSED_STATUSES,
  disputeNextStatuses,
  disputeTransition,
} from "./dispute-status";

describe("disputeTransition", () => {
  it("advances a new case to review", () => {
    expect(disputeTransition("submitted", "under-review")).toEqual({
      canChange: true,
      blockers: [],
    });
  });

  it("refuses a case that is already closed, whatever the target", () => {
    for (const from of DISPUTE_CLOSED_STATUSES) {
      const review = disputeTransition(from, "under-review");
      expect(review.canChange).toBe(false);
      expect(review.blockers).toEqual([{ code: "already-closed", status: from }]);
    }
  });

  it("refuses a no-op", () => {
    const review = disputeTransition("in-mediation", "in-mediation");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toContainEqual({ code: "same-status", status: "in-mediation" });
  });

  it("sends scheduling through the hearing, not a status write", () => {
    const review = disputeTransition("in-mediation", "hearing-scheduled");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toContainEqual({ code: "schedule-via-hearing" });
  });

  it("sends resolution through the ruling, not a status write", () => {
    const review = disputeTransition("hearing-scheduled", "resolved");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toContainEqual({ code: "resolve-via-ruling" });
  });

  it("refuses a jump that skips review", () => {
    const review = disputeTransition("submitted", "in-mediation");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toContainEqual({
      code: "illegal-transition",
      from: "submitted",
      to: "in-mediation",
    });
  });

  it("lets an adjourned hearing fall back to mediation", () => {
    expect(disputeTransition("hearing-scheduled", "in-mediation").canChange).toBe(true);
  });

  it("lets an open case be rejected or withdrawn from anywhere it is open", () => {
    for (const from of ["submitted", "under-review", "field-visit-scheduled", "in-mediation", "hearing-scheduled"] as const) {
      expect(disputeTransition(from, "withdrawn").canChange).toBe(true);
      expect(disputeTransition(from, "rejected").canChange).toBe(true);
    }
  });
});

describe("disputeNextStatuses", () => {
  it("never offers the two statuses other endpoints own", () => {
    for (const from of ["submitted", "under-review", "field-visit-scheduled", "in-mediation", "hearing-scheduled"] as const) {
      expect(disputeNextStatuses(from)).not.toContain("hearing-scheduled");
      expect(disputeNextStatuses(from)).not.toContain("resolved");
    }
  });

  it("offers nothing on a closed case", () => {
    for (const from of DISPUTE_CLOSED_STATUSES) expect(disputeNextStatuses(from)).toEqual([]);
  });

  it("agrees with the gate on every pair it offers", () => {
    for (const from of ["submitted", "under-review", "field-visit-scheduled", "in-mediation", "hearing-scheduled"] as const) {
      for (const to of disputeNextStatuses(from)) {
        expect(disputeTransition(from, to).canChange).toBe(true);
      }
    }
  });
});
