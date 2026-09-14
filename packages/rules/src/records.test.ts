import { describe, expect, it } from "vitest";
import { maskNationalId, recordRegistryStatus } from "./records";

describe("recordRegistryStatus", () => {
  it.each(["submitted", "verification", "objection-period"] as const)(
    "marks a parcel under mutation while a related mutation is %s",
    (status) => {
      expect(recordRegistryStatus("verified", [{ status }])).toBe("under-mutation");
    },
  );

  it.each(["approved", "rejected"] as const)(
    "does not mark a parcel under mutation when its related mutation is %s",
    (status) => {
      expect(recordRegistryStatus("verified", [{ status }])).toBe("verified");
    },
  );

  it("uses any active mutation when a parcel has both active and terminal history", () => {
    expect(recordRegistryStatus("disputed", [
      { status: "approved" },
      { status: "verification" },
      { status: "rejected" },
    ])).toBe("under-mutation");
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
