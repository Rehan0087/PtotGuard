import { describe, expect, it, vi } from "vitest";
import { LandOfficeDashboardController } from "./land-office-dashboard.controller";

const officer = {
  id: "usr-officer",
  name: "Nasrin Akter",
  title: "Sub-Registrar",
  role: "land-office",
  status: "active",
  jurisdictionId: "j-debidwar",
};

const jurisdictions = [
  { id: "j-cumilla", parentId: null },
  { id: "j-debidwar", parentId: "j-cumilla", name: "Debidwar Upazila" },
  { id: "j-rajamehar", parentId: "j-debidwar" },
  { id: "j-outside", parentId: "j-cumilla" },
];

const request = { user: { id: officer.id, role: officer.role }, header: () => undefined } as never;

describe("Land Office dashboard", () => {
  it("derives every queue from the officer's jurisdiction-scoped database rows", async () => {
    const mutationFindMany = vi.fn().mockResolvedValue([
      { id: "m-primary", status: "under-primary-verification", requestedAt: new Date("2026-09-03") },
      { id: "m-field", status: "field-investigation", requestedAt: new Date("2026-09-02") },
      { id: "m-done", status: "complete", requestedAt: new Date("2026-09-01") },
    ]);
    const activity = [{ id: "au-1", actorId: officer.id, createdAt: new Date("2026-09-04") }];
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(officer) },
      jurisdiction: {
        findMany: vi.fn().mockResolvedValue(jurisdictions),
        findUnique: vi.fn().mockResolvedValue(jurisdictions[1]),
      },
      parcel: { findMany: vi.fn().mockResolvedValue([{ id: "p-1" }, { id: "p-2" }]) },
      mutation: { findMany: mutationFindMany },
      dispute: { findMany: vi.fn().mockResolvedValue([
        { id: "ds-open", status: "under-review", filedAt: new Date("2026-09-03") },
        { id: "ds-done", status: "resolved", filedAt: new Date("2026-09-01") },
      ]) },
      landDocument: { findMany: vi.fn().mockResolvedValue([
        { id: "d-review", ocrStatus: "extracted", verificationStatus: "unverified", uploadedAt: new Date("2026-09-03") },
        { id: "d-flag", ocrStatus: "extracted", verificationStatus: "flagged", uploadedAt: new Date("2026-09-02") },
      ]) },
      fieldReport: { findMany: vi.fn().mockResolvedValue([
        { id: "fr-1", mutationId: "m-field", status: "assigned", assignedAt: new Date("2026-09-03") },
      ]) },
      serviceApplication: { findMany: vi.fn().mockResolvedValue([
        { id: "sa-open", serviceType: "revenue-case", status: "under-review", createdAt: new Date("2026-09-03") },
        { id: "sa-paid", serviceType: "land-tax", status: "approved", createdAt: new Date("2026-09-02") },
      ]) },
      auditEvent: { findMany: vi.fn().mockResolvedValue(activity) },
    };
    const controller = new LandOfficeDashboardController(prisma as never);

    const result = await controller.dashboard(request);

    expect(mutationFindMany).toHaveBeenCalledWith({
      where: { parcel: { jurisdictionId: { in: ["j-debidwar", "j-rajamehar"] } } },
      orderBy: { requestedAt: "desc" },
    });
    expect(result.officer).toEqual(expect.objectContaining({
      name: "Nasrin Akter",
      jurisdictionName: "Debidwar Upazila",
    }));
    expect(result.summary).toEqual({
      recordCount: 2,
      activeMutationCount: 2,
      primaryVerificationCount: 1,
      openDisputeCount: 1,
      documentsToReviewCount: 1,
      fraudFlagCount: 1,
      needsAgentCount: 0,
      activeFieldVisitCount: 1,
      openServiceCount: 1,
    });
    expect(result.serviceCounts).toEqual({ "revenue-case": 1 });
    expect(result.queues.mutations.map((item) => item.id)).toEqual(["m-primary", "m-field"]);
    expect(result.queues.disputes.map((item) => item.id)).toEqual(["ds-open"]);
    expect(result.recentActivity).toEqual(activity);
  });
});
