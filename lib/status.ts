/**
 * Maps every domain status enum to a presentation tone. The tone selects
 * StatusBadge colors (see components/status-badge.tsx and the --color-{tone}
 * tokens in globals.css).
 *
 * Tone only — the human label lives in the dictionaries, keyed by the same enum
 * value (`t.status.dispute["under-review"]`). `useStatusMeta()` in
 * lib/i18n/status.ts pairs the two into the `{ tone, label }` a badge takes.
 */
import type {
  StatusTone,
  RegistryStatus,
  DisputeStatus,
  Priority,
  MutationStatus,
  OcrStatus,
  VerificationStatus,
  FieldReportStatus,
  HearingStatus,
  UserStatus,
} from "@/lib/types";

export interface StatusMeta {
  tone: StatusTone;
  label: string;
}

export const registryStatusTone: Record<RegistryStatus, StatusTone> = {
  verified: "verified",
  pending: "pending",
  disputed: "disputed",
  flagged: "flagged",
  "under-mutation": "review",
};

export const disputeStatusTone: Record<DisputeStatus, StatusTone> = {
  submitted: "pending",
  "under-review": "review",
  "field-visit-scheduled": "review",
  "in-mediation": "disputed",
  "hearing-scheduled": "disputed",
  resolved: "verified",
  rejected: "flagged",
  withdrawn: "draft",
};

export const priorityTone: Record<Priority, StatusTone> = {
  low: "neutral",
  medium: "pending",
  high: "flagged",
};

export const mutationStatusTone: Record<MutationStatus, StatusTone> = {
  submitted: "pending",
  verification: "review",
  "objection-period": "disputed",
  approved: "verified",
  rejected: "flagged",
};

export const ocrStatusTone: Record<OcrStatus, StatusTone> = {
  pending: "draft",
  processing: "pending",
  extracted: "verified",
  failed: "flagged",
};

export const verificationStatusTone: Record<VerificationStatus, StatusTone> = {
  unverified: "draft",
  verified: "verified",
  flagged: "flagged",
  rejected: "flagged",
};

export const fieldReportStatusTone: Record<FieldReportStatus, StatusTone> = {
  assigned: "pending",
  "en-route": "review",
  "in-progress": "review",
  completed: "verified",
  cancelled: "draft",
};

export const hearingStatusTone: Record<HearingStatus, StatusTone> = {
  scheduled: "pending",
  "in-hearing": "disputed",
  deliberation: "review",
  ruled: "verified",
  appealed: "flagged",
};

export const userStatusTone: Record<UserStatus, StatusTone> = {
  active: "verified",
  suspended: "flagged",
  invited: "pending",
};
