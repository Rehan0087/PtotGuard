import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  assertLandOfficeActor,
  assertMutationActionAccess,
  coveredJurisdictionIds,
  loadMutationReadActor,
  loadMutationActor,
} from "./mutation-access";
import { MutationsController } from "./mutations.controller";

const officer = {
  id: "usr-officer",
  role: "land-office",
  status: "active",
  jurisdictionId: "j-debidwar",
};

const jurisdictions = [
  { id: "j-cumilla", code: "CUM", name: "Cumilla", level: "division", parentId: null },
  { id: "j-debidwar", code: "CUM-DEB", name: "Debidwar", level: "district", parentId: "j-cumilla" },
  { id: "j-rajamehar", code: "CUM-DEB-RAJ", name: "Rajamehar", level: "upazila", parentId: "j-debidwar" },
  { id: "j-daudkandi", code: "CUM-DAU", name: "Daudkandi", level: "district", parentId: "j-cumilla" },
];

function requestFor(role: string) {
  return { header: (name: string) => (name === "x-plotguard-role" ? role : undefined) } as never;
}

function prismaFor(actor: object | null) {
  return { user: { findUnique: async () => actor } } as never;
}

describe("mutation access", () => {
  it("loads an active Land Office actor from the authenticated database user", async () => {
    await expect(loadMutationActor(prismaFor(officer), requestFor("land-office"))).resolves.toEqual(officer);
  });

  it("loads an active citizen for mutation reads from the database identity", async () => {
    const citizen = { ...officer, id: "usr-citizen", role: "citizen" };
    await expect(loadMutationReadActor(prismaFor(citizen), requestFor("land-office")))
      .resolves.toEqual(citizen);
  });

  it.each([
    { ...officer, role: "admin" },
    { ...officer, status: "suspended" },
    null,
  ])("rejects unsupported, inactive, or missing read actors: %j", async (actor) => {
    await expect(loadMutationReadActor(prismaFor(actor), requestFor("citizen")))
      .rejects.toThrow(ForbiddenException);
  });

  it("rejects an unsupported role selector before falling back to a citizen identity", async () => {
    await expect(loadMutationReadActor(prismaFor(officer), requestFor("auditor")))
      .rejects.toThrow(ForbiddenException);
  });

  it("rejects a citizen actor", () => {
    expect(() => assertLandOfficeActor({ ...officer, role: "citizen" })).toThrow(ForbiddenException);
  });

  it("rejects a suspended Land Office actor", () => {
    expect(() => assertLandOfficeActor({ ...officer, status: "suspended" })).toThrow(ForbiddenException);
  });

  it("covers the officer's jurisdiction and its descendants", () => {
    expect(coveredJurisdictionIds(officer, jurisdictions)).toEqual(
      new Set(["j-debidwar", "j-rajamehar"]),
    );
  });

  it("excludes a sibling jurisdiction", () => {
    expect(coveredJurisdictionIds(officer, jurisdictions)).not.toContain("j-daudkandi");
  });

  it("allows an action on a mutation assigned to the same officer", () => {
    expect(() => assertMutationActionAccess(officer, { assignedOfficerId: "usr-officer" })).not.toThrow();
  });

  it("allows an action on an unassigned mutation", () => {
    expect(() => assertMutationActionAccess(officer, { assignedOfficerId: null })).not.toThrow();
  });

  it("rejects an action on a mutation assigned to another officer", () => {
    expect(() => assertMutationActionAccess(officer, { assignedOfficerId: "usr-other" })).toThrow(
      ForbiddenException,
    );
  });

  it("limits a Land Office list to the officer's jurisdiction subtree", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = new MutationsController(
      {
        user: { findUnique: vi.fn().mockResolvedValue(officer) },
        jurisdiction: { findMany: vi.fn().mockResolvedValue(jurisdictions) },
        mutation: { findMany },
      } as never,
      {} as never,
    );

    await controller.list({ scope: "assigned" }, requestFor("land-office"));

    expect(findMany).toHaveBeenCalledWith({
      where: {
        parcel: { jurisdictionId: { in: ["j-debidwar", "j-rajamehar"] } },
        assignedOfficerId: "usr-officer",
      },
      orderBy: { requestedAt: "desc" },
    });
  });

  it("rejects a Land Office detail outside the officer's jurisdiction subtree", async () => {
    const controller = new MutationsController(
      {
        user: { findUnique: vi.fn().mockResolvedValue(officer) },
        jurisdiction: { findMany: vi.fn().mockResolvedValue(jurisdictions) },
        mutation: { findUnique: vi.fn().mockResolvedValue({ id: "m-out", parcelId: "p-out", documentIds: [] }) },
        parcel: {
          findUnique: vi.fn().mockResolvedValue({
            id: "p-out",
            jurisdictionId: "j-daudkandi",
            owner: { name: "Outside owner" },
          }),
        },
        dispute: { groupBy: vi.fn().mockResolvedValue([]) },
        landDocument: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
    );

    await expect(controller.detail("m-out", requestFor("land-office"))).rejects.toThrow(ForbiddenException);
  });

  it("forces an omitted citizen scope to the actor's own mutations", async () => {
    const citizen = { ...officer, id: "usr-ayesha", role: "citizen" };
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = new MutationsController(
      { user: { findUnique: vi.fn().mockResolvedValue(citizen) }, mutation: { findMany } } as never,
      {} as never,
    );

    await controller.list({}, requestFor("citizen"));

    expect(findMany).toHaveBeenCalledWith({
      where: { requestedById: "usr-ayesha" },
      orderBy: { requestedAt: "desc" },
    });
  });

  it("ignores a hostile assigned scope for a citizen while retaining status", async () => {
    const citizen = { ...officer, id: "usr-ayesha", role: "citizen" };
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = new MutationsController(
      { user: { findUnique: vi.fn().mockResolvedValue(citizen) }, mutation: { findMany } } as never,
      {} as never,
    );

    await controller.list({ scope: "assigned", status: "approved" }, requestFor("citizen"));

    expect(findMany).toHaveBeenCalledWith({
      where: { requestedById: "usr-ayesha", status: "approved" },
      orderBy: { requestedAt: "desc" },
    });
  });
});
