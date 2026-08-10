/**
 * Composite response shapes for detail/aggregate endpoints.
 * Kept alongside the domain model so mocks, hooks, and the real API agree.
 */
import type {
  ID,
  Parcel,
  OwnershipRecord,
  ParcelRestriction,
  RestrictionType,
  LandUse,
  RegistryStatus,
  Area,
  ISODateString,
  LandDocument,
  Dispute,
  DisputeEvent,
  Mutation,
  ServiceApplication,
  ServiceApplicationEvent,
  FieldReport,
  Hearing,
} from ".";
// Derived shapes rather than stored ones, so they come from the rules that
// compute them, not from the domain model.
import type { TransferReview } from "../restrictions";
import type { LandTaxAssessment } from "../land-tax";

export interface ParcelDetail {
  parcel: Parcel;
  ownership: OwnershipRecord[];
  documents: LandDocument[];
  disputes: Dispute[];
  restrictions: ParcelRestriction[];
  /** Whether the land may change hands — decided server-side, see transferReview(). */
  transfer: TransferReview;
}

/**
 * What an unauthenticated caller may see about a plot.
 *
 * A separate shape, not a filtered `Parcel`. The full record is never sent and
 * hidden in the browser — anything omitted here is omitted from the response,
 * so the boundary holds against anyone reading the network tab.
 *
 * Deliberately absent: market value, centroid and boundary geometry, owner id,
 * documents, disputes, and the chain of title. Present because a land registry
 * is a public record and the spec asks for it: who it is recorded to, how big
 * it is, and what encumbers it.
 */
export interface PublicRestriction {
  type: RestrictionType;
  /** The court, bank, or office — a matter of public record. */
  authority: string;
  /** Case or memo number, citable and public. */
  referenceNo?: string;
  fromDate: ISODateString;
  toDate: ISODateString | null;
}

export interface PublicParcelView {
  ulpin: string;
  dagNo: string;
  khatianNo: string;
  landUse: LandUse;
  area: Area;
  /** Recorded owner's name. No id — that would link records across the system. */
  ownerName: string;
  registryStatus: RegistryStatus;
  /**
   * Restrictions without their free-text note: a note can carry allegations
   * and case particulars that the bare existence of the restriction does not.
   */
  restrictions: PublicRestriction[];
  /** The headline answer someone doing due diligence actually wants. */
  canTransfer: boolean;
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

/**
 * One holding on the citizen's land-tax screen, with its bill already worked
 * out. The assessment is computed server-side and sent whole — the browser
 * displays what is owed, it does not decide it.
 */
export interface LandTaxHolding {
  parcelId: ID;
  ulpin: string | null;
  dagNo: string;
  khatianNo: string;
  title: string;
  landUse: LandUse;
  area: Area;
  assessmentYear: number;
  paidThroughYear: number | null;
  assessment: LandTaxAssessment;
}

export interface ServiceApplicationDetail {
  application: ServiceApplication;
  timeline: ServiceApplicationEvent[];
  parcel: Parcel | null;
}

export interface FieldReportDetail {
  report: FieldReport;
  parcel: Parcel | null;
}

export interface HearingDetail {
  hearing: Hearing;
  dispute: Dispute | null;
}
