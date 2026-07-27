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
  objectionWindowEndsAt?: ISODateString;
  decidedAt?: ISODateString;
}
