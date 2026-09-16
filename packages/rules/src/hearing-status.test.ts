import { describe, expect, it } from "vitest";
import {
  HEARING_DECIDED_STATUSES,
  hearingNextStatuses,
  hearingTransition,
  isHearingOpen,
} from "./hearing-status";

describe("hearingTransition", () => {
  it("reserves a ruling after the case has been heard", () => {
    expect(hearingTransition("in-hearing", "deliberation")).toEqual({
      canChange: true,
      blockers: [],
    });
  });

  it("reopens deliberation for one more sitting", () => {
    expect(hearingTransition("deliberation", "in-hearing").canChange).toBe(true);
  });

  it("sends a ruling through the ruling endpoint, not a status write", () => {
    const review = hearingTransition("deliberation", "ruled");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toContainEqual({ code: "rule-via-ruling" });
  });

  it("will not call a case heard before a sitting is recorded", () => {
    const review = hearingTransition("scheduled", "in-hearing");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toContainEqual({ code: "hear-via-session" });
  });

  it("allows an appeal only against a ruling", () => {
    expect(hearingTransition("ruled", "appealed").canChange).toBe(true);
    const review = hearingTransition("in-hearing", "appealed");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toContainEqual({
      code: "illegal-transition",
      from: "in-hearing",
      to: "appealed",
    });
  });

  it("closes an open case from anywhere it is open", () => {
    for (const from of ["scheduled", "in-hearing", "deliberation"] as const) {
      expect(hearingTransition(from, "closed").canChange).toBe(true);
    }
  });

  it("refuses a case already finished, whatever the target", () => {
    for (const from of HEARING_DECIDED_STATUSES) {
      const review = hearingTransition(from, "in-hearing");
      expect(review.canChange).toBe(false);
      expect(review.blockers).toEqual([{ code: "already-closed", status: from }]);
    }
  });

  it("refuses a no-op", () => {
    expect(hearingTransition("in-hearing", "in-hearing").blockers).toContainEqual({
      code: "same-status",
      status: "in-hearing",
    });
  });
});

describe("isHearingOpen", () => {
  it("is true only while sittings, adjournment and reassignment still make sense", () => {
    expect(isHearingOpen("scheduled")).toBe(true);
    expect(isHearingOpen("in-hearing")).toBe(true);
    expect(isHearingOpen("deliberation")).toBe(true);
    expect(isHearingOpen("ruled")).toBe(false);
    expect(isHearingOpen("appealed")).toBe(false);
    expect(isHearingOpen("closed")).toBe(false);
  });
});

describe("hearingNextStatuses", () => {
  it("never offers a status another endpoint owns", () => {
    for (const from of ["scheduled", "in-hearing", "deliberation"] as const) {
      expect(hearingNextStatuses(from)).not.toContain("ruled");
    }
    expect(hearingNextStatuses("scheduled")).not.toContain("in-hearing");
  });

  it("agrees with the gate on every pair it offers", () => {
    for (const from of ["scheduled", "in-hearing", "deliberation", "ruled"] as const) {
      for (const to of hearingNextStatuses(from)) {
        expect(hearingTransition(from, to).canChange).toBe(true);
      }
    }
  });
});
