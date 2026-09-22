import type { ID, ISODateString } from "./common";

/**
 * The land services built on this shared model (Land Development Tax,
 * Acquisition & Requisition, Lease & Settlement, Land Administration,
 * Revenue Cases, Land Information Bank, Appointment Booking). Mutation
 * (e-Namjari) is not here — it was already built end-to-end before this
 * model existed and keeps its own table; see Mutation.
 */
export type ServiceType =
  | "land-tax"
  | "acquisition"
  | "lease-settlement"
  | "land-admin"
  | "revenue-case"
  | "info-bank-request"
  | "appointment";

export type ServiceApplicationStatus =
  | "draft"
  | "submitted"
  | "payment-pending"
  | "under-review"
  | "field-investigation"
  | "hearing-scheduled"
  | "approved"
  | "rejected"
  | "withdrawn";

export type ServiceApplicationEventType =
  | "created"
  | "submitted"
  | "payment-recorded"
  | "status-change"
  | "document-added"
  | "decided";

/** How the fee was paid. Simulated — see Mutation.paymentMethod's own note. */
export type ServiceApplicationPaymentMethod = "bkash" | "nagad" | "card";

/** One entry in an application's tracking timeline — same shape as DisputeEvent. */
export interface ServiceApplicationEvent {
  id: ID;
  applicationId: ID;
  at: ISODateString;
  type: ServiceApplicationEventType;
  title: string;
  description?: string;
  actorId?: ID;
  actorName?: string;
}

/**
 * The shared shape behind the six services above — apply → pay → track →
 * decide is the same workflow for all of them; `details` is the one place
 * each service's own fields live (holding number and arrears for a tax
 * assessment, case number and award amount for an acquisition, and so on),
 * read and written as a unit by that service's own screen and never queried
 * across services.
 */
export interface ServiceApplication {
  id: ID;
  /** e.g. "LDT-2026-004821" — the prefix names the service. */
  applicationNo: string;
  serviceType: ServiceType;
  status: ServiceApplicationStatus;
  /** Not every service is parcel-bound (e.g. an information-bank browse request). */
  parcelId?: ID;
  applicantId: ID;
  assignedOfficerId?: ID;
  details: Record<string, unknown>;
  documentIds: ID[];
  /** BDT, no paisa — same convention as Policy.mutationFeeBdt. */
  feeAmount?: number;
  paymentMethod?: ServiceApplicationPaymentMethod;
  transactionId?: string;
  paidAt?: ISODateString;
  submittedAt?: ISODateString;
  decidedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type AcquisitionStage =
  | "field-review"
  | "citizen-decision"
  | "appeal-review"
  | "completed"
  | "withdrawn";

export type AcquisitionAppealOutcome = "withdraw" | "increase-compensation";
export type AcquisitionAppealDecision = "withdraw" | "increase-compensation" | "proceed";

/** Typed contents of ServiceApplication.details for an acquisition case. */
export interface AcquisitionDetails extends Record<string, unknown> {
  stage: AcquisitionStage;
  purpose: string;
  createdByOfficerId: ID;
  assignedFieldAgentId: ID;
  fieldReview?: {
    reviewedAt: ISODateString;
    reviewedById: ID;
    notes: string;
  };
  awardAmount?: number;
  appeal?: {
    outcome: AcquisitionAppealOutcome;
    reason: string;
    requestedAmount?: number;
    filedAt: ISODateString;
  };
  appealDecision?: {
    decision: AcquisitionAppealDecision;
    note?: string;
    decidedAt: ISODateString;
    decidedById: ID;
  };
  completedAt?: ISODateString;
}

export interface LeaseSettlementDetails extends Record<string, unknown> {
  landUse: string;
  locationDescription: string;
  areaDecimals: number;
  termYears: number;
  purpose: string;
  leaseFeeAmount?: number;
  leaseFeePaidAt?: ISODateString;
  leaseExpiresAt?: ISODateString;
}
