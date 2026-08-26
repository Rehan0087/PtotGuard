import { describe, expect, it } from "vitest";
import { executionGate, registryStatusAfter } from "./execution";
import type { Dispute } from "./types";

function dispute(over: Partial<Dispute> & { recordsExecutedAt?: string | null } = {}) {
  return {
    status: "resolved" as Dispute["status"],
    recordsExecutedAt: null,
    ...over,
  };
}

describe("executionGate", () => {
  it("refuses a dispute that hasn't been ruled on yet", () => {
    const review = executionGate(dispute({ status: "in-mediation" }), { action: "no-change" }, []);
    expect(review.canExecute).toBe(false);
    expect(review.blockers).toContainEqual({ code: "not-resolved" });
  });

  it("refuses a case already executed", () => {
    const review = executionGate(
      dispute({ recordsExecutedAt: "2026-08-01T00:00:00Z" }),
      { action: "no-change" },
      [],
    );
    expect(review.canExecute).toBe(false);
    expect(review.blockers).toContainEqual({ code: "already-executed" });
  });

  it("requires an outcome to be picked", () => {
    const review = executionGate(dispute(), undefined, []);
    expect(review.canExecute).toBe(false);
    expect(review.blockers).toContainEqual({ code: "need-outcome" });
  });

  it("allows no-change once resolved", () => {
    const review = executionGate(dispute(), { action: "no-change" }, []);
    expect(review.canExecute).toBe(true);
  });

  it("allows referred-to-mutation once resolved", () => {
    const review = executionGate(dispute(), { action: "referred-to-mutation" }, []);
    expect(review.canExecute).toBe(true);
  });

  describe("restriction-added", () => {
    it("requires a restriction type and an authority", () => {
      const review = executionGate(
        dispute(),
        { action: "restriction-added", restrictionType: undefined as never, authority: "" },
        [],
      );
      expect(review.canExecute).toBe(false);
      expect(review.blockers).toContainEqual({ code: "need-restriction-type" });
      expect(review.blockers).toContainEqual({ code: "need-authority" });
    });

    it("passes with both present", () => {
      const review = executionGate(
        dispute(),
        { action: "restriction-added", restrictionType: "injunction", authority: "Cumilla Sadar Court" },
        [],
      );
      expect(review.canExecute).toBe(true);
    });

    it("rejects a blank authority, not just a missing one", () => {
      const review = executionGate(
        dispute(),
        { action: "restriction-added", restrictionType: "injunction", authority: "   " },
        [],
      );
      expect(review.blockers).toContainEqual({ code: "need-authority" });
    });
  });

  describe("restriction-removed", () => {
    it("requires an id", () => {
      const review = executionGate(
        dispute(),
        { action: "restriction-removed", restrictionId: "" },
        ["r-1"],
      );
      expect(review.blockers).toContainEqual({ code: "need-restriction-id" });
    });

    it("refuses an id that isn't currently active on this parcel", () => {
      const review = executionGate(
        dispute(),
        { action: "restriction-removed", restrictionId: "r-9" },
        ["r-1"],
      );
      expect(review.blockers).toContainEqual({ code: "restriction-not-found" });
    });

    it("passes for an id that is active", () => {
      const review = executionGate(
        dispute(),
        { action: "restriction-removed", restrictionId: "r-1" },
        ["r-1"],
      );
      expect(review.canExecute).toBe(true);
    });
  });

  it("reports every applicable blocker at once, not just the first", () => {
    const review = executionGate(
      dispute({ status: "in-mediation", recordsExecutedAt: "2026-08-01T00:00:00Z" }),
      undefined,
      [],
    );
    expect(review.blockers).toHaveLength(3);
  });
});

describe("registryStatusAfter", () => {
  it("clears a dismissed ruling back to verified", () => {
    expect(registryStatusAfter({ action: "no-change" }, 0)).toBe("verified");
  });

  it("flags the parcel once a restriction is added", () => {
    expect(
      registryStatusAfter(
        { action: "restriction-added", restrictionType: "injunction", authority: "Court" },
        1,
      ),
    ).toBe("flagged");
  });

  it("clears to verified when removing the last active restriction", () => {
    expect(registryStatusAfter({ action: "restriction-removed", restrictionId: "r-1" }, 0)).toBe(
      "verified",
    );
  });

  it("stays flagged when another restriction is still active after removal", () => {
    expect(registryStatusAfter({ action: "restriction-removed", restrictionId: "r-1" }, 1)).toBe(
      "flagged",
    );
  });

  it("marks the parcel under-mutation when referred", () => {
    expect(registryStatusAfter({ action: "referred-to-mutation" }, 0)).toBe("under-mutation");
  });
});
