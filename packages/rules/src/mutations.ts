/**
 * Decision rules for a namjari (mutation). Pure — the backend enforces the
 * same gate server-side, so this is a shared-package candidate alongside
 * lib/inheritance.ts. The UI uses it to explain a hold, never as the only
 * thing standing between a request and an approval.
 */
import type {
  AcquisitionType,
  ID,
  DocumentType,
  Mutation,
  MutationObjection,
  MutationStatus,
  MutationType,
  MutationVerificationChecklist,
  MutationObjectionSummary,
} from "./types";

const DAY_MS = 86_400_000;

/**
 * What an approved mutation actually did to the chain of title, in
 * `OwnershipRecord.acquisitionType` terms. A correction isn't a transfer —
 * the land didn't change hands, the record naming who held it was wrong —
 * but the type still needs a value, so it gets one of its own rather than
 * being forced into "purchase" or another acquisition that didn't happen.
 */
export const ACQUISITION_TYPE_BY_MUTATION_TYPE: Record<MutationType, AcquisitionType> = {
  sale: "purchase",
  inheritance: "inheritance",
  gift: "gift",
  partition: "partition",
  correction: "correction",
};

export type MutationWorkflowHold =
  | { code: "wrong-status"; expected: MutationStatus[] }
  | { code: "already-decided" }
  | { code: "assigned-to-other-officer" }
  | { code: "objection-window"; days: number }
  | { code: "objections"; count: number }
  | { code: "no-recipient" };

/** @deprecated Use MutationWorkflowHold through mutationActionGate instead. */
export type MutationHold = Extract<
  MutationWorkflowHold,
  { code: "objections" | "objection-window" | "no-recipient" }
>;

export type MutationVerificationFailure =
  | {
      code: "verification-incomplete";
      missing: (keyof MutationVerificationChecklist)[];
    }
  | { code: "verification-notes-required" };

export type MutationVerificationReferenceFailure =
  | { code: "invalid-recipient" }
  | { code: "supporting-documents-required" }
  | { code: "mutation-documents-missing"; documentIds: ID[] }
  | { code: "mutation-documents-foreign"; documentIds: ID[] }
  | { code: "supporting-document-type-required"; expectedTypes: DocumentType[] };

export interface MutationVerificationDocument {
  id: ID;
  parcelId?: ID | null;
  ownerId?: ID | null;
  type: DocumentType | string;
}

export interface MutationVerificationRecipient {
  id: ID;
  role: string;
  status: string;
}

const REQUIRED_DOCUMENT_TYPES: Record<MutationType, DocumentType[]> = {
  sale: ["sale-deed"],
  inheritance: ["inheritance-affidavit"],
  gift: ["title-deed"],
  partition: ["title-deed", "survey-report"],
  correction: ["title-deed", "mutation-order", "court-order"],
};

export interface MutationActionGate {
  canStartVerification: boolean;
  canCompleteVerification: boolean;
  canApprove: boolean;
  canReject: boolean;
  hold: MutationWorkflowHold | null;
  daysToWindowClose: number | null;
}

export interface ApprovalGate {
  canApprove: boolean;
  canReject: boolean;
  /** Reason approval is held. null when nothing blocks it. */
  hold: MutationHold | null;
  /** Whole days until the objection window closes; null once it has. */
  daysToWindowClose: number | null;
}

const VERIFICATION_KEYS: (keyof MutationVerificationChecklist)[] = [
  "applicantVerified",
  "previousOwnerVerified",
  "proposedOwnerVerified",
  "dagKhatianVerified",
  "deedVerified",
  "landRecordMatched",
  "documentsPresent",
  "khajnaReceiptVerified",
];

const ACTIVE_STATUSES: MutationStatus[] = [
  "submitted",
  "under-primary-verification",
  "field-investigation",
  "field-verification-complete",
  "approved",
  "awaiting-dcr-payment",
];

function daysToWindowClose(mutation: Mutation, now: Date): number | null {
  const endsAt = mutation.objectionWindowEndsAt
    ? new Date(mutation.objectionWindowEndsAt)
    : null;
  const msLeft = endsAt ? endsAt.getTime() - now.getTime() : 0;

  return endsAt && msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : null;
}

export function unresolvedObjections(mutation: Mutation): MutationObjection[] {
  return mutation.objections.filter((item) => item.status !== "resolved");
}

export function verificationGate(
  checklist: MutationVerificationChecklist,
  notes: string,
): { ok: true } | { ok: false; reason: MutationVerificationFailure } {
  const missing = VERIFICATION_KEYS.filter((key) => !checklist[key]);

  if (missing.length) {
    return { ok: false, reason: { code: "verification-incomplete", missing } };
  }

  if (!notes.trim()) {
    return { ok: false, reason: { code: "verification-notes-required" } };
  }

  return { ok: true };
}

/** Validate the durable references behind a completed verification checklist. */
export function mutationVerificationReferences(
  mutation: Pick<Mutation, "type" | "parcelId" | "requestedById" | "fromOwnerId" | "toOwnerId" | "documentIds">,
  recipient: MutationVerificationRecipient | null,
  documents: MutationVerificationDocument[],
): { ok: true } | { ok: false; reason: MutationVerificationReferenceFailure } {
  if (
    !mutation.toOwnerId ||
    !recipient ||
    recipient.id !== mutation.toOwnerId ||
    recipient.role !== "citizen" ||
    recipient.status !== "active"
  ) {
    return { ok: false, reason: { code: "invalid-recipient" } };
  }

  if (mutation.documentIds.length === 0) {
    return { ok: false, reason: { code: "supporting-documents-required" } };
  }

  const byId = new Map(documents.map((document) => [document.id, document]));
  const missing = [...new Set(mutation.documentIds.filter((id) => !byId.has(id)))];
  if (missing.length > 0) {
    return { ok: false, reason: { code: "mutation-documents-missing", documentIds: missing } };
  }

  const legitimateOwners = new Set(
    [mutation.requestedById, mutation.fromOwnerId, mutation.toOwnerId].filter(
      (id): id is ID => typeof id === "string" && id.length > 0,
    ),
  );
  const foreign = [...new Set(mutation.documentIds.filter((id) => {
    const document = byId.get(id)!;
    if (document.parcelId) return document.parcelId !== mutation.parcelId;
    return !document.ownerId || !legitimateOwners.has(document.ownerId);
  }))];
  if (foreign.length > 0) {
    return { ok: false, reason: { code: "mutation-documents-foreign", documentIds: foreign } };
  }

  const expectedTypes = REQUIRED_DOCUMENT_TYPES[mutation.type];
  if (!documents.some((document) => expectedTypes.includes(document.type as DocumentType))) {
    return { ok: false, reason: { code: "supporting-document-type-required", expectedTypes } };
  }

  return { ok: true };
}

export function mutationObjectionSummary(
  mutation: Pick<Mutation, "objectionStartDate" | "objectionWindowEndsAt" | "objections">,
  now: Date = new Date(),
): MutationObjectionSummary {
  const unresolved = mutation.objections.filter((item) => item.status !== "resolved").length;
  let status: MutationObjectionSummary["status"];
  if (!mutation.objectionStartDate) status = "not-started";
  else if (mutation.objectionWindowEndsAt && new Date(mutation.objectionWindowEndsAt).getTime() > now.getTime()) {
    status = "window-open";
  } else if (unresolved > 0) status = "unresolved";
  else status = "clear";

  return { total: mutation.objections.length, unresolved, status };
}

export function mutationActionGate(
  mutation: Mutation,
  actorId: ID,
  now: Date = new Date(),
): MutationActionGate {
  if (mutation.status === "approved" || mutation.status === "rejected" || mutation.status === "complete") {
    return {
      canStartVerification: false,
      canCompleteVerification: false,
      canApprove: false,
      canReject: false,
      hold: { code: "already-decided" },
      daysToWindowClose: null,
    };
  }

  const remainingDays = daysToWindowClose(mutation, now);

  if (mutation.assignedOfficerId && mutation.assignedOfficerId !== actorId) {
    return {
      canStartVerification: false,
      canCompleteVerification: false,
      canApprove: false,
      canReject: false,
      hold: { code: "assigned-to-other-officer" },
      daysToWindowClose: remainingDays,
    };
  }

  const canStartVerification = mutation.status === "submitted";
  const canCompleteVerification = mutation.status === "under-primary-verification";
  const canReject = ACTIVE_STATUSES.includes(mutation.status);

  if (mutation.status !== "field-verification-complete") {
    return {
      canStartVerification,
      canCompleteVerification,
      canApprove: false,
      canReject,
      hold: { code: "wrong-status", expected: ["field-verification-complete"] },
      daysToWindowClose: remainingDays,
    };
  }

  if (!mutation.toOwnerId) {
    return {
      canStartVerification,
      canCompleteVerification,
      canApprove: false,
      canReject,
      hold: { code: "no-recipient" },
      daysToWindowClose: remainingDays,
    };
  }

  return {
    canStartVerification,
    canCompleteVerification,
    canApprove: true,
    canReject,
    hold: null,
    daysToWindowClose: null,
  };
}

/**
 * Compatibility projection for existing callers that only render approval
 * state. New workflow consumers should use mutationActionGate.
 */
export function approvalGate(mutation: Mutation, now: Date = new Date()): ApprovalGate {
  const gate = mutationActionGate(mutation, mutation.assignedOfficerId ?? "", now);
  const hold =
    gate.hold?.code === "objections" ||
    gate.hold?.code === "objection-window" ||
    gate.hold?.code === "no-recipient"
      ? gate.hold
      : null;

  return {
    canApprove: gate.canApprove,
    canReject: gate.canReject,
    hold,
    daysToWindowClose: gate.daysToWindowClose,
  };
}
