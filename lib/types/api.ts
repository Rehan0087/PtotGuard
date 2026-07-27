/**
 * Composite response shapes for detail/aggregate endpoints.
 * Kept alongside the domain model so mocks, hooks, and the real API agree.
 */
import type {
  Parcel,
  OwnershipRecord,
  LandDocument,
  Dispute,
  DisputeEvent,
  Mutation,
  FieldReport,
  Hearing,
} from ".";

export interface ParcelDetail {
  parcel: Parcel;
  ownership: OwnershipRecord[];
  documents: LandDocument[];
  disputes: Dispute[];
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
