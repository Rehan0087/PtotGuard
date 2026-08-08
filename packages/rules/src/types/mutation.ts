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

export interface MutationObjection {
  id: ID;
  by: string;
  at: ISODateString;
  reason: string;
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
  objectionWindowEndsAt?: ISODateString;
  decidedAt?: ISODateString;
}
