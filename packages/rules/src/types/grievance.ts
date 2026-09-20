import type { ID, ISODateString } from "./common";

/**
 * Complaint / Grievance Redressal — citizen complaints against the land office
 * or its staff. Distinct from Dispute (citizen-vs-citizen land conflict).
 *
 * Key routing rule: staff-conduct and corruption complaints bypass the
 * implicated officer's queue and route to a supervisor or admin instead.
 */

export type GrievanceCategory =
  | "technical"
  | "delay"
  | "staff-conduct"
  | "corruption";

export type GrievanceStatus =
  | "submitted"
  | "under-review"
  | "investigating"
  | "resolved"
  | "dismissed"
  | "escalated";

export type GrievanceEventType =
  | "filed"
  | "assigned"
  | "status-change"
  | "resolved"
  | "dismissed"
  | "escalated"
  | "rated";

export interface GrievanceEvent {
  id: ID;
  grievanceId: ID;
  at: ISODateString;
  type: GrievanceEventType;
  title: string;
  description?: string;
  actorId?: ID;
  actorName?: string;
}

export interface Grievance {
  id: ID;
  caseNumber: string;
  category: GrievanceCategory;
  status: GrievanceStatus;
  description: string;
  filedById: ID;
  filedByName: string;
  /** Set to null for staff-conduct/corruption so the accused officer's queue is bypassed. */
  assignedOfficerId?: ID;
  /** For conduct/corruption: routed to the supervisor instead. */
  escalatedToId?: ID;
  resolutionNote?: string;
  /** 1-5 citizen satisfaction rating, filled when status = "resolved" or "dismissed". */
  satisfactionRating?: number;
  slaDeadline?: ISODateString;
  escalatedAt?: ISODateString;
  resolvedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface GrievanceDetail {
  grievance: Grievance;
  timeline: GrievanceEvent[];
}
