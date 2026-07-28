import type { ID, ISODateString } from "./common";

export type DisputeType =
  | "boundary"
  | "ownership"
  | "inheritance"
  | "encroachment"
  | "fraud"
  | "easement";

export type DisputeStatus =
  | "submitted"
  | "under-review"
  | "field-visit-scheduled"
  | "in-mediation"
  | "hearing-scheduled"
  | "resolved"
  | "rejected"
  | "withdrawn";

export type Priority = "low" | "medium" | "high";

export interface DisputeParty {
  name: string;
  role: "claimant" | "respondent";
  userId?: ID;
}

export type DisputeEventType =
  | "filed"
  | "assigned"
  | "status-change"
  | "comment"
  | "field-visit"
  | "document-added"
  | "hearing"
  | "resolved";

/**
 * The structured form of a timeline entry's headline — see NotificationContent
 * for the pattern. Only the *headline* is systemic; `description` stays as the
 * clerk or the system recorded it, because a case note is record content, not
 * chrome, and rewriting it per reader would misrepresent the file.
 */
export type DisputeEventContent =
  | { code: "filed" }
  | { code: "assigned"; to: string }
  | { code: "evidence-added" }
  | { code: "status-change"; status: DisputeStatus }
  | { code: "hearing-held"; ordinal: number }
  | { code: "field-visit-scheduled" }
  | { code: "field-visit-completed" }
  | { code: "ruled" };

/** One entry in a dispute's tracking timeline. */
export interface DisputeEvent {
  id: ID;
  disputeId: ID;
  at: ISODateString;
  type: DisputeEventType;
  title: string;
  /** Preferred over `title` when present. See DisputeEventContent. */
  content?: DisputeEventContent;
  description?: string;
  actorId?: ID;
  actorName?: string;
}

export interface Dispute {
  id: ID;
  /** e.g. "DSP-2026-00417". */
  caseNumber: string;
  parcelId: ID;
  parcelDagNo: string;
  type: DisputeType;
  status: DisputeStatus;
  priority: Priority;
  filedById: ID;
  filedByName: string;
  filedAt: ISODateString;
  description: string;
  parties: DisputeParty[];
  assignedOfficerId?: ID;
  assignedAgentId?: ID;
  assignedMediatorId?: ID;
  evidenceDocumentIds: ID[];
  hearingDate?: ISODateString;
  resolution?: string;
  updatedAt: ISODateString;
}
