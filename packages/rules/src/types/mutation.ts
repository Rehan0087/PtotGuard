import type { ID, ISODateString, Money } from "./common";

export type MutationType =
  | "sale"
  | "inheritance"
  | "gift"
  | "partition"
  | "correction";

export type MutationStatus =
  | "submitted"
  | "verification"
  | "objection-period"
  | "approved"
  | "rejected";

export interface MutationVerificationChecklist {
  applicantVerified: boolean;
  previousOwnerVerified: boolean;
  proposedOwnerVerified: boolean;
  dagKhatianVerified: boolean;
  deedVerified: boolean;
  landRecordMatched: boolean;
  documentsPresent: boolean;
}

export type MutationObjectionStatus = "open" | "resolved";

export interface MutationObjection {
  id: ID;
  by: string;
  at: ISODateString;
  reason: string;
  status?: MutationObjectionStatus;
  resolvedAt?: ISODateString;
  resolvedById?: ID;
  resolutionNote?: string;
}

/** How the filing fee was paid. Simulated — see PaymentMethod's own note. */
export type PaymentMethod = "bkash" | "nagad" | "card";

/** A request to change the recorded owner of a parcel. */
export interface Mutation {
  id: ID;
  /** e.g. "MUT-2026-01192". */
  mutationNumber: string;
  parcelId: ID;
  parcelDagNo: string;
  type: MutationType;
  status: MutationStatus;
  fromOwnerName: string;
  /** The owner ID recorded when the mutation was filed, used to detect stale ownership. */
  fromOwnerId?: ID;
  /**
   * The registered account the parcel moves to once approved. Every
   * mutation filed since ownership transfer went live has one; absent only
   * on a handful of rows that predate the requirement — approvalGate()
   * refuses to approve those rather than guessing a recipient.
   */
  toOwnerId?: ID;
  toOwnerName: string;
  requestedById: ID;
  requestedAt: ISODateString;
  assignedOfficerId?: ID;
  documentIds: ID[];
  objections: MutationObjection[];
  fee?: Money;
  /**
   * Simulated payment: no gateway is called, but a method and a generated
   * reference are recorded, the same way the OCR pipeline is stood in for
   * elsewhere in this codebase. Present once the fee step of filing is done.
   */
  paymentMethod?: PaymentMethod;
  transactionId?: string;
  /** The deed (dolil) the transfer rests on — a sale needs one, a court-order type may not. */
  deedNumber?: string;
  deedDate?: ISODateString;
  verificationStartedAt?: ISODateString;
  verificationStartedById?: ID;
  verifiedAt?: ISODateString;
  verifiedById?: ID;
  verificationNotes?: string;
  verificationChecklist?: MutationVerificationChecklist;
  objectionStartDate?: ISODateString;
  objectionWindowEndsAt?: ISODateString;
  approvedAt?: ISODateString;
  approvedById?: ID;
  approvalNote?: string;
  rejectedAt?: ISODateString;
  rejectedById?: ID;
  rejectionReason?: string;
  decidedAt?: ISODateString;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
}
