import "reflect-metadata";
import { BadRequestException, ForbiddenException, ValidationPipe } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ValidationError } from "../common/domain-exceptions";
import { CompleteVerificationDto } from "./complete-verification.dto";
import { CreateMutationDto } from "./create-mutation.dto";
import { MutationsController } from "./mutations.controller";
import { MutationDecisionDto } from "./mutation-decision.dto";

const now = new Date("2026-09-12T10:00:00.000Z");
const officer = { id: "usr-officer", name: "Officer", role: "land-office", status: "active", jurisdictionId: "j-office" };
const recipient = { id: "usr-new", name: "New owner", role: "citizen", status: "active" };
const document = {
  id: "doc-1", parcelId: "p-1", ownerId: "usr-applicant", type: "sale-deed",
  fileName: "deed.pdf", mimeType: "application/pdf", sizeBytes: 10,
  uploadedAt: now, uploadedById: "usr-applicant", ocrStatus: "extracted",
  verificationStatus: "verified",
};
const jurisdictions = [
  { id: "j-office", parentId: null },
  { id: "j-local", parentId: "j-office" },
  { id: "j-other", parentId: null },
];
const checks = {
  applicantVerified: true, previousOwnerVerified: true, proposedOwnerVerified: true,
  dagKhatianVerified: true, deedVerified: true, landRecordMatched: true, documentsPresent: true, khajnaReceiptVerified: true,
  notes: "  Records verified  ",
};
const approveBody = {
  decision: "approve" as const,
  approvalNote: "Cleared",
  orderSheet: "Mutation approved after final review.",
  digitalSignature: "usr-officer:approved",
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
    where.id === "usr-new"
      ? recipient
      : ["usr-applicant", "usr-ayesha"].includes(where.id)
        ? { id: where.id, name: "Applicant", role: "citizen", status: "active", jurisdictionId: "j-local" }
        : officer);
  const tx = {
    mutation: {
      findUnique: vi.fn().mockResolvedValue(mutation),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...mutation, ...data })),
      count: vi.fn().mockResolvedValue(0), create: vi.fn().mockImplementation(async ({ data }) => data),
    },
    parcel: { findUnique: vi.fn().mockResolvedValue(parcel), update: vi.fn().mockResolvedValue(parcel) },
    user: { findUnique: users },
    jurisdiction: {
      findMany: vi.fn().mockResolvedValue(jurisdictions),
      findUnique: vi.fn().mockResolvedValue({ id: "j-local", code: "LOC", name: "Local", nameBn: "স্থানীয়" }),
    },
    policy: { findUnique: vi.fn().mockResolvedValue({ id: "singleton", objectionWindowDays: 15, mutationFeeBdt: 500 }) },
    ownershipRecord: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn().mockResolvedValue({}) },
    landDocument: { findMany: vi.fn().mockResolvedValue([document]) },
    fieldReport: { findFirst: vi.fn().mockResolvedValue({ id: "fr-1", status: "completed", reviewedAt: now, disputeFound: false }) },
    appNotification: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    mutation: { ...tx.mutation, findUnique: vi.fn().mockResolvedValue(mutation), findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn().mockImplementation(users) },
    parcel: { ...tx.parcel, findUnique: vi.fn().mockResolvedValue(parcel) },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
    landDocument: { findMany: vi.fn().mockResolvedValue([document]) },
    parcelRestriction: { findMany: vi.fn().mockResolvedValue([]) },
    dispute: { groupBy: vi.fn().mockResolvedValue([]) },
    fieldReport: { findFirst: vi.fn().mockResolvedValue(null) },
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
  expect(f.tx.appNotification.create).not.toHaveBeenCalled();
  expect(f.audit.append).not.toHaveBeenCalled();
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe("create mutation DTO", () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = (value: object) => pipe.transform(value, { type: "body", metatype: CreateMutationDto });
  const valid = { parcelId: "p-1", type: "sale", toOwnerId: "usr-new", paymentMethod: "bkash" };

  it("accepts supporting document id arrays", async () => {
    await expect(validate({ ...valid, documentIds: ["doc-1", "doc-2"] })).resolves.toMatchObject({
      documentIds: ["doc-1", "doc-2"],
    });
  });

  it("treats null optional filing fields as absent", async () => {
    await expect(validate({ ...valid, deedNumber: null, deedDate: null, documentIds: null })).resolves.toMatchObject(valid);
  });

  it.each(["doc-1", ["doc-1", 2], [null]])("rejects malformed document ids with 400: %j", async (documentIds) => {
    const error = await validate({ ...valid, documentIds }).catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
  });
});
describe("mutation decision DTO", () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = (value: object) => pipe.transform(value, { type: "body", metatype: MutationDecisionDto });

  it("accepts approval with an optional note", async () => {
    await expect(validate({ ...approveBody, approvalNote: "Checked" })).resolves.toMatchObject({ approvalNote: "Checked" });
    await expect(validate(approveBody)).resolves.toMatchObject({ decision: "approve" });
    await expect(validate({ ...approveBody, approvalNote: null })).resolves.toMatchObject({ decision: "approve" });
  });
  it.each([undefined, "", "   ", 12])("requires a nonblank string rejection reason: %s", async (rejectionReason) => {
    await expect(validate({ decision: "reject", rejectionReason })).rejects.toThrow();
  });
  it("accepts rejection with a reason", async () => {
    await expect(validate({ decision: "reject", rejectionReason: "Mismatch" })).resolves.toMatchObject({ rejectionReason: "Mismatch" });
  });
  it.each([{ status: "approved" }, { actorId: "usr-other" }, { decision: "approved" }])("rejects caller-controlled workflow fields: %j", async (extra) => {
    await expect(validate({ ...approveBody, ...extra })).rejects.toThrow();
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

  it.each([{ status: "field-investigation" }, { verifiedById: "usr-other" }])(
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
    expect(result.status).toBe("under-primary-verification");
    expect(f.tx.mutation.findUnique).toHaveBeenCalledWith({ where: { id: "m-1" } });
    expect(f.tx.mutation.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "m-1", status: "submitted", assignedOfficerId: null, updatedAt: f.mutation.updatedAt }),
      data: expect.objectContaining({ status: "under-primary-verification", assignedOfficerId: "usr-officer", verificationStartedById: "usr-officer", verificationStartedAt: now }),
    });
    expect(f.audit.append).toHaveBeenCalledWith(f.tx, expect.objectContaining({
      action: "status-change", actorId: "usr-officer", entityType: "mutation", entityId: "m-1",
      payload: expect.objectContaining({ actorRole: "land-office", previousStatus: "submitted", newStatus: "under-primary-verification" }),
    }));
  });

  it("persists all verification evidence and opens the policy-defined objection window", async () => {
    const f = fixture("under-primary-verification");
    await f.controller.completeVerification("m-1", checks, request());
    expect(f.tx.policy.findUnique).toHaveBeenCalledWith({ where: { id: "singleton" } });
    const checklist = { ...checks };
    delete (checklist as { notes?: string }).notes;
    expect(f.tx.mutation.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "m-1", status: "under-primary-verification", updatedAt: f.mutation.updatedAt }),
      data: expect.objectContaining({ status: "under-primary-verification", assignedOfficerId: "usr-officer", verifiedById: "usr-officer", verifiedAt: now,
        verificationChecklist: checklist, verificationNotes: "Records verified", objectionStartDate: now,
        objectionWindowEndsAt: new Date("2026-09-27T10:00:00.000Z") }),
    });
    expect(f.audit.append).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: "status-change", actorId: "usr-officer",
      payload: expect.objectContaining({ previousStatus: "under-primary-verification", newStatus: "under-primary-verification", note: "Records verified" }) }));
  });

  it.each([
    ["missing recipient", null, [document], "invalid-recipient"],
    ["missing document", recipient, [], "mutation-documents-missing"],
    ["partial document set", recipient, [document], "mutation-documents-missing"],
    ["foreign parcel document", recipient, [{ ...document, parcelId: "p-other" }], "mutation-documents-foreign"],
  ] as const)("refuses completion with %s", async (_case, linkedRecipient, documents, code) => {
    const f = fixture("under-primary-verification");
    if (_case === "partial document set") f.mutation.documentIds = ["doc-1", "doc-2"];
    f.tx.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === "usr-new" ? linkedRecipient : officer);
    f.tx.landDocument.findMany.mockResolvedValue(documents);

    const error = await f.controller.completeVerification("m-1", checks, request())
      .catch((caught) => caught as ValidationError);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).getResponse()).toMatchObject({
      error: "validation_failed",
      field: code === "invalid-recipient" ? "toOwnerId" : "documentIds",
      reason: { code },
    });
    noWrites(f);
  });

  it.each(["submitted", "field-investigation", "approved", "rejected"])("refuses completion from %s without writes", async (status) => {
    const f = fixture(status);
    await expect(f.controller.completeVerification("m-1", checks, request())).rejects.toThrow();
    noWrites(f);
  });
  it.each(["under-primary-verification", "field-investigation", "approved", "rejected"])("refuses verification start from %s without writes", async (status) => {
    const f = fixture(status);
    await expect(f.controller.startVerification("m-1", request())).rejects.toThrow();
    noWrites(f);
  });
  it.each(["under-primary-verification", "field-investigation"])("conflicts when verification start is stale at %s", async (status) => {
    const f = fixture(status);
    const error = await f.controller.startVerification("m-1", request()).catch((caught) => caught as ConflictError);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).getStatus()).toBe(409);
    noWrites(f);
  });
  it("conflicts when verification has already completed", async () => {
    const f = fixture("field-investigation");
    const error = await f.controller.completeVerification("m-1", checks, request()).catch((caught) => caught as ConflictError);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).getStatus()).toBe(409);
    noWrites(f);
  });
  it.each([{ ...checks, deedVerified: false }, { ...checks, notes: "   " }])("refuses incomplete verification: %j", async (body) => {
    const f = fixture("under-primary-verification");
    await expect(f.controller.completeVerification("m-1", body, request())).rejects.toBeInstanceOf(ValidationError);
    noWrites(f);
  });
  it("refuses verification when the policy is missing", async () => {
    const f = fixture("under-primary-verification");
    f.tx.policy.findUnique.mockResolvedValue(null);
    await expect(f.controller.completeVerification("m-1", checks, request())).rejects.toThrow();
    noWrites(f);
  });

  it("approves atomically with parcel ownership, linked title history and audit", async () => {
    const f = fixture("field-verification-complete");
    f.mutation.objections = [{ id: "o-resolved", status: "resolved" }];
    await f.controller.decide("m-1", { ...approveBody, approvalNote: "  Cleared  " }, request());
    expect(f.tx.mutation.update).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "m-1", status: "field-verification-complete", updatedAt: f.mutation.updatedAt }),
      data: expect.objectContaining({ status: "awaiting-dcr-payment", approvedAt: now, approvedById: "usr-officer", approvalNote: "Cleared", orderSheet: approveBody.orderSheet, digitalSignature: approveBody.digitalSignature }) });
    expect(f.tx.parcel.update).toHaveBeenCalledWith({ where: { id: "p-1", ownerId: "usr-old" }, data: { ownerId: "usr-new", lastMutationAt: now } });
    expect(f.tx.ownershipRecord.updateMany).toHaveBeenCalledWith({ where: { parcelId: "p-1", toDate: null }, data: { toDate: now } });
    expect(f.tx.ownershipRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({ parcelId: "p-1", ownerId: "usr-new", ownerName: "New owner", acquisitionType: "purchase", fromDate: now, mutationId: "m-1", documentId: "doc-1" }) });
    expect(f.audit.append).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: "approve", actorId: "usr-officer",
      payload: expect.objectContaining({ previousStatus: "field-verification-complete", newStatus: "awaiting-dcr-payment", note: "Cleared", actorRole: "land-office" }) }));
  });
  it("uses read-committed isolation so the audit tail read gets a post-lock statement snapshot", async () => {
    const f = fixture("field-verification-complete");
    await f.controller.decide("m-1", approveBody, request());
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" });
  });
  it.each(["submitted", "under-primary-verification"])("refuses approval from %s", async (status) => {
    const f = fixture(status);
    await expect(f.controller.decide("m-1", approveBody, request())).rejects.toBeInstanceOf(ValidationError);
    noWrites(f);
  });
  it.each(["approved", "rejected"])("conflicts on a second decision after %s", async (status) => {
    const f = fixture(status);
    await expect(f.controller.decide("m-1", approveBody, request())).rejects.toBeInstanceOf(ConflictError);
    noWrites(f);
  });
  it.each(["open", undefined])("keeps unresolved disputes parallel to approval: %s", async (status) => {
    const f = fixture("field-verification-complete");
    f.mutation.objections = [{ id: "o-1", status }];
    await expect(f.controller.decide("m-1", approveBody, request())).resolves.toMatchObject({ status: "awaiting-dcr-payment" });
  });
  it.each([new Date("2026-09-12T10:00:00.001Z"), null])("does not block for an open or missing legacy objection deadline: %s", async (deadline) => {
    const f = fixture("field-verification-complete");
    Object.assign(f.mutation, { objectionWindowEndsAt: deadline });
    await expect(f.controller.decide("m-1", approveBody, request())).resolves.toMatchObject({ status: "awaiting-dcr-payment" });
  });
  it("permits approval exactly at the objection deadline", async () => {
    const f = fixture("field-verification-complete");
    f.mutation.objectionWindowEndsAt = now;
    await expect(f.controller.decide("m-1", approveBody, request())).resolves.toMatchObject({ status: "awaiting-dcr-payment" });
  });
  it("conflicts if the parcel owner no longer matches the filing owner", async () => {
    const f = fixture("field-verification-complete");
    f.tx.parcel.findUnique.mockResolvedValue({ ...f.parcel, ownerId: "usr-changed" });
    await expect(f.controller.decide("m-1", approveBody, request())).rejects.toBeInstanceOf(ConflictError);
    noWrites(f);
  });
  it.each([null, { ...recipient, role: "land-office" }, { ...recipient, status: "suspended" }])("rejects invalid proposed owners: %j", async (owner) => {
    const f = fixture("field-verification-complete");
    f.tx.user.findUnique.mockImplementation(async ({ where }) => where.id === "usr-new" ? owner : officer);
    await expect(f.controller.decide("m-1", approveBody, request())).rejects.toThrow();
    noWrites(f);
  });
  it("rejects after the field investigation is accepted, with actor, timestamp, and trimmed reason", async () => {
    const status = "field-verification-complete";
    const f = fixture(status);
    await f.controller.decide("m-1", { decision: "reject", rejectionReason: "  Deed mismatch  " }, request());
    expect(f.tx.mutation.update).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "m-1", status }),
      data: expect.objectContaining({ status: "rejected", rejectedAt: now, rejectedById: "usr-officer", decidedAt: now, rejectionReason: "Deed mismatch" }) });
    expect(f.audit.append).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: "reject",
      payload: expect.objectContaining({ previousStatus: status, newStatus: "rejected", reason: "Deed mismatch" }) }));
    expect(f.tx.parcel.update).not.toHaveBeenCalled();
    expect(f.tx.ownershipRecord.create).not.toHaveBeenCalled();
  });
  it.each(["submitted", "under-primary-verification", "field-investigation"])("refuses final rejection before field review from %s", async (status) => {
    const f = fixture(status);
    await expect(f.controller.decide("m-1", { decision: "reject", rejectionReason: "Deed mismatch" }, request()))
      .rejects.toBeInstanceOf(ValidationError);
    noWrites(f);
  });
  it.each([undefined, "", "   "])("refuses rejection without a reason: %s", async (rejectionReason) => {
    const f = fixture();
    await expect(f.controller.decide("m-1", { decision: "reject", rejectionReason }, request())).rejects.toBeInstanceOf(ValidationError);
    noWrites(f);
  });
  it("uses transaction state if another decision occurred after the preflight read", async () => {
    const f = fixture("field-verification-complete");
    f.tx.mutation.findUnique.mockResolvedValue({ ...f.mutation, status: "approved" });
    await expect(f.controller.decide("m-1", approveBody, request())).rejects.toBeInstanceOf(ConflictError);
    noWrites(f);
  });
  it.each(["P2025", "P2034"])("reports concurrent writes as conflicts: %s", async (code) => {
    const f = fixture("field-verification-complete");
    f.tx.mutation.update.mockRejectedValue({ code });
    await expect(f.controller.decide("m-1", approveBody, request())).rejects.toBeInstanceOf(ConflictError);
    expect(f.audit.append).not.toHaveBeenCalled();
    expect(f.tx.parcel.update).not.toHaveBeenCalled();
  });
  it("propagates an audit failure out of the transaction so all writes roll back", async () => {
    const f = fixture("field-verification-complete");
    f.audit.append.mockRejectedValue(new Error("audit unavailable"));
    await expect(f.controller.decide("m-1", approveBody, request())).rejects.toThrow("audit unavailable");
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
    await f.controller.list({ scope, status: "under-primary-verification" }, request());
    expect(f.prisma.mutation.findMany).toHaveBeenCalledWith({ where: {
      parcel: { jurisdictionId: { in: ["j-office", "j-local"] } }, status: "under-primary-verification",
      ...(scope === "assigned" ? { assignedOfficerId: "usr-officer" } : {}),
    }, orderBy: { requestedAt: "desc" } });
  });
  it("preserves the citizen's own filings list", async () => {
    const f = fixture();
    await f.controller.list({ scope: "mine" }, request("citizen"));
    expect(f.prisma.mutation.findMany).toHaveBeenCalledWith({ where: { requestedById: "usr-ayesha" }, orderBy: { requestedAt: "desc" } });
  });
  it("forbids a citizen from reading another applicant's mutation detail", async () => {
    const f = fixture();
    await expect(f.controller.detail("m-1", request("citizen")))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prisma.landDocument.findMany).not.toHaveBeenCalled();
  });
  it("allows a citizen to read their own mutation detail", async () => {
    const f = fixture();
    f.mutation.requestedById = "usr-ayesha";
    await expect(f.controller.detail("m-1", request("citizen")))
      .resolves.toMatchObject({ mutation: { id: "m-1" } });
  });
  it("captures the registry owner on citizen filing", async () => {
    const f = fixture();
    await f.controller.create({ parcelId: "p-1", toOwnerId: "usr-new", type: "sale", paymentMethod: "bkash" }, request("citizen"));
    expect(f.tx.mutation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "submitted", fromOwnerId: "usr-old", fromOwnerName: "Old owner", requestedById: "usr-ayesha" }) });
  });
  it("derives detail from real users, documents, parcel and chronological audit events", async () => {
    const f = fixture("under-primary-verification");
    f.mutation.assignedOfficerId = "usr-officer";
    f.prisma.auditEvent.findMany.mockResolvedValue([
      { id: "au-1", action: "create", createdAt: new Date("2026-08-01T10:00:00.000Z"), actorName: "Applicant", payload: {} },
      { id: "au-2", action: "status-change", createdAt: now, actorName: "Officer", payload: { actorRole: "land-office", previousStatus: "submitted", newStatus: "under-primary-verification", note: "Assigned" } },
      { id: "au-3", action: "update", createdAt: now, actorName: null, payload: null },
    ]);
    f.mutation.requestedById = "usr-ayesha";
    Object.assign(f.mutation, {
      verificationStartedById: "usr-officer",
      verifiedById: "usr-officer",
      objectionStartDate: new Date("2026-09-01T10:00:00.000Z"),
    });
    f.mutation.objections = [{ id: "o-open", status: "open" }, { id: "o-done", status: "resolved" }];
    const result = await f.controller.detail("m-1", request("citizen"));
    expect(result).toMatchObject({ mutation: { id: "m-1" }, parcel: { id: "p-1", ownerName: "Old owner" }, documents: [{ id: "doc-1" }],
      applicant: { id: "usr-ayesha" }, assignedOfficer: { id: "usr-officer", name: "Officer" },
      verificationStartedBy: { id: "usr-officer", name: "Officer" },
      verifiedBy: { id: "usr-officer", name: "Officer" },
      objectionSummary: { total: 2, unresolved: 1, status: "unresolved" },
      timeline: [
        { id: "au-1", action: "create", at: "2026-08-01T10:00:00.000Z", actorName: "Applicant" },
        { id: "au-2", action: "status-change", at: "2026-09-12T10:00:00.000Z", actorName: "Officer", actorRole: "land-office", previousStatus: "submitted", newStatus: "under-primary-verification", note: "Assigned" },
        { id: "au-3", action: "update", actorName: "System" },
      ] });
    expect(f.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "usr-ayesha" },
      select: { id: true, name: true, title: true },
    });
    expect(f.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "usr-officer" },
      select: { id: true, name: true, title: true },
    });
    expect(f.prisma.auditEvent.findMany).toHaveBeenCalledWith({ where: { entityType: "mutation", entityId: "m-1" }, orderBy: { createdAt: "asc" } });
  });
});

