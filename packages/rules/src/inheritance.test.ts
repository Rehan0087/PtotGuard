import { describe, expect, it } from "vitest";
import { calcInheritance } from "./inheritance";
import type { Heir, HeirRelation, InheritanceResult } from "./types";

/** `{ wife: 1, son: 2 }` reads closer to the worked examples than a Heir[] does. */
function heirs(spec: Partial<Record<HeirRelation, number>>): Heir[] {
  return Object.entries(spec).map(([relation, count]) => ({
    relation: relation as HeirRelation,
    count,
  }));
}

function shareOf(result: InheritanceResult, relation: HeirRelation): number {
  return result.shares.find((s) => s.relation === relation)?.totalShare ?? 0;
}

const faraiz = (spec: Partial<Record<HeirRelation, number>>, estateValue?: number) =>
  calcInheritance({ method: "faraiz", heirs: heirs(spec), estateValue });

const hindu = (spec: Partial<Record<HeirRelation, number>>, estateValue?: number) =>
  calcInheritance({ method: "hindu", heirs: heirs(spec), estateValue });

/** Shares must account for the whole estate, or land goes unassigned. */
function totalShare(result: InheritanceResult): number {
  return result.shares.reduce((sum, s) => sum + s.totalShare, 0);
}

describe("faraiz — Quranic fixed shares", () => {
  it("halves the husband's share when there are children", () => {
    expect(shareOf(faraiz({ husband: 1 }), "husband")).toBeCloseTo(1 / 2);
    expect(shareOf(faraiz({ husband: 1, son: 1 }), "husband")).toBeCloseTo(1 / 4);
  });

  it("halves the wife's share when there are children", () => {
    expect(shareOf(faraiz({ wife: 1, father: 1 }), "wife")).toBeCloseTo(1 / 4);
    expect(shareOf(faraiz({ wife: 1, son: 1 }), "wife")).toBeCloseTo(1 / 8);
  });

  it("treats co-wives as one share between them", () => {
    // The 1/8 is the wives' collective entitlement, not each wife's.
    expect(shareOf(faraiz({ wife: 4, son: 1 }), "wife")).toBeCloseTo(1 / 8);
  });

  it("reduces the mother from a third to a sixth when there are children", () => {
    expect(shareOf(faraiz({ mother: 1, father: 1 }), "mother")).toBeCloseTo(1 / 3);
    expect(shareOf(faraiz({ mother: 1, son: 1 }), "mother")).toBeCloseTo(1 / 6);
  });
});

describe("faraiz — residuary division", () => {
  it("gives a son twice a daughter's portion", () => {
    const r = faraiz({ son: 1, daughter: 1 });

    expect(shareOf(r, "son")).toBeCloseTo(2 / 3);
    expect(shareOf(r, "daughter")).toBeCloseTo(1 / 3);
  });

  it("splits the residue 2:1 per head, not per group", () => {
    // 2 sons + 2 daughters = 6 parts; sons take 4, daughters 2.
    const r = faraiz({ son: 2, daughter: 2 });

    expect(shareOf(r, "son")).toBeCloseTo(4 / 6);
    expect(shareOf(r, "daughter")).toBeCloseTo(2 / 6);
  });

  it("gives a lone daughter a half and two or more daughters two thirds", () => {
    expect(shareOf(faraiz({ daughter: 1, father: 1 }), "daughter")).toBeCloseTo(1 / 2);
    expect(shareOf(faraiz({ daughter: 3, father: 1 }), "daughter")).toBeCloseTo(2 / 3);
  });

  it("passes what is left to the father when there is no son", () => {
    // Daughter 1/2, mother 1/6 — the father takes the remaining 1/3 as residuary.
    const r = faraiz({ daughter: 1, mother: 1, father: 1 });

    expect(shareOf(r, "father")).toBeCloseTo(1 / 3);
    expect(totalShare(r)).toBeCloseTo(1);
  });

  it("caps the father at a sixth when a son survives", () => {
    const r = faraiz({ son: 1, father: 1 });

    expect(shareOf(r, "father")).toBeCloseTo(1 / 6);
    expect(shareOf(r, "son")).toBeCloseTo(5 / 6);
  });
});

describe("faraiz — the estate is fully accounted for", () => {
  const estates: Partial<Record<HeirRelation, number>>[] = [
    { husband: 1, son: 1 },
    { wife: 1, son: 2, daughter: 1 },
    { wife: 1, daughter: 1, father: 1, mother: 1 },
    { husband: 1, daughter: 2, father: 1 },
    { son: 3 },
    { father: 1, mother: 1 },
  ];

  it.each(estates)("distributes the whole estate for %j", (spec) => {
    expect(totalShare(faraiz(spec))).toBeCloseTo(1);
  });

  it("flags an undistributed remainder rather than silently losing it", () => {
    // Wife 1/4 + mother 1/3 with no children and no father leaves a residue
    // that the simplified heir set cannot place.
    const r = faraiz({ wife: 1, mother: 1 });

    expect(r.notes).toContain("faraiz-residue");
    expect(totalShare(r)).toBeLessThan(1);
  });

  it("omits an heir group that inherits nothing", () => {
    expect(faraiz({ son: 1 }).shares.map((s) => s.relation)).toEqual(["son"]);
  });

  it("always states that it is simplified", () => {
    expect(faraiz({ son: 1 }).notes).toEqual(
      expect.arrayContaining(["faraiz-scope", "faraiz-omissions"]),
    );
  });
});

describe("hindu — per capita", () => {
  it("splits equally between Class I heirs", () => {
    const r = hindu({ wife: 1, son: 1, daughter: 1 });

    expect(shareOf(r, "wife")).toBeCloseTo(1 / 3);
    expect(shareOf(r, "son")).toBeCloseTo(1 / 3);
    expect(shareOf(r, "daughter")).toBeCloseTo(1 / 3);
  });

  it("gives a daughter the same as a son, unlike faraiz", () => {
    const r = hindu({ son: 1, daughter: 1 });

    expect(shareOf(r, "son")).toBeCloseTo(shareOf(r, "daughter"));
  });

  it("counts each head, so a group of three takes three portions", () => {
    const r = hindu({ wife: 1, son: 3 });

    expect(shareOf(r, "son")).toBeCloseTo(3 / 4);
    expect(shareOf(r, "wife")).toBeCloseTo(1 / 4);
  });

  it("excludes the father from the simplified Class I set", () => {
    // Documented as an omission, not an oversight — assert it stays deliberate.
    expect(shareOf(hindu({ father: 1, son: 1 }), "father")).toBe(0);
  });

  it("returns nothing rather than dividing by zero when there are no heirs", () => {
    const r = hindu({});

    expect(r.shares).toEqual([]);
  });

  it("distributes the whole estate", () => {
    expect(totalShare(hindu({ wife: 1, son: 2, daughter: 3 }))).toBeCloseTo(1);
  });
});

describe("presentation of a share", () => {
  it("labels a share as the fraction people actually cite", () => {
    const wife = faraiz({ wife: 1, son: 1 }).shares.find((s) => s.relation === "wife");

    expect(wife?.fraction).toBe("1/8");
  });

  it("converts to money only when an estate value is given", () => {
    const withValue = faraiz({ wife: 1, son: 1 }, 8_000_000);
    const without = faraiz({ wife: 1, son: 1 });

    expect(withValue.shares.find((s) => s.relation === "wife")?.amount).toBe(1_000_000);
    expect(without.shares.find((s) => s.relation === "wife")?.amount).toBeUndefined();
  });

  it("reports the head count behind a group's share", () => {
    const sons = faraiz({ son: 3 }).shares.find((s) => s.relation === "son");

    expect(sons?.count).toBe(3);
  });
});
