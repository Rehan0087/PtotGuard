import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ParcelsController } from "./parcels.controller";

const officer = {
  id: "usr-officer",
  name: "Nasrin Akter",
  role: "land-office",
  status: "active",
  jurisdictionId: "j-debidwar",
};

const jurisdictions = [
  { id: "j-cumilla", code: "CUM", name: "Cumilla", nameBn: null, level: "division", parentId: null },
  { id: "j-debidwar", code: "CUM-DEB", name: "Debidwar", nameBn: null, level: "upazila", parentId: "j-cumilla" },
  { id: "j-rajamehar", code: "CUM-DEB-RAJ", name: "Rajamehar", nameBn: null, level: "mouza", parentId: "j-debidwar" },
  { id: "j-daudkandi", code: "CUM-DAU", name: "Daudkandi", nameBn: null, level: "upazila", parentId: "j-cumilla" },
];

const parcel = {
  id: "p-1",
  ulpin: "ILR-CUM-DEB-000001",
  dagNo: "CS-142/3",
  khatianNo: "512",
  title: "Paddy field",
  jurisdictionId: "j-rajamehar",
  landUse: "agricultural",
  area: { value: 82, unit: "decimal" },
  ownerId: "usr-owner",
  owner: {
    id: "usr-owner",
    name: "Ayesha Siddika",
    nationalId: "1990123454821",
    profileDetails: { address: "Rajamehar, Debidwar" },
  },
  ownershipType: "sole",
  registryStatus: "verified",
  centroid: { lat: 23.5, lng: 90.9 },
  boundary: null,
  marketValue: null,
  registeredAt: new Date("2015-07-20T00:00:00Z"),
  lastMutationAt: null,
};

function requestFor(role: string) {
  return { header: (name: string) => (name === "x-plotguard-role" ? role : undefined) } as never;
}

function listPrisma() {
  const findMany = vi.fn().mockResolvedValue([]);
  return {
    prisma: {
      user: { findUnique: vi.fn().mockResolvedValue(officer) },
      jurisdiction: { findMany: vi.fn().mockResolvedValue(jurisdictions) },
      parcel: { findMany, count: vi.fn().mockResolvedValue(0) },
      dispute: { groupBy: vi.fn().mockResolvedValue([]) },
    },
    findMany,
  };
}

describe("Land Office parcel records", () => {
  it("composes jurisdiction, non-mutation status, and search against parcels with no active mutation", async () => {
    const { prisma, findMany } = listPrisma();
    const controller = new ParcelsController(prisma as never);

    await controller.list(
      { q: "  Ayesha  ", status: "verified", pageSize: "100" },
      requestFor("land-office"),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        jurisdictionId: { in: ["j-debidwar", "j-rajamehar"] },
        registryStatus: "verified",
        mutations: {
          none: { status: { in: ["submitted", "under-primary-verification", "field-investigation", "field-verification-complete", "approved", "awaiting-dcr-payment"] } },
        },
        OR: [
          { dagNo: { contains: "ayesha", mode: "insensitive" } },
          { khatianNo: { contains: "ayesha", mode: "insensitive" } },
          { title: { contains: "ayesha", mode: "insensitive" } },
          { owner: { name: { contains: "ayesha", mode: "insensitive" } } },
          { ulpin: { contains: "AYESHA", mode: "insensitive" } },
        ],
      },
      include: {
        owner: { select: { name: true } },
        mutations: {
          where: { status: { in: ["submitted", "under-primary-verification", "field-investigation", "field-verification-complete", "approved", "awaiting-dcr-payment"] } },
          select: { status: true, disputeId: true },
        },
      },
    });
  });

  it("filters and projects Under mutation from the related active mutation rows", async () => {
    const activeParcel = {
      ...parcel,
      registryStatus: "verified",
      mutations: [{ status: "under-primary-verification", disputeId: null }],
    };
    const findMany = vi.fn().mockResolvedValue([activeParcel]);
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(officer) },
      jurisdiction: { findMany: vi.fn().mockResolvedValue(jurisdictions) },
      parcel: { findMany, count: vi.fn().mockResolvedValue(1) },
      dispute: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const controller = new ParcelsController(prisma as never);

    const result = await controller.list(
      { status: "under-mutation", pageSize: "100" },
      requestFor("land-office"),
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        mutations: {
          some: { status: { in: ["submitted", "under-primary-verification", "field-investigation", "field-verification-complete", "approved", "awaiting-dcr-payment"] } },
        },
      }),
    }));
    expect(result.items).toEqual([
      expect.objectContaining({ id: "p-1", registryStatus: "under-mutation" }),
    ]);
    expect(result.items[0]).not.toHaveProperty("mutations");
  });

  it("rejects record detail outside the officer jurisdiction", async () => {
    const controller = new ParcelsController({
      user: { findUnique: vi.fn().mockResolvedValue(officer) },
      jurisdiction: { findMany: vi.fn().mockResolvedValue(jurisdictions) },
      parcel: { findUnique: vi.fn().mockResolvedValue({ ...parcel, jurisdictionId: "j-daudkandi" }) },
    } as never);

    await expect(
      controller.record("p-outside", requestFor("land-office")),
    ).rejects.toThrow(ForbiddenException);
  });

  it("builds record detail from existing relationships and enriches ownership links", async () => {
    const ownership = [{
      id: "own-1", parcelId: "p-1", ownerId: "usr-owner", ownerName: "Ayesha Siddika",
      acquisitionType: "purchase", fromDate: new Date("2015-07-20T00:00:00Z"), toDate: null,
      documentId: "d-1", mutationId: "m-1",
      mutation: { id: "m-1", mutationNumber: "MUT-2026-00001", status: "approved", type: "sale" },
    }];
    const mutations = [{
      id: "m-1", parcelId: "p-1", mutationNumber: "MUT-2026-00001", status: "approved",
      requestedBy: { name: "Ayesha Siddika" }, assignedOfficer: { name: "Nasrin Akter" },
      approvedBy: { name: "Nasrin Akter" }, rejectedBy: null,
    }];
    const documents = [{ id: "d-1", fileName: "deed.pdf", type: "sale-deed", verificationStatus: "verified" }];
    const auditFindMany = vi.fn().mockResolvedValue([]);
    const disputes = [{ id: "dispute-1", parcelId: "p-1", status: "open" }];
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(officer) },
      jurisdiction: {
        findMany: vi.fn().mockResolvedValue(jurisdictions),
      },
      parcel: { findUnique: vi.fn().mockResolvedValue(parcel) },
      dispute: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue(disputes) },
      ownershipRecord: { findMany: vi.fn().mockResolvedValue(ownership) },
      landDocument: { findMany: vi.fn().mockResolvedValue(documents) },
      mutation: { findMany: vi.fn().mockResolvedValue(mutations) },
      parcelRestriction: { findMany: vi.fn().mockResolvedValue([]) },
      auditEvent: { findMany: auditFindMany },
    };
    const controller = new ParcelsController(prisma as never);

    const detail = await controller.record("p-1", requestFor("land-office"));

    expect(detail.owner).toEqual({
      id: "usr-owner",
      name: "Ayesha Siddika",
      referenceId: "•••• •••• 4821",
      address: "Rajamehar, Debidwar",
    });
    expect(detail.jurisdiction.map((item) => item.id)).toEqual([
      "j-cumilla", "j-debidwar", "j-rajamehar",
    ]);
    expect(detail.ownership[0]).toEqual(expect.objectContaining({
      mutation: expect.objectContaining({ mutationNumber: "MUT-2026-00001" }),
      document: expect.objectContaining({ fileName: "deed.pdf" }),
    }));
    expect(detail.mutations[0]).toEqual(expect.objectContaining({
      applicantName: "Ayesha Siddika",
      responsibleOfficerName: "Nasrin Akter",
    }));
    expect(auditFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { entityType: "parcel", entityId: "p-1" },
          { entityType: "mutation", entityId: { in: ["m-1"] } },
          { entityType: "dispute", entityId: { in: ["dispute-1"] } },
          { entityType: "document", entityId: { in: ["d-1"] } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    expect(detail).toEqual(expect.objectContaining({
      disputes, documents, restrictions: [], audit: [],
    }));
  });

  it("projects record status from current mutation rows and keeps terminal history non-active", async () => {
    const mutationFindMany = vi.fn()
      .mockResolvedValueOnce([{
        id: "m-active", parcelId: "p-1", mutationNumber: "MUT-2026-00002",
        status: "field-investigation", disputeId: null, requestedAt: new Date("2026-09-01T00:00:00Z"),
        requestedBy: { name: "Ayesha Siddika" }, assignedOfficer: { name: "Nasrin Akter" },
        approvedBy: null, rejectedBy: null,
      }])
      .mockResolvedValueOnce([{
        id: "m-rejected", parcelId: "p-1", mutationNumber: "MUT-2026-00003",
        status: "rejected", requestedAt: new Date("2026-09-02T00:00:00Z"),
        requestedBy: { name: "Ayesha Siddika" }, assignedOfficer: { name: "Nasrin Akter" },
        approvedBy: null, rejectedBy: { name: "Nasrin Akter" },
      }]);
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(officer) },
      jurisdiction: { findMany: vi.fn().mockResolvedValue(jurisdictions) },
      parcel: { findUnique: vi.fn().mockResolvedValue(parcel) },
      dispute: { findMany: vi.fn().mockResolvedValue([]) },
      ownershipRecord: { findMany: vi.fn().mockResolvedValue([]) },
      landDocument: { findMany: vi.fn().mockResolvedValue([]) },
      mutation: { findMany: mutationFindMany },
      parcelRestriction: { findMany: vi.fn().mockResolvedValue([]) },
      auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const controller = new ParcelsController(prisma as never);

    const active = await controller.record("p-1", requestFor("land-office"));
    const terminal = await controller.record("p-1", requestFor("land-office"));

    expect(active.parcel.registryStatus).toBe("under-mutation");
    expect(active.mutations[0].mutation.status).toBe("field-investigation");
    expect(terminal.parcel.registryStatus).toBe("verified");
    expect(terminal.mutations[0].mutation.status).toBe("rejected");
  });
});
