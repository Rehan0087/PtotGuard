import type { ID, ISODateString } from "./common";

export type HearingStatus =
  | "scheduled"
  | "in-hearing"
  | "deliberation"
  | "ruled"
  | "appealed";

export interface HearingSession {
  id: ID;
  at: ISODateString;
  summary: string;
  attendees: string[];
}

/** A hearing/mediation process attached to a dispute, run by a mediator. */
export interface Hearing {
  id: ID;
  caseNumber: string;
  disputeId: ID;
  parcelDagNo: string;
  mediatorId: ID;
  status: HearingStatus;
  parties: string[];
  hearingDate?: ISODateString;
  sessions: HearingSession[];
  ruling?: string;
  ruledAt?: ISODateString;
}
