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
  MutationStatus,
  ServiceApplication,
  ServiceApplicationEvent,
  ServiceType,
  FieldReport,
  FieldSurveySession,
  Hearing,
  AuditEvent,
  Role,
  DocumentType,
  VerificationStatus,
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

export interface LandRecordOwner {
  id: ID;
  name: string;
  /** Masked identifier only; the API never exposes a raw national ID. */
  referenceId?: string;
  address?: string;
}

export interface LandRecordJurisdiction {
  id: ID;
  code: string;
  name: string;
  nameBn?: string;
  level: "division" | "district" | "upazila" | "mouza";
}

export interface LandRecordDocumentSummary {
  id: ID;
  fileName: string;
  type: DocumentType;
  verificationStatus: VerificationStatus;
}

export interface LandRecordMutationSummary {
  mutation: Mutation;
  applicantName?: string;
  responsibleOfficerName?: string;
}

export interface LandRecordOwnershipEvent extends OwnershipRecord {
  mutation?: Pick<Mutation, "id" | "mutationNumber" | "status" | "type">;
  document?: LandRecordDocumentSummary;
}

/**
 * Land Office-only aggregate assembled from persisted parcel, mutation,
 * ownership, document, dispute, jurisdiction, and audit relationships.
 */
export interface LandRecordDetail {
  parcel: Parcel;
  owner: LandRecordOwner;
  /** Root-to-leaf administrative path ending at the parcel's jurisdiction. */
  jurisdiction: LandRecordJurisdiction[];
  ownership: LandRecordOwnershipEvent[];
  mutations: LandRecordMutationSummary[];
  disputes: Dispute[];
  documents: LandDocument[];
  restrictions: ParcelRestriction[];
  audit: AuditEvent[];
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
  /** Restrictions currently in force on the parcel — what execute() may lift. */
  activeRestrictions: ParcelRestriction[];
}

export interface MutationActorSummary {
  id: ID;
  name: string;
  title?: string;
}

export interface MutationJurisdictionSummary {
  id: ID;
  code: string;
  name: string;
  nameBn?: string;
}

export type MutationObjectionSummaryStatus =
  | "not-started"
  | "window-open"
  | "unresolved"
  | "clear";

export interface MutationObjectionSummary {
  total: number;
  unresolved: number;
  status: MutationObjectionSummaryStatus;
}

export interface MutationTimelineEvent {
  id: ID;
  action: string;
  at: ISODateString;
  actorName: string;
  actorRole?: string;
  previousStatus?: MutationStatus;
  newStatus?: MutationStatus;
  note?: string;
}

export interface MutationDetail {
  mutation: Mutation;
  /** Linked mediator case, when the field investigation found a dispute. */
  dispute: Dispute | null;
  fieldReport: FieldReport | null;
  parcel: Parcel | null;
  documents: LandDocument[];
  applicant: MutationActorSummary | null;
  assignedOfficer: MutationActorSummary | null;
  verificationStartedBy: MutationActorSummary | null;
  verifiedBy: MutationActorSummary | null;
  jurisdiction: MutationJurisdictionSummary | null;
  objectionSummary: MutationObjectionSummary;
  timeline: MutationTimelineEvent[];
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

export type LandTaxCollectionStatus = "due" | "paid" | "exempt";

export interface LandTaxPaymentRecord {
  id: ID;
  applicationNo: string;
  parcelId: ID;
  dagNo: string;
  khatianNo: string;
  ownerId: ID;
  ownerName: string;
  assessmentYear: number;
  amount: number;
  paymentMethod: string;
  transactionId: string;
  paidAt: ISODateString;
}

export interface LandTaxCollectionHolding extends LandTaxHolding {
  ownerId: ID;
  ownerName: string;
  status: LandTaxCollectionStatus;
  latestPayment: LandTaxPaymentRecord | null;
  hasActiveRevenueCase: boolean;
}

export interface LandTaxCollection {
  assessmentYear: number;
  summary: {
    holdingCount: number;
    paidCount: number;
    dueCount: number;
    exemptCount: number;
    assessed: number;
    collected: number;
    outstanding: number;
  };
  holdings: LandTaxCollectionHolding[];
  payments: LandTaxPaymentRecord[];
}

/**
 * What an administrator needs on arrival: what is waiting on somebody,
 * who can get in, and how the ledger is growing.
 *
 * Counts rather than queues — an administrator governs the system, they do
 * not work its cases, so each number is a door into the screen that does.
 * Chain verification is deliberately absent: it walks every event, and a
 * dashboard should not do that on every load. The audit screen has the
 * button.
 */
export interface AdminDashboard {
  queues: {
    serviceApplications: number;
    mutations: number;
    disputes: number;
    hearings: number;
    fieldReports: number;
    documentsToVerify: number;
  };
  accounts: {
    total: number;
    active: number;
    suspended: number;
    invited: number;
    byRole: Record<Role, number>;
  };
  ledger: {
    events: number;
    lastAt?: ISODateString;
  };
  jurisdictionCount: number;
  /** The last handful of ledger entries, so the page shows events and not only totals. */
  recentAudit: AuditEvent[];
}

export interface LandOfficerDashboard {
  officer: {
    id: ID;
    name: string;
    title?: string;
    jurisdictionId: ID;
    jurisdictionName: string;
  };
  summary: {
    recordCount: number;
    activeMutationCount: number;
    primaryVerificationCount: number;
    openDisputeCount: number;
    documentsToReviewCount: number;
    fraudFlagCount: number;
    needsAgentCount: number;
    activeFieldVisitCount: number;
    openServiceCount: number;
  };
  queues: {
    mutations: Mutation[];
    disputes: Dispute[];
    documents: LandDocument[];
    fieldReports: FieldReport[];
  };
  serviceCounts: Partial<Record<ServiceType, number>>;
  recentActivity: AuditEvent[];
}

export interface ServiceApplicationDetail {
  application: ServiceApplication;
  timeline: ServiceApplicationEvent[];
  parcel: Parcel | null;
}

export interface FieldReportDetail {
  report: FieldReport;
  parcel: Parcel | null;
  survey: FieldSurveySession | null;
}

export interface HearingDetail {
  hearing: Hearing;
  dispute: Dispute | null;
}
