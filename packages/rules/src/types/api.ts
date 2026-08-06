/**
 * Composite response shapes for detail/aggregate endpoints.
 * Kept alongside the domain model so mocks, hooks, and the real API agree.
 */
import type {
  Parcel,
  OwnershipRecord,
  ParcelRestriction,
  LandDocument,
  Dispute,
  DisputeEvent,
  Mutation,
  FieldReport,
  Hearing,
} from ".";
// A derived shape rather than a stored one, so it comes from the rule that
// computes it, not from the domain model.
import type { TransferReview } from "../restrictions";

export interface ParcelDetail {
  parcel: Parcel;
  ownership: OwnershipRecord[];
  documents: LandDocument[];
  disputes: Dispute[];
  restrictions: ParcelRestriction[];
  /** Whether the land may change hands — decided server-side, see transferReview(). */
  transfer: TransferReview;
}

export interface DisputeDetail {
  dispute: Dispute;
  timeline: DisputeEvent[];
  parcel: Parcel | null;
  evidence: LandDocument[];
}

export interface MutationDetail {
  mutation: Mutation;
  parcel: Parcel | null;
  documents: LandDocument[];
}

export interface FieldReportDetail {
  report: FieldReport;
  parcel: Parcel | null;
}

export interface HearingDetail {
  hearing: Hearing;
  dispute: Dispute | null;
}
