import { describe, expect, it } from "vitest";
import { maskNationalId } from "./records";

describe("maskNationalId", () => {
  it("reveals only the final four characters of a stored identifier", () => {
    expect(maskNationalId("1990123456789")).toBe("•••• •••• 6789");
  });

  it("does not remask an identifier that is already masked", () => {
    expect(maskNationalId("•••• •••• 4821")).toBe("•••• •••• 4821");
  });

  it("omits empty identifiers", () => {
    expect(maskNationalId(undefined)).toBeUndefined();
    expect(maskNationalId("   ")).toBeUndefined();
  });
});
