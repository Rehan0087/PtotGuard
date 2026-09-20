import { describe, expect, it } from "vitest";
import { maskNationalId, recordRegistryStatus } from "./records";

describe("recordRegistryStatus", () => {
  it.each(["submitted", "under-primary-verification", "field-investigation", "field-verification-complete", "approved", "awaiting-dcr-payment"] as const)(
    "marks a parcel under mutation while a related mutation is %s",
    (status) => {
      expect(recordRegistryStatus([{ status }])).toBe("under-mutation");
    },
  );

  it.each(["complete", "rejected"] as const)(
    "does not mark a parcel under mutation when its related mutation is %s",
    (status) => {
      expect(recordRegistryStatus([{ status }])).toBe("verified");
    },
  );

  it("keeps an active mutation under mutation when a separate plot dispute is open", () => {
    expect(recordRegistryStatus([{ status: "under-primary-verification" }], 1)).toBe("under-mutation");
  });

  it("shows disputed when the active mutation is linked to the dispute", () => {
    expect(recordRegistryStatus([{ status: "field-investigation", disputeId: "ds-1" }], 1)).toBe("disputed");
  });

  it("stays disputed after mediation until the linked mutation is closed", () => {
    expect(recordRegistryStatus([{ status: "field-investigation", disputeId: "ds-1" }], 0)).toBe("disputed");
  });

  it("uses any active mutation when a parcel has both active and terminal history", () => {
    expect(recordRegistryStatus([
      { status: "approved" },
      { status: "under-primary-verification" },
      { status: "rejected" },
    ])).toBe("under-mutation");
  });

  it("shows flagged OCR evidence ahead of linked disputes and mutations", () => {
    expect(recordRegistryStatus([{ status: "submitted" }], 2, true)).toBe("flagged");
  });

  it("never carries a stale pending parcel label into the derived result", () => {
    expect(recordRegistryStatus([])).toBe("verified");
  });
});
describe("maskNationalId", () => {
  it("reveals only the final four characters of a stored identifier", () => {
    expect(maskNationalId("1990123456789")).toBe("•••• •••• 6789");
  });

  it("does not remask an identifier that is already masked", () => {
    expect(maskNationalId("•••• •••• 4821")).toBe("•••• •••• 4821");
  });

  it("never trusts partial or prefixed masks", () => {
    expect(maskNationalId("19901234•56789")).toBe("•••• •••• 6789");
    expect(maskNationalId("raw-prefix-•••• •••• 4821")).toBe("•••• •••• 4821");
  });

  it("omits empty identifiers", () => {
    expect(maskNationalId(undefined)).toBeUndefined();
    expect(maskNationalId("   ")).toBeUndefined();
  });
});

