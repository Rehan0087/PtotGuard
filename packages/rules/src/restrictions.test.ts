import { describe, expect, it } from "vitest";
import {
  activeRestrictions,
  restrictionEffect,
  toPublicParcel,
  transferReview,
} from "./restrictions";
import type { ParcelRestriction, RestrictionType } from "./types";

const NOW = new Date("2026-07-01T00:00:00Z");

function restriction(over: Partial<ParcelRestriction> = {}): ParcelRestriction {
  return {
    id: "r-1",
    parcelId: "p-142",
    type: "injunction",
    authority: "Cumilla Sadar Court",
    fromDate: "2026-01-01T00:00:00Z",
    toDate: null,
    ...over,
  };
}

describe("restrictionEffect", () => {
  it("treats a mortgage as releasable, not a bar", () => {
    // A charge on the land: the lender's NOC clears it. Refusing every
    // mortgaged sale would strand ordinary, lawful transactions.
    expect(restrictionEffect("mortgage")).toBe("needs-consent");
  });

  it.each<RestrictionType>(["injunction", "attachment", "acquisition", "non-transferable"])(
    "treats %s as an outright bar",
    (type) => {
      expect(restrictionEffect(type)).toBe("blocks");
    },
  );

  it("covers every restriction type", () => {
    // A type with no entry would read as undefined and quietly stop blocking.
    const all: RestrictionType[] = [
      "mortgage",
      "injunction",
      "attachment",
      "acquisition",
      "non-transferable",
    ];

    for (const type of all) expect(restrictionEffect(type)).toBeDefined();
  });
});

describe("activeRestrictions", () => {
  it("counts an open-ended restriction that has started", () => {
    expect(activeRestrictions([restriction()], NOW)).toHaveLength(1);
  });

  it("ignores one that has not started yet", () => {
    const future = restriction({ fromDate: "2026-09-01T00:00:00Z" });

    expect(activeRestrictions([future], NOW)).toEqual([]);
  });

  it("ignores one that has already ended", () => {
    const lifted = restriction({ toDate: "2026-06-01T00:00:00Z" });

    expect(activeRestrictions([lifted], NOW)).toEqual([]);
  });

  it("treats one starting today as already in force", () => {
    // An injunction does not wait for tomorrow.
    const today = restriction({ fromDate: NOW.toISOString() });

    expect(activeRestrictions([today], NOW)).toHaveLength(1);
  });

  it("treats one ending today as expired", () => {
    // toDate records the moment it ceased to bind, so it no longer does.
    const ending = restriction({ toDate: NOW.toISOString() });

    expect(activeRestrictions([ending], NOW)).toEqual([]);
  });

  it("keeps a restriction whose end date is unreadable rather than dropping it", () => {
    // Failing open here would silently un-encumber land on bad data. The safe
    // reading of a malformed end date is that the restriction still stands.
    const malformed = restriction({ toDate: "not-a-date" });

    expect(activeRestrictions([malformed], NOW)).toHaveLength(1);
  });

  it("drops a restriction whose start date is unreadable", () => {
    // The mirror case: without a readable start there is nothing to say it
    // ever came into force.
    const malformed = restriction({ fromDate: "not-a-date" });

    expect(activeRestrictions([malformed], NOW)).toEqual([]);
  });
});

describe("transferReview", () => {
  it("allows a transfer on unencumbered land", () => {
    expect(transferReview([], NOW)).toEqual({ canTransfer: true, blockers: [], consents: [] });
  });

  it("refuses while a court injunction stands", () => {
    const review = transferReview([restriction()], NOW);

    expect(review.canTransfer).toBe(false);
    expect(review.blockers).toHaveLength(1);
  });

  it("allows a mortgaged plot to transfer, but reports the consent needed", () => {
    const review = transferReview([restriction({ type: "mortgage" })], NOW);

    expect(review.canTransfer).toBe(true);
    expect(review.consents).toHaveLength(1);
    expect(review.blockers).toEqual([]);
  });

  it("lets one blocker outweigh any number of consents", () => {
    const review = transferReview(
      [
        restriction({ id: "r-1", type: "mortgage" }),
        restriction({ id: "r-2", type: "mortgage" }),
        restriction({ id: "r-3", type: "attachment" }),
      ],
      NOW,
    );

    expect(review.canTransfer).toBe(false);
    expect(review.blockers.map((r) => r.id)).toEqual(["r-3"]);
    expect(review.consents).toHaveLength(2);
  });

  it("ignores a restriction that has been lifted", () => {
    // A discharged mortgage or a vacated injunction encumbers nothing.
    const lifted = restriction({ toDate: "2026-06-01T00:00:00Z" });

    expect(transferReview([lifted], NOW)).toEqual({
      canTransfer: true,
      blockers: [],
      consents: [],
    });
  });

  it("reports every active blocker, not just the first", () => {
    // The screen lists what has to be cleared; revealing one at a time turns
    // clearing a title into a guessing game.
    const review = transferReview(
      [restriction({ id: "r-1" }), restriction({ id: "r-2", type: "acquisition" })],
      NOW,
    );

    expect(review.blockers.map((r) => r.id)).toEqual(["r-1", "r-2"]);
  });
});

describe("toPublicParcel", () => {
  /** A row as the database hands it over — deliberately carrying more than is public. */
  const row = {
    ulpin: "ILR-CUM-DEB-000002",
    dagNo: "RS-88",
    khatianNo: "217",
    landUse: "residential",
    area: { value: 8, unit: "katha" },
    ownerName: "Ayesha Siddika",
    registryStatus: "under-mutation",
    // Everything below must not survive the narrowing.
    id: "p-088",
    ownerId: "usr-ayesha",
    marketValue: { amount: 3_200_000, currency: "BDT" },
    centroid: { lat: 23.5502, lng: 90.9871 },
    boundary: { type: "Polygon", coordinates: [] },
    jurisdictionId: "j-rajamehar",
  };

  it("carries what a land registry is expected to disclose", () => {
    const view = toPublicParcel(row, [], NOW);

    expect(view).toMatchObject({
      ulpin: "ILR-CUM-DEB-000002",
      dagNo: "RS-88",
      khatianNo: "217",
      ownerName: "Ayesha Siddika",
      canTransfer: true,
    });
  });

  it.each([
    "id",
    "ownerId",
    "marketValue",
    "centroid",
    "boundary",
    "jurisdictionId",
  ])("does not leak %s", (field) => {
    // The point of a separate shape: these are absent from the payload, not
    // present and hidden by the screen. Spreading the row would pass every
    // other assertion here and still fail this one.
    expect(toPublicParcel(row, [], NOW)).not.toHaveProperty(field);
  });

  it("discloses that a restriction exists without its free text", () => {
    // The existence of an injunction is a public fact. Its note can name
    // allegations and case particulars that are not.
    const view = toPublicParcel(
      row,
      [restriction({ note: "Alleged forgery by the second respondent." })],
      NOW,
    );

    expect(view.restrictions).toHaveLength(1);
    expect(view.restrictions[0]).toMatchObject({
      type: "injunction",
      authority: "Cumilla Sadar Court",
    });
    expect(view.restrictions[0]).not.toHaveProperty("note");
    expect(JSON.stringify(view)).not.toContain("Alleged forgery");
  });

  it("shows only restrictions still in force", () => {
    const view = toPublicParcel(row, [restriction({ toDate: "2026-06-01T00:00:00Z" })], NOW);

    expect(view.restrictions).toEqual([]);
  });

  it("reports a blocked plot as such, so due diligence gets a straight answer", () => {
    expect(toPublicParcel(row, [restriction()], NOW).canTransfer).toBe(false);
  });

  it("renders a plot with no ULPIN as an empty string, never null", () => {
    // The field is typed as a string; a null here would print as "null".
    expect(toPublicParcel({ ...row, ulpin: null }, [], NOW).ulpin).toBe("");
  });
});
