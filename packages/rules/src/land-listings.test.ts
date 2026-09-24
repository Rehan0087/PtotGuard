import { describe, expect, it } from "vitest";
import {
  canDecideInquiry,
  canListParcel,
  canWithdrawInquiry,
  listingAfterMutationDecision,
  listingNextStatuses,
  listingTransition,
} from "./land-listings";
import type { ParcelRestriction } from "./types";

function restriction(overrides: Partial<ParcelRestriction> = {}): ParcelRestriction {
  return {
    id: "r-1",
    parcelId: "p-1",
    type: "mortgage",
    authority: "Sonali Bank",
    fromDate: "2020-01-01T00:00:00Z",
    toDate: null,
    ...overrides,
  };
}

describe("canListParcel", () => {
  it("allows an unrestricted, unlisted parcel", () => {
    expect(canListParcel([], false)).toEqual({ canList: true, blockers: [] });
  });

  it("allows a parcel under only a needs-consent restriction (mortgage)", () => {
    expect(canListParcel([restriction({ type: "mortgage" })], false)).toEqual({
      canList: true,
      blockers: [],
    });
  });

  it("refuses a parcel under an active blocking restriction", () => {
    const review = canListParcel([restriction({ type: "injunction" })], false);
    expect(review.canList).toBe(false);
    expect(review.blockers).toContainEqual({ code: "restricted", blockers: ["injunction"] });
  });

  it("refuses a parcel that already has an open listing", () => {
    const review = canListParcel([], true);
    expect(review.canList).toBe(false);
    expect(review.blockers).toContainEqual({ code: "already-listed" });
  });

  it("reports both blockers at once when both apply", () => {
    const review = canListParcel([restriction({ type: "attachment" })], true);
    expect(review.canList).toBe(false);
    expect(review.blockers).toHaveLength(2);
  });
});

describe("listingTransition", () => {
  it("lets an active listing move to under-transfer or withdrawn", () => {
    expect(listingTransition("active", "under-transfer")).toEqual({ canChange: true, blockers: [] });
    expect(listingTransition("active", "withdrawn")).toEqual({ canChange: true, blockers: [] });
  });

  it("lets a deal that fell through reopen to active", () => {
    expect(listingTransition("under-transfer", "active")).toEqual({ canChange: true, blockers: [] });
  });

  it("lets a withdrawn listing be relisted", () => {
    expect(listingTransition("withdrawn", "active")).toEqual({ canChange: true, blockers: [] });
  });

  it("refuses a no-op", () => {
    const review = listingTransition("active", "active");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toEqual([{ code: "same-status", status: "active" }]);
  });

  it("refuses withdrawn straight to under-transfer", () => {
    const review = listingTransition("withdrawn", "under-transfer");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toEqual([
      { code: "illegal-transition", from: "withdrawn", to: "under-transfer" },
    ]);
  });
});

describe("listingNextStatuses", () => {
  it("offers exactly what listingTransition would accept", () => {
    for (const to of listingNextStatuses("active")) {
      expect(listingTransition("active", to).canChange).toBe(true);
    }
  });
});

describe("canDecideInquiry", () => {
  it("lets the seller decide an open inquiry on an active listing", () => {
    expect(canDecideInquiry("active", "open")).toEqual({ canDecide: true });
  });

  it("refuses once the listing has moved on", () => {
    const result = canDecideInquiry("under-transfer", "open");
    expect(result.canDecide).toBe(false);
    expect(result.blocker).toEqual({ code: "listing-not-active", status: "under-transfer" });
  });

  it("refuses an inquiry that isn't open", () => {
    const result = canDecideInquiry("active", "declined");
    expect(result.canDecide).toBe(false);
    expect(result.blocker).toEqual({ code: "inquiry-not-open", status: "declined" });
  });
});

describe("canWithdrawInquiry", () => {
  it("lets a buyer withdraw their open inquiry", () => {
    expect(canWithdrawInquiry("open")).toEqual({ canWithdraw: true });
  });

  it("refuses withdrawing an inquiry that's already decided", () => {
    const result = canWithdrawInquiry("accepted");
    expect(result.canWithdraw).toBe(false);
    expect(result.blocker).toEqual({ code: "inquiry-not-open", status: "accepted" });
  });
});

describe("sold listings", () => {
  it("refuses any move out of sold", () => {
    for (const to of ["active", "withdrawn", "under-transfer"] as const) {
      expect(listingTransition("sold", to).blockers).toEqual([{ code: "already-sold" }]);
    }
  });

  it("refuses a seller marking their own listing sold — only an approved transfer does that", () => {
    expect(listingTransition("under-transfer", "sold").blockers).toEqual([{ code: "sold-via-mutation" }]);
  });

  it("offers no moves from sold", () => {
    expect(listingNextStatuses("sold")).toEqual([]);
  });
});

describe("listingAfterMutationDecision", () => {
  it("marks the listing sold when the transfer is approved", () => {
    expect(listingAfterMutationDecision(true)).toEqual({ listing: "sold", acceptedInquiry: "accepted" });
  });

  it("puts the listing back on the market and drops the buyer's interest when rejected", () => {
    expect(listingAfterMutationDecision(false)).toEqual({ listing: "active", acceptedInquiry: "declined" });
  });
});
