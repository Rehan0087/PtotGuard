import { describe, expect, it } from "vitest";
import { buildUlpin, isUlpin, normaliseUlpin } from "./ulpin";
import type { Jurisdiction } from "./types";

/** Chattogram › Cumilla › Debidwar › Rajamehar — the seeded shape. */
const TREE: Jurisdiction[] = [
  { id: "j-ctg", name: "Chattogram", code: "CTG", level: "division", parentId: null },
  { id: "j-cum", name: "Cumilla", code: "CTG-CUM", level: "district", parentId: "j-ctg" },
  { id: "j-deb", name: "Debidwar", code: "CTG-CUM-DEB", level: "upazila", parentId: "j-cum" },
  { id: "j-raj", name: "Rajamehar", code: "CTG-CUM-DEB-RAJ", level: "mouza", parentId: "j-deb" },
];

describe("buildUlpin", () => {
  it("names the district and upazila, not the whole chain", () => {
    // The tree's codes nest every ancestor (CTG-CUM-DEB-RAJ). An identifier a
    // person reads aloud takes only the distinctive tail of each level.
    const result = buildUlpin("j-raj", TREE, 142);

    expect(result).toEqual({ ok: true, ulpin: "ILR-CUM-DEB-000142" });
  });

  it("pads the sequence, so identifiers sort and align", () => {
    expect(buildUlpin("j-raj", TREE, 1)).toEqual({ ok: true, ulpin: "ILR-CUM-DEB-000001" });
    expect(buildUlpin("j-raj", TREE, 999_999)).toEqual({
      ok: true,
      ulpin: "ILR-CUM-DEB-999999",
    });
  });

  it("builds the same identifier from the upazila itself as from a mouza inside it", () => {
    // Both sit under the same district and upazila, which is all the string carries.
    expect(buildUlpin("j-deb", TREE, 7)).toEqual(buildUlpin("j-raj", TREE, 7));
  });

  it("refuses a jurisdiction that is not in the tree", () => {
    expect(buildUlpin("j-nope", TREE, 1)).toEqual({
      ok: false,
      refusal: { code: "unknown-jurisdiction" },
    });
  });

  it("refuses rather than inventing a placeholder when a level is missing", () => {
    // A parcel hanging straight off a district is a real (if broken) shape.
    // Stamping it ILR-CUM-XX-000001 would mint something that looks citable
    // and isn't — the whole point of the identifier is that it resolves.
    expect(buildUlpin("j-cum", TREE, 1)).toEqual({
      ok: false,
      refusal: { code: "missing-level", level: "upazila" },
    });
    expect(buildUlpin("j-ctg", TREE, 1)).toEqual({
      ok: false,
      refusal: { code: "missing-level", level: "district" },
    });
  });

  it.each([0, -1, 1_000_000, 1.5, NaN])("refuses sequence %p", (sequence) => {
    const result = buildUlpin("j-raj", TREE, sequence);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe("sequence-out-of-range");
  });

  it("uppercases codes that were stored lowercase", () => {
    const lower: Jurisdiction[] = [
      { id: "d", name: "D", code: "ctg-cum", level: "district", parentId: null },
      { id: "u", name: "U", code: "ctg-cum-deb", level: "upazila", parentId: "d" },
    ];

    expect(buildUlpin("u", lower, 5)).toEqual({ ok: true, ulpin: "ILR-CUM-DEB-000005" });
  });
});

describe("isUlpin", () => {
  it("accepts a well-formed identifier, in any case or padding of spaces", () => {
    expect(isUlpin("ILR-CUM-DEB-000142")).toBe(true);
    expect(isUlpin("  ilr-cum-deb-000142  ")).toBe(true);
  });

  it.each([
    ["CS-142/3", "a dag number"],
    ["ILR-CUM-DEB-142", "too few digits"],
    ["ILR-CUM-DEB-0001422", "too many digits"],
    ["ILR-CUM-000142", "a missing level"],
    ["CUM-DEB-000142", "no programme prefix"],
    ["", "nothing at all"],
  ])("rejects %p (%s)", (value) => {
    expect(isUlpin(value)).toBe(false);
  });

  it("tells an identifier apart from the free text a search box also gets", () => {
    // This is the only thing isUlpin decides — whether to look up by
    // identifier or search by keyword. Not whether the plot exists.
    expect(isUlpin("Rajamehar")).toBe(false);
    expect(isUlpin("ILR-CUM-DEB-000142")).toBe(true);
  });
});

describe("normaliseUlpin", () => {
  it("trims and uppercases, so a pasted identifier still matches", () => {
    expect(normaliseUlpin(" ilr-cum-deb-000142 ")).toBe("ILR-CUM-DEB-000142");
  });
});
