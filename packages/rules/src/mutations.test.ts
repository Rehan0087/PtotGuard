import { describe, expect, it } from "vitest";
import {
  approvalGate,
  mutationActionGate,
  mutationDocumentGate,
  mutationObjectionSummary,
  mutationVerificationReferences,
  verificationGate,
} from "./mutations";
import type {
  Mutation,
  MutationObjection,
  MutationVerificationChecklist,
} from "./types";

const NOW = new Date("2026-07-20T10:00:00Z");

/** Days from NOW, as the ISO string the record stores. */
function fromNow(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString();
}

function objection(id = "o-1"): MutationObjection {
  return { id, by: "Sohel Rana", at: fromNow(-1), reason: "Boundary disputed." };
}

function completeChecklist(): MutationVerificationChecklist {
  return {
    applicantVerified: true,
    previousOwnerVerified: true,
    proposedOwnerVerified: true,
    dagKhatianVerified: true,
    deedVerified: true,
    landRecordMatched: true,
    documentsPresent: true, khajnaReceiptVerified: true,
  };
}

function mutation(over: Partial<Mutation> = {}): Mutation {
  return {
    id: "m-1",
    mutationNumber: "MUT-2026-01192",
    parcelId: "p-1",
    parcelDagNo: "CS-1",
    type: "sale",
    status: "field-verification-complete",
    fromOwnerName: "Aleya Begum",
    toOwnerId: "usr-2",
    toOwnerName: "Sohel Rana",
    requestedById: "usr-1",
    requestedAt: fromNow(-30),
    documentIds: [],
    objections: [],
    ...over,
  };
}

describe("approvalGate", () => {
  it("approves once the window has closed with no objection standing", () => {
    const gate = approvalGate(
      mutation({ objectionWindowEndsAt: fromNow(-1) }),
      NOW,
    );

    expect(gate.canApprove).toBe(true);
    expect(gate.hold).toBeNull();
  });

  it("holds approval when the mutation has no linked recipient", () => {
    // Pre-existing rows filed before ownership transfer went live.
    const gate = approvalGate(
      mutation({ toOwnerId: undefined, objectionWindowEndsAt: fromNow(-1) }),
      NOW,
    );

    expect(gate.canApprove).toBe(false);
    expect(gate.hold).toEqual({ code: "no-recipient" });
  });

  it("still allows rejecting a mutation with no linked recipient", () => {
    const gate = approvalGate(mutation({ toOwnerId: undefined }), NOW);

    expect(gate.canReject).toBe(true);
  });

  it("does not interrupt approval while a parallel dispute window is open", () => {
    const gate = approvalGate(mutation({ objectionWindowEndsAt: fromNow(3) }), NOW);

    expect(gate.canApprove).toBe(true);
    expect(gate.hold).toBeNull();
  });

  it("still allows rejection during the window", () => {
    // An officer can turn down a bad application without waiting out the clock.
    const gate = approvalGate(mutation({ objectionWindowEndsAt: fromNow(3) }), NOW);

    expect(gate.canReject).toBe(true);
  });

  it("does not interrupt approval for a standing parallel dispute", () => {
    // The clock running out does not settle an objection.
    const gate = approvalGate(
      mutation({ objectionWindowEndsAt: fromNow(-5), objections: [objection()] }),
      NOW,
    );

    expect(gate.canApprove).toBe(true);
    expect(gate.hold).toBeNull();
  });

  it("keeps disputes parallel when both a window and objection exist", () => {
    const gate = approvalGate(
      mutation({ objectionWindowEndsAt: fromNow(3), objections: [objection()] }),
      NOW,
    );

    expect(gate.canApprove).toBe(true);
    expect(gate.hold).toBeNull();
  });

  it("does not turn multiple disputes into a workflow hold", () => {
    const gate = approvalGate(
      mutation({ objections: [objection("o-1"), objection("o-2")] }),
      NOW,
    );

    expect(gate.canApprove).toBe(true);
    expect(gate.hold).toBeNull();
  });

  it("approves when no window was ever set", () => {
    expect(approvalGate(mutation(), NOW).canApprove).toBe(true);
  });

  it.each(["approved", "rejected"] as const)("offers no action on a %s record", (status) => {
    const gate = approvalGate(
      mutation({ status, objections: [objection()], objectionWindowEndsAt: fromNow(3) }),
      NOW,
    );

    expect(gate).toEqual({
      canApprove: false,
      canReject: false,
      hold: null,
      daysToWindowClose: null,
    });
  });

  it("rounds a part-day up, so the last day still reads as a day left", () => {
    // 6 hours remaining is not "0 days" — the window has not closed.
    const gate = approvalGate(
      mutation({ objectionWindowEndsAt: fromNow(0.25) }),
      NOW,
    );

    expect(gate.daysToWindowClose).toBeNull();
    expect(gate.canApprove).toBe(true);
  });

  it("treats the moment of expiry as closed", () => {
    const gate = approvalGate(mutation({ objectionWindowEndsAt: NOW.toISOString() }), NOW);

    expect(gate.daysToWindowClose).toBeNull();
    expect(gate.canApprove).toBe(true);
  });
});
describe("mutation verification references", () => {
  const recipient = { id: "usr-2", role: "citizen", status: "active" };
  const deed = {
    id: "doc-1",
    parcelId: "p-1",
    ownerId: "usr-1",
    type: "sale-deed",
  };

  it("accepts resolved parcel evidence and an active linked recipient", () => {
    expect(mutationVerificationReferences(
      mutation({ documentIds: ["doc-1"] }),
      recipient,
      [deed],
    )).toEqual({ ok: true });
  });

  it.each([
    null,
    { id: "usr-2", role: "land-office", status: "active" },
    { id: "usr-2", role: "citizen", status: "suspended" },
  ])("requires the linked recipient to resolve to an active citizen: %j", (invalidRecipient) => {
    expect(mutationVerificationReferences(mutation({ documentIds: ["doc-1"] }), invalidRecipient, [deed]))
      .toEqual({ ok: false, reason: { code: "invalid-recipient" } });
  });

  it("requires at least one appropriate supporting document", () => {
    expect(mutationVerificationReferences(mutation({ documentIds: [] }), recipient, []))
      .toEqual({ ok: false, reason: { code: "supporting-documents-required" } });
  });

  it("reports every unresolved document id", () => {
    expect(mutationVerificationReferences(
      mutation({ documentIds: ["doc-1", "fabricated"] }),
      recipient,
      [deed],
    )).toEqual({
      ok: false,
      reason: { code: "mutation-documents-missing", documentIds: ["fabricated"] },
    });
  });

  it("rejects parcel documents belonging to another parcel", () => {
    expect(mutationVerificationReferences(
      mutation({ documentIds: ["doc-foreign"] }),
      recipient,
      [{ ...deed, id: "doc-foreign", parcelId: "p-other" }],
    )).toEqual({
      ok: false,
      reason: { code: "mutation-documents-foreign", documentIds: ["doc-foreign"] },
    });
  });

  it("accepts owner-only identity evidence only for a mutation party", () => {
    const ownerOnly = { id: "doc-id", ownerId: "usr-2", type: "id-proof" };
    expect(mutationVerificationReferences(
      mutation({ documentIds: ["doc-1", "doc-id"] }),
      recipient,
      [deed, ownerOnly],
    )).toEqual({ ok: true });

    expect(mutationVerificationReferences(
      mutation({ documentIds: ["doc-1", "doc-id"] }),
      recipient,
      [deed, { ...ownerOnly, ownerId: "usr-stranger" }],
    )).toEqual({
      ok: false,
      reason: { code: "mutation-documents-foreign", documentIds: ["doc-id"] },
    });
  });

  it("requires evidence appropriate to the mutation type", () => {
    expect(mutationVerificationReferences(
      mutation({ documentIds: ["receipt"] }),
      recipient,
      [{ ...deed, id: "receipt", type: "tax-receipt" }],
    )).toEqual({
      ok: false,
      reason: { code: "supporting-document-type-required", expectedTypes: ["sale-deed"] },
    });
  });
});

describe("mutation objection summary", () => {
  it.each([
    [{}, { total: 0, unresolved: 0, status: "not-started" }],
    [{ objectionStartDate: fromNow(-1), objectionWindowEndsAt: fromNow(2) }, { total: 0, unresolved: 0, status: "window-open" }],
    [{ objectionStartDate: fromNow(-4), objectionWindowEndsAt: fromNow(-1), objections: [objection()] as MutationObjection[] }, { total: 1, unresolved: 1, status: "unresolved" }],
    [{ objectionStartDate: fromNow(-4), objectionWindowEndsAt: fromNow(-1), objections: [{ ...objection(), status: "resolved" }] as MutationObjection[] }, { total: 1, unresolved: 0, status: "clear" }],
  ] as const)("computes renderable counts and status for %j", (overrides, expected) => {
    expect(mutationObjectionSummary(mutation(overrides), NOW)).toEqual(expected);
  });
});

describe("mutationActionGate", () => {
  it("allows an unassigned submitted mutation to start verification without a final decision", () => {
    expect(mutationActionGate(mutation({ status: "submitted" }), "usr-officer", NOW)).toMatchObject({
      canStartVerification: true,
      canCompleteVerification: false,
      canApprove: false,
      canReject: false,
    });
  });

  it("allows an assigned verification mutation to be completed without a final decision", () => {
    expect(
      mutationActionGate(
        mutation({ status: "under-primary-verification", assignedOfficerId: "usr-officer" }),
        "usr-officer",
        NOW,
      ),
    ).toMatchObject({
      canStartVerification: false,
      canCompleteVerification: true,
      canApprove: false,
      canReject: false,
    });
  });

  it("allows a closed objection period with only resolved objections to be approved", () => {
    expect(
      mutationActionGate(
        mutation({
          objectionWindowEndsAt: fromNow(-1),
          objections: [{ ...objection(), status: "resolved", resolvedAt: fromNow(-0.5) }],
        }),
        "usr-officer",
        NOW,
      ),
    ).toMatchObject({
      canStartVerification: false,
      canCompleteVerification: false,
      canApprove: true,
      canReject: true,
      hold: null,
    });
  });

  it.each(["submitted", "under-primary-verification", "field-investigation"] as const)(
    "does not allow rejection before the accepted field report from %s",
    (status) => {
      expect(mutationActionGate(mutation({ status }), "usr-officer", NOW).canReject).toBe(false);
    },
  );

  it("blocks every workflow action when another officer owns the assignment", () => {
    expect(
      mutationActionGate(
        mutation({ status: "under-primary-verification", assignedOfficerId: "usr-other-officer" }),
        "usr-officer",
        NOW,
      ),
    ).toMatchObject({
      canStartVerification: false,
      canCompleteVerification: false,
      canApprove: false,
      canReject: false,
      hold: { code: "assigned-to-other-officer" },
    });
  });

  it("keeps approval available while the dispute window runs in parallel", () => {
    expect(
      mutationActionGate(
        mutation({ objectionWindowEndsAt: fromNow(0.25) }),
        "usr-officer",
        NOW,
      ),
    ).toMatchObject({
      canApprove: true,
      canReject: true,
      hold: null,
      daysToWindowClose: null,
    });
  });

  it("keeps approval available when an unresolved dispute exists", () => {
    expect(
      mutationActionGate(
        mutation({ objectionWindowEndsAt: fromNow(-1), objections: [objection()] }),
        "usr-officer",
        NOW,
      ),
    ).toMatchObject({
      canApprove: true,
      canReject: true,
      hold: null,
    });
  });

  it("holds approval when the proposed recipient is absent", () => {
    expect(
      mutationActionGate(
        mutation({ objectionWindowEndsAt: fromNow(-1), toOwnerId: undefined }),
        "usr-officer",
        NOW,
      ),
    ).toMatchObject({
      canApprove: false,
      canReject: true,
      hold: { code: "no-recipient" },
    });
  });

  it("waits for field assignment after primary verification is recorded", () => {
    expect(
      mutationActionGate(
        mutation({
          status: "under-primary-verification",
          assignedOfficerId: "usr-officer",
          verifiedAt: NOW.toISOString(),
        }),
        "usr-officer",
        NOW,
      ),
    ).toMatchObject({
      canCompleteVerification: false,
      hold: { code: "awaiting-field-assignment" },
    });
  });

  it("locks a disputed mutation until mediation is decided", () => {
    expect(
      mutationActionGate(mutation({ disputeId: "ds-1" }), "usr-officer", NOW, "forwarded-to-settlement"),
    ).toMatchObject({
      canApprove: false,
      canReject: false,
      hold: { code: "mediation-pending" },
    });
  });

  it("allows only approval after mediation resolves the dispute", () => {
    expect(
      mutationActionGate(mutation({ disputeId: "ds-1" }), "usr-officer", NOW, "decided"),
    ).toMatchObject({ canApprove: true, canReject: false, hold: null });
  });

  it("allows only rejection when mediation cannot resolve the dispute", () => {
    expect(
      mutationActionGate(mutation({ disputeId: "ds-1" }), "usr-officer", NOW, "rejected"),
    ).toMatchObject({
      canApprove: false,
      canReject: true,
      hold: { code: "mediation-unresolved" },
    });
  });

  it.each(["approved", "rejected"] as const)(
    "offers no workflow action on a terminal %s mutation",
    (status) => {
      expect(mutationActionGate(mutation({ status }), "usr-officer", NOW)).toMatchObject({
        canStartVerification: false,
        canCompleteVerification: false,
        canApprove: false,
        canReject: false,
        hold: { code: "already-decided" },
      });
    },
  );
});

describe("mutationDocumentGate", () => {
  const document = {
    id: "doc-1",
    ocrStatus: "extracted",
    verificationStatus: "unverified",
    fraudScore: 0.04,
  };

  it("holds primary verification while OCR is still running", () => {
    expect(mutationDocumentGate([{ ...document, ocrStatus: "processing" }], "ocr", 0.7))
      .toEqual({ ok: false, reason: { code: "ocr-pending", documentIds: ["doc-1"] } });
  });

  it("routes suspicious documents to fraud review", () => {
    expect(mutationDocumentGate([{ ...document, fraudScore: 0.9 }], "ocr", 0.7))
      .toEqual({ ok: false, reason: { code: "fraud-review-required", documentIds: ["doc-1"] } });
  });

  it("requires officer verification before primary verification completes", () => {
    expect(mutationDocumentGate([document], "officer", 0.7))
      .toEqual({ ok: false, reason: { code: "documents-not-verified", documentIds: ["doc-1"] } });
    expect(mutationDocumentGate([{ ...document, verificationStatus: "verified" }], "officer", 0.7))
      .toEqual({ ok: true });
  });
});

describe("verificationGate", () => {
  it("accepts a complete checklist with meaningful notes", () => {
    expect(verificationGate(completeChecklist(), "Matched against deed")).toEqual({ ok: true });
  });

  it("reports each unchecked verification requirement", () => {
    expect(verificationGate({ ...completeChecklist(), deedVerified: false }, "Checked")).toEqual({
      ok: false,
      reason: { code: "verification-incomplete", missing: ["deedVerified"] },
    });
  });

  it("requires non-whitespace verification notes", () => {
    expect(verificationGate(completeChecklist(), "   ")).toEqual({
      ok: false,
      reason: { code: "verification-notes-required" },
    });
  });
});

