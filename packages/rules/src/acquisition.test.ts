import { describe, expect, it } from "vitest";
import type { AcquisitionDetails } from "./types";
import { acquisitionTransition, validIncreasedAward } from "./acquisition";

const details = (stage: AcquisitionDetails["stage"]): AcquisitionDetails => ({
  stage,
  purpose: "Road widening",
  createdByOfficerId: "officer",
  assignedFieldAgentId: "agent",
});

describe("acquisitionTransition", () => {
  it("moves only the assigned investigation through field review", () => {
    expect(acquisitionTransition(details("field-review"), "field-investigation", "field-review").allowed).toBe(true);
    expect(acquisitionTransition(details("field-review"), "under-review", "field-review").allowed).toBe(false);
  });

  it("lets the citizen accept or appeal only after valuation", () => {
    for (const action of ["citizen-accept", "citizen-appeal"] as const) {
      expect(acquisitionTransition(details("citizen-decision"), "under-review", action).allowed).toBe(true);
      expect(acquisitionTransition(details("appeal-review"), "hearing-scheduled", action).allowed).toBe(false);
    }
  });

  it("reserves appeal decisions for the appeal stage", () => {
    for (const action of ["appeal-withdraw", "appeal-increase-compensation", "appeal-proceed"] as const) {
      expect(acquisitionTransition(details("appeal-review"), "hearing-scheduled", action).allowed).toBe(true);
    }
  });
});

describe("validIncreasedAward", () => {
  it("requires a strictly higher positive award", () => {
    expect(validIncreasedAward(100, 101)).toBe(true);
    expect(validIncreasedAward(100, 100)).toBe(false);
    expect(validIncreasedAward(100, 90)).toBe(false);
    expect(validIncreasedAward(undefined, 120)).toBe(false);
  });
});
