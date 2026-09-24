import { describe, expect, it } from "vitest";
import { routeGrievance } from "./grievances";
import type { Jurisdiction } from "./types";

const tree = [
  { id: "j-district", parentId: null },
  { id: "j-upazila", parentId: "j-district" },
  { id: "j-mouza", parentId: "j-upazila" },
  { id: "j-other-upazila", parentId: "j-district" },
] as Jurisdiction[];

const officers = [
  { id: "usr-other", jurisdictionId: "j-other-upazila" },
  { id: "usr-upazila", jurisdictionId: "j-upazila" },
];
const admins = [{ id: "usr-admin" }];

describe("routeGrievance", () => {
  it("routes a mouza-level citizen's complaint to the officer of the upazila above", () => {
    expect(routeGrievance("delay", "j-mouza", officers, admins, tree)).toEqual({ assignedOfficerId: "usr-upazila" });
  });

  it("prefers an officer at the filer's own jurisdiction over one higher up", () => {
    const withLocal = [...officers, { id: "usr-mouza", jurisdictionId: "j-mouza" }];
    expect(routeGrievance("technical", "j-mouza", withLocal, admins, tree)).toEqual({ assignedOfficerId: "usr-mouza" });
  });

  it("never routes to an officer outside the filer's chain", () => {
    expect(routeGrievance("delay", "j-mouza", [{ id: "usr-other", jurisdictionId: "j-other-upazila" }], admins, tree)).toEqual({});
  });

  it.each(["staff-conduct", "corruption"] as const)("escalates a %s complaint past the local office to an admin", (category) => {
    expect(routeGrievance(category, "j-mouza", officers, admins, tree)).toEqual({ escalatedToId: "usr-admin" });
  });
});
