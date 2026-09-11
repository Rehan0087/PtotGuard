/**
 * Decision rules for a namjari (mutation). Pure — the backend enforces the
 * same gate server-side, so this is a shared-package candidate alongside
 * lib/inheritance.ts. The UI uses it to explain a hold, never as the only
 * thing standing between a request and an approval.
 */
import type {
  AcquisitionType,
  ID,
  Mutation,
  MutationObjection,
  MutationStatus,
  MutationType,
  MutationVerificationChecklist,
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
];

const ACTIVE_STATUSES: MutationStatus[] = [
  "submitted",
  "verification",
  "objection-period",
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

export function mutationActionGate(
  mutation: Mutation,
  actorId: ID,
  now: Date = new Date(),
): MutationActionGate {
  if (mutation.status === "approved" || mutation.status === "rejected") {
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
  const canCompleteVerification = mutation.status === "verification";
  const canReject = ACTIVE_STATUSES.includes(mutation.status);

  if (mutation.status !== "objection-period") {
    return {
      canStartVerification,
      canCompleteVerification,
      canApprove: false,
      canReject,
      hold: { code: "wrong-status", expected: ["objection-period"] },
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

  const objections = unresolvedObjections(mutation);

  // A standing objection outranks the clock: it has to be settled before the
  // record moves, even once the window has closed.
  if (objections.length > 0) {
    return {
      canStartVerification,
      canCompleteVerification,
      canApprove: false,
      canReject,
      hold: { code: "objections", count: objections.length },
      daysToWindowClose: remainingDays,
    };
  }

  if (remainingDays !== null) {
    return {
      canStartVerification,
      canCompleteVerification,
      canApprove: false,
      canReject,
      hold: { code: "objection-window", days: remainingDays },
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
