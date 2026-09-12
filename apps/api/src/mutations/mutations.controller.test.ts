import "reflect-metadata";
import { ForbiddenException, ValidationPipe } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ValidationError } from "../common/domain-exceptions";
import { CompleteVerificationDto } from "./complete-verification.dto";
import { MutationsController } from "./mutations.controller";
import { MutationDecisionDto } from "./mutation-decision.dto";

const now = new Date("2026-09-12T10:00:00.000Z");
const officer = { id: "usr-officer", name: "Officer", role: "land-office", status: "active", jurisdictionId: "j-office" };
const recipient = { id: "usr-new", name: "New owner", role: "citizen", status: "active" };
const jurisdictions = [
  { id: "j-office", parentId: null },
  { id: "j-local", parentId: "j-office" },
  { id: "j-other", parentId: null },
];
const checks = {
  applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true,
  dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true,
  notes: "  Records verified  ",
};
const request = (role = "land-office") => ({ header: (name: string) => name === "x-plotguard-role" ? role : undefined }) as never;

function fixture(status = "submitted") {
  const mutation = {
    id: "m-1", mutationNumber: "MUT-2026-01300", parcelId: "p-1", parcelDagNo: "42",
    type: "sale", status, fromOwnerId: "usr-old", fromOwnerName: "Old owner",
    toOwnerId: "usr-new", toOwnerName: "New owner", requestedById: "usr-applicant",
    requestedAt: new Date("2026-08-01T10:00:00.000Z"), assignedOfficerId: null as string | null,
    documentIds: ["doc-1"], objections: [] as object[], objectionWindowEndsAt: new Date("2026-09-11T10:00:00.000Z"),
    updatedAt: new Date("2026-09-01T10:00:00.000Z"),
  };
  const parcel = { id: "p-1", dagNo: "42", ownerId: "usr-old", owner: { name: "Old owner" }, jurisdictionId: "j-local" };
  const users = vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === "usr-new" ? recipient : where.id === "usr-applicant" ? { id: "usr-applicant", name: "Applicant" } : officer);
  const tx = {
    mutation: {
      findUnique: vi.fn().mockResolvedValue(mutation),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...mutation, ...data })),
      count: vi.fn().mockResolvedValue(0), create: vi.fn().mockImplementation(async ({ data }) => data),
    },
    parcel: { findUnique: vi.fn().mockResolvedValue(parcel), update: vi.fn().mockResolvedValue(parcel) },
    user: { findUnique: users },
    jurisdiction: { findMany: vi.fn().mockResolvedValue(jurisdictions) },
    policy: { findUnique: vi.fn().mockResolvedValue({ id: "singleton", objectionWindowDays: 15, mutationFeeBdt: 500 }) },
    ownershipRecord: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    mutation: { ...tx.mutation, findUnique: vi.fn().mockResolvedValue(mutation), findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn().mockImplementation(users) },
    parcel: { ...tx.parcel, findUnique: vi.fn().mockResolvedValue(parcel) },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
    landDocument: { findMany: vi.fn().mockResolvedValue([{ id: "doc-1" }]) },
    parcelRestriction: { findMany: vi.fn().mockResolvedValue([]) },
    dispute: { groupBy: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
  };
  const audit = { append: vi.fn().mockResolvedValue(undefined) };
  return { mutation, parcel, tx, prisma, audit, controller: new MutationsController(prisma as never, audit as never) };
}

function noWrites(f: ReturnType<typeof fixture>) {
  expect(f.tx.mutation.update).not.toHaveBeenCalled();
  expect(f.tx.parcel.update).not.toHaveBeenCalled();
  expect(f.tx.ownershipRecord.updateMany).not.toHaveBeenCalled();
  expect(f.tx.ownershipRecord.create).not.toHaveBeenCalled();
  expect(f.audit.append).not.toHaveBeenCalled();
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe("mutation decision DTO", () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = (value: object) => pipe.transform(value, { type: "body", metatype: MutationDecisionDto });

  it("accepts approval with an optional note", async () => {
    await expect(validate({ decision: "approve", approvalNote: "Checked" })).resolves.toMatchObject({ approvalNote: "Checked" });
    await expect(validate({ decision: "approve" })).resolves.toMatchObject({ decision: "approve" });
  });
  it.each([undefined, "", "   ", 12])("requires a nonblank string rejection reason: %s", async (rejectionReason) => {
    await expect(validate({ decision: "reject", rejectionReason })).rejects.toThrow();
  });
  it("accepts rejection with a reason", async () => {
    await expect(validate({ decision: "reject", rejectionReason: "Mismatch" })).resolves.toMatchObject({ rejectionReason: "Mismatch" });
  });
  it.each([{ status: "approved" }, { actorId: "usr-other" }, { decision: "approved" }])("rejects caller-controlled workflow fields: %j", async (extra) => {
    await expect(validate({ decision: "approve", ...extra })).rejects.toThrow();
  });
});

describe("complete verification DTO", () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = (value: object) => pipe.transform(value, { type: "body", metatype: CompleteVerificationDto });

  it("accepts explicit boolean checks and nonblank notes", async () => {
    await expect(validate(checks)).resolves.toMatchObject(checks);
  });

  it.each([
    { ...checks, applicantVerified: undefined },
    { ...checks, deedVerified: "yes" },
    { ...checks, notes: "   " },
  ])("rejects malformed verification evidence: %j", async (body) => {
    await expect(validate(body)).rejects.toThrow();
  });

  it.each([{ status: "objection-period" }, { verifiedById: "usr-other" }])(
    "rejects caller-controlled workflow fields: %j",
    async (extra) => {
      await expect(validate({ ...checks, ...extra })).rejects.toThrow();
    },
  );
});

describe("mutation workflow writes", () => {
  it("claims and starts only a submitted mutation and audits the transition in its transaction", async () => {
    const f = fixture();
    const result = await f.controller.startVerification("m-1", request());
    expect(result.status).toBe("verification");
    expect(f.tx.mutation.findUnique).toHaveBeenCalledWith({ where: { id: "m-1" } });
    expect(f.tx.mutation.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "m-1", status: "submitted", assignedOfficerId: null, updatedAt: f.mutation.updatedAt }),
      data: expect.objectContaining({ status: "verification", assignedOfficerId: "usr-officer", verificationStartedById: "usr-officer", verificationStartedAt: now }),
    });
    expect(f.audit.append).toHaveBeenCalledWith(f.tx, expect.objectContaining({
      action: "status-change", actorId: "usr-officer", entityType: "mutation", entityId: "m-1",
      payload: expect.objectContaining({ actorRole: "land-office", previousStatus: "submitted", newStatus: "verification" }),
    }));
  });

  it("persists all verification evidence and opens the policy-defined objection window", async () => {
    const f = fixture("verification");
    await f.controller.completeVerification("m-1", checks, request());
    expect(f.tx.policy.findUnique).toHaveBeenCalledWith({ where: { id: "singleton" } });
    const { notes: _, ...checklist } = checks;
    expect(f.tx.mutation.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "m-1", status: "verification", updatedAt: f.mutation.updatedAt }),
      data: expect.objectContaining({ status: "objection-period", assignedOfficerId: "usr-officer", verifiedById: "usr-officer", verifiedAt: now,
        verificationChecklist: checklist, verificationNotes: "Records verified", objectionStartDate: now,
        objectionWindowEndsAt: new Date("2026-09-27T10:00:00.000Z") }),
    });
    expect(f.audit.append).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: "status-change", actorId: "usr-officer",
      payload: expect.objectContaining({ previousStatus: "verification", newStatus: "objection-period", note: "Records verified" }) }));
  });

  it.each(["submitted", "objection-period", "approved", "rejected"])("refuses completion from %s without writes", async (status) => {
    const f = fixture(status);
    await expect(f.controller.completeVerification("m-1", checks, request())).rejects.toThrow();
    noWrites(f);
  });
  it.each(["verification", "objection-period", "approved", "rejected"])("refuses verification start from %s without writes", async (status) => {
    const f = fixture(status);
    await expect(f.controller.startVerification("m-1", request())).rejects.toThrow();
    noWrites(f);
  });
  it.each(["verification", "objection-period"])("conflicts when verification start is stale at %s", async (status) => {
    const f = fixture(status);
    const error = await f.controller.startVerification("m-1", request()).catch((caught) => caught as ConflictError);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).getStatus()).toBe(409);
    noWrites(f);
  });
  it("conflicts when verification has already completed", async () => {
    const f = fixture("objection-period");
    const error = await f.controller.completeVerification("m-1", checks, request()).catch((caught) => caught as ConflictError);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).getStatus()).toBe(409);
    noWrites(f);
  });
  it.each([{ ...checks, deedVerified: false }, { ...checks, notes: "   " }])("refuses incomplete verification: %j", async (body) => {
    const f = fixture("verification");
    await expect(f.controller.completeVerification("m-1", body, request())).rejects.toBeInstanceOf(ValidationError);
    noWrites(f);
  });
  it("refuses verification when the policy is missing", async () => {
    const f = fixture("verification");
    f.tx.policy.findUnique.mockResolvedValue(null);
    await expect(f.controller.completeVerification("m-1", checks, request())).rejects.toThrow();
    noWrites(f);
  });

  it("approves atomically with parcel ownership, linked title history and audit", async () => {
    const f = fixture("objection-period");
    f.mutation.objections = [{ id: "o-resolved", status: "resolved" }];
    await f.controller.decide("m-1", { decision: "approve", approvalNote: "  Cleared  " }, request());
    expect(f.tx.mutation.update).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "m-1", status: "objection-period", updatedAt: f.mutation.updatedAt }),
      data: expect.objectContaining({ status: "approved", approvedAt: now, approvedById: "usr-officer", approvalNote: "Cleared", decidedAt: now }) });
    expect(f.tx.parcel.update).toHaveBeenCalledWith({ where: { id: "p-1", ownerId: "usr-old" }, data: { ownerId: "usr-new", lastMutationAt: now } });
    expect(f.tx.ownershipRecord.updateMany).toHaveBeenCalledWith({ where: { parcelId: "p-1", toDate: null }, data: { toDate: now } });
    expect(f.tx.ownershipRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({ parcelId: "p-1", ownerId: "usr-new", ownerName: "New owner", acquisitionType: "purchase", fromDate: now, mutationId: "m-1", documentId: "doc-1" }) });
    expect(f.audit.append).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: "approve", actorId: "usr-officer",
      payload: expect.objectContaining({ previousStatus: "objection-period", newStatus: "approved", note: "Cleared", actorRole: "land-office" }) }));
  });
  it("uses read-committed isolation so the audit tail read gets a post-lock statement snapshot", async () => {
    const f = fixture("objection-period");
    await f.controller.decide("m-1", { decision: "approve" }, request());
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" });
  });
  it.each(["submitted", "verification"])("refuses approval from %s", async (status) => {
    const f = fixture(status);
    await expect(f.controller.decide("m-1", { decision: "approve" }, request())).rejects.toBeInstanceOf(ValidationError);
    noWrites(f);
  });
  it.each(["approved", "rejected"])("conflicts on a second decision after %s", async (status) => {
    const f = fixture(status);
    await expect(f.controller.decide("m-1", { decision: "approve" }, request())).rejects.toBeInstanceOf(ConflictError);
    noWrites(f);
  });
  it.each(["open", undefined])("blocks unresolved and legacy objections: %s", async (status) => {
    const f = fixture("objection-period");
    f.mutation.objections = [{ id: "o-1", status }];
    await expect(f.controller.decide("m-1", { decision: "approve" }, request())).rejects.toBeInstanceOf(ValidationError);
    noWrites(f);
  });
  it.each([new Date("2026-09-12T10:00:00.001Z"), null])("blocks an open or missing objection deadline: %s", async (deadline) => {
    const f = fixture("objection-period");
    Object.assign(f.mutation, { objectionWindowEndsAt: deadline });
    await expect(f.controller.decide("m-1", { decision: "approve" }, request())).rejects.toBeInstanceOf(ValidationError);
    noWrites(f);
  });
  it("permits approval exactly at the objection deadline", async () => {
    const f = fixture("objection-period");
    f.mutation.objectionWindowEndsAt = now;
    await expect(f.controller.decide("m-1", { decision: "approve" }, request())).resolves.toMatchObject({ status: "approved" });
  });
  it("conflicts if the parcel owner no longer matches the filing owner", async () => {
    const f = fixture("objection-period");
    f.tx.parcel.findUnique.mockResolvedValue({ ...f.parcel, ownerId: "usr-changed" });
    await expect(f.controller.decide("m-1", { decision: "approve" }, request())).rejects.toBeInstanceOf(ConflictError);
    noWrites(f);
  });
  it.each([null, { ...recipient, role: "land-office" }, { ...recipient, status: "suspended" }])("rejects invalid proposed owners: %j", async (owner) => {
    const f = fixture("objection-period");
    f.tx.user.findUnique.mockImplementation(async ({ where }) => where.id === "usr-new" ? owner : officer);
    await expect(f.controller.decide("m-1", { decision: "approve" }, request())).rejects.toThrow();
    noWrites(f);
  });
  it.each(["submitted", "verification", "objection-period"])("rejects %s with actor, timestamp, and trimmed reason", async (status) => {
    const f = fixture(status);
    await f.controller.decide("m-1", { decision: "reject", rejectionReason: "  Deed mismatch  " }, request());
    expect(f.tx.mutation.update).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "m-1", status }),
      data: expect.objectContaining({ status: "rejected", rejectedAt: now, rejectedById: "usr-officer", decidedAt: now, rejectionReason: "Deed mismatch" }) });
    expect(f.audit.append).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: "reject",
      payload: expect.objectContaining({ previousStatus: status, newStatus: "rejected", reason: "Deed mismatch" }) }));
    expect(f.tx.parcel.update).not.toHaveBeenCalled();
    expect(f.tx.ownershipRecord.create).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "   "])("refuses rejection without a reason: %s", async (rejectionReason) => {
    const f = fixture();
    await expect(f.controller.decide("m-1", { decision: "reject", rejectionReason }, request())).rejects.toBeInstanceOf(ValidationError);
    noWrites(f);
  });
  it("uses transaction state if another decision occurred after the preflight read", async () => {
    const f = fixture("objection-period");
    f.tx.mutation.findUnique.mockResolvedValue({ ...f.mutation, status: "approved" });
    await expect(f.controller.decide("m-1", { decision: "approve" }, request())).rejects.toBeInstanceOf(ConflictError);
    noWrites(f);
  });
  it.each(["P2025", "P2034"])("reports concurrent writes as conflicts: %s", async (code) => {
    const f = fixture("objection-period");
    f.tx.mutation.update.mockRejectedValue({ code });
    await expect(f.controller.decide("m-1", { decision: "approve" }, request())).rejects.toBeInstanceOf(ConflictError);
    expect(f.audit.append).not.toHaveBeenCalled();
    expect(f.tx.parcel.update).not.toHaveBeenCalled();
  });
  it("propagates an audit failure out of the transaction so all writes roll back", async () => {
    const f = fixture("objection-period");
    f.audit.append.mockRejectedValue(new Error("audit unavailable"));
    await expect(f.controller.decide("m-1", { decision: "approve" }, request())).rejects.toThrow("audit unavailable");
    expect(f.audit.append).toHaveBeenCalledWith(f.tx, expect.any(Object));
  });
});

describe("workflow authorization", () => {
  const actions = [
    ["start", (c: MutationsController) => c.startVerification("m-1", request())],
    ["complete", (c: MutationsController) => c.completeVerification("m-1", checks, request())],
    ["decision", (c: MutationsController) => c.decide("m-1", { decision: "reject", rejectionReason: "Mismatch" }, request())],
  ] as const;
  describe.each(actions)("%s", (_, action) => {
    it.each(["citizen", "suspended", "outside", "assigned"])("rejects %s before starting a transaction", async (caseName) => {
      const f = fixture();
      if (caseName === "citizen") f.prisma.user.findUnique.mockResolvedValue({ ...officer, role: "citizen" });
      if (caseName === "suspended") f.prisma.user.findUnique.mockResolvedValue({ ...officer, status: "suspended" });
      if (caseName === "outside") f.prisma.parcel.findUnique.mockResolvedValue({ ...f.parcel, jurisdictionId: "j-other" });
      if (caseName === "assigned") f.mutation.assignedOfficerId = "usr-other";
      await expect(action(f.controller)).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
      noWrites(f);
    });
    it("rechecks assignment in the transaction", async () => {
      const f = fixture();
      f.tx.mutation.findUnique.mockResolvedValue({ ...f.mutation, assignedOfficerId: "usr-other" });
      await expect(action(f.controller)).rejects.toBeInstanceOf(ForbiddenException);
      noWrites(f);
    });
    it("rechecks actor suspension in the transaction", async () => {
      const f = fixture();
      f.tx.user.findUnique.mockResolvedValue({ ...officer, status: "suspended" });
      await expect(action(f.controller)).rejects.toBeInstanceOf(ForbiddenException);
      noWrites(f);
    });
  });
});

describe("mutation read and filing compatibility", () => {
  it.each(["assigned", "jurisdiction"])("composes %s and status filters", async (scope) => {
    const f = fixture();
    await f.controller.list({ scope, status: "verification" }, request());
    expect(f.prisma.mutation.findMany).toHaveBeenCalledWith({ where: {
      parcel: { jurisdictionId: { in: ["j-office", "j-local"] } }, status: "verification",
      ...(scope === "assigned" ? { assignedOfficerId: "usr-officer" } : {}),
    }, orderBy: { requestedAt: "desc" } });
  });
  it("preserves the citizen's own filings list", async () => {
    const f = fixture();
    await f.controller.list({ scope: "mine" }, request("citizen"));
    expect(f.prisma.mutation.findMany).toHaveBeenCalledWith({ where: { requestedById: "usr-ayesha" }, orderBy: { requestedAt: "desc" } });
  });
  it("captures the registry owner on citizen filing", async () => {
    const f = fixture();
    await f.controller.create({ parcelId: "p-1", toOwnerId: "usr-new", type: "sale", paymentMethod: "bkash" }, request("citizen"));
    expect(f.tx.mutation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "submitted", fromOwnerId: "usr-old", fromOwnerName: "Old owner", requestedById: "usr-ayesha" }) });
  });
  it("derives detail from real users, documents, parcel and chronological audit events", async () => {
    const f = fixture("verification");
    f.mutation.assignedOfficerId = "usr-officer";
    f.prisma.auditEvent.findMany.mockResolvedValue([
      { id: "au-1", action: "create", createdAt: new Date("2026-08-01T10:00:00.000Z"), actorName: "Applicant", payload: {} },
      { id: "au-2", action: "status-change", createdAt: now, actorName: "Officer", payload: { actorRole: "land-office", previousStatus: "submitted", newStatus: "verification", note: "Assigned" } },
      { id: "au-3", action: "update", createdAt: now, actorName: null, payload: null },
    ]);
    const result = await f.controller.detail("m-1", request("citizen"));
    expect(result).toMatchObject({ mutation: { id: "m-1" }, parcel: { id: "p-1", ownerName: "Old owner" }, documents: [{ id: "doc-1" }],
      applicant: { id: "usr-applicant", name: "Applicant" }, assignedOfficer: { id: "usr-officer", name: "Officer" },
      timeline: [
        { id: "au-1", action: "create", at: "2026-08-01T10:00:00.000Z", actorName: "Applicant" },
        { id: "au-2", action: "status-change", at: "2026-09-12T10:00:00.000Z", actorName: "Officer", actorRole: "land-office", previousStatus: "submitted", newStatus: "verification", note: "Assigned" },
        { id: "au-3", action: "update", actorName: "System" },
      ] });
    expect(f.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "usr-applicant" },
      select: { id: true, name: true, title: true },
    });
    expect(f.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "usr-officer" },
      select: { id: true, name: true, title: true },
    });
    expect(f.prisma.auditEvent.findMany).toHaveBeenCalledWith({ where: { entityType: "mutation", entityId: "m-1" }, orderBy: { createdAt: "asc" } });
  });
});
