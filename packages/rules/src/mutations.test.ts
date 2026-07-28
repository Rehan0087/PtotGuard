import { describe, expect, it } from "vitest";
import { approvalGate } from "./mutations";
import type { Mutation, MutationObjection } from "./types";

const NOW = new Date("2026-07-20T10:00:00Z");

/** Days from NOW, as the ISO string the record stores. */
function fromNow(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString();
}

function objection(id = "o-1"): MutationObjection {
  return { id, by: "Sohel Rana", at: fromNow(-1), reason: "Boundary disputed." };
}

function mutation(over: Partial<Mutation> = {}): Mutation {
  return {
    id: "m-1",
    mutationNumber: "MUT-2026-01192",
    parcelId: "p-1",
    parcelDagNo: "CS-1",
    type: "sale",
    status: "objection-period",
    fromOwnerName: "Aleya Begum",
    toOwnerName: "Sohel Rana",
    requestedById: "usr-1",
    requestedAt: fromNow(-30),
    documentIds: [],
    objections: [],
    ...over,
  };
}

describe("approvalGate", () => {
  it("approves once the window has closed with no objection standing", () => {
    const gate = approvalGate(
      mutation({ objectionWindowEndsAt: fromNow(-1) }),
      NOW,
    );

    expect(gate.canApprove).toBe(true);
    expect(gate.hold).toBeNull();
  });

  it("holds approval while the statutory window is open", () => {
    const gate = approvalGate(mutation({ objectionWindowEndsAt: fromNow(3) }), NOW);

    expect(gate.canApprove).toBe(false);
    expect(gate.hold).toEqual({ code: "objection-window", days: 3 });
  });

  it("still allows rejection during the window", () => {
    // An officer can turn down a bad application without waiting out the clock.
    const gate = approvalGate(mutation({ objectionWindowEndsAt: fromNow(3) }), NOW);

    expect(gate.canReject).toBe(true);
  });

  it("lets a standing objection outrank a closed window", () => {
    // The clock running out does not settle an objection.
    const gate = approvalGate(
      mutation({ objectionWindowEndsAt: fromNow(-5), objections: [objection()] }),
      NOW,
    );

    expect(gate.canApprove).toBe(false);
    expect(gate.hold).toEqual({ code: "objections", count: 1 });
  });

  it("reports the objection, not the clock, when both would hold it", () => {
    const gate = approvalGate(
      mutation({ objectionWindowEndsAt: fromNow(3), objections: [objection()] }),
      NOW,
    );

    expect(gate.hold).toEqual({ code: "objections", count: 1 });
  });

  it("counts every objection so the officer knows the scale", () => {
    const gate = approvalGate(
      mutation({ objections: [objection("o-1"), objection("o-2")] }),
      NOW,
    );

    expect(gate.hold).toEqual({ code: "objections", count: 2 });
  });

  it("approves when no window was ever set", () => {
    expect(approvalGate(mutation(), NOW).canApprove).toBe(true);
  });

  it.each(["approved", "rejected"] as const)("offers no action on a %s record", (status) => {
    const gate = approvalGate(
      mutation({ status, objections: [objection()], objectionWindowEndsAt: fromNow(3) }),
      NOW,
    );

    expect(gate).toEqual({
      canApprove: false,
      canReject: false,
      hold: null,
      daysToWindowClose: null,
    });
  });

  it("rounds a part-day up, so the last day still reads as a day left", () => {
    // 6 hours remaining is not "0 days" — the window has not closed.
    const gate = approvalGate(
      mutation({ objectionWindowEndsAt: fromNow(0.25) }),
      NOW,
    );

    expect(gate.daysToWindowClose).toBe(1);
    expect(gate.canApprove).toBe(false);
  });

  it("treats the moment of expiry as closed", () => {
    const gate = approvalGate(mutation({ objectionWindowEndsAt: NOW.toISOString() }), NOW);

    expect(gate.daysToWindowClose).toBeNull();
    expect(gate.canApprove).toBe(true);
  });
});
