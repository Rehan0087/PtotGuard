import type { ID, ISODateString } from "./common";

export type FieldSurveyStatus =
  | "not-started"
  | "in-progress"
  | "completed"
  | "failed"
  | "cancelled";

/** A time-bounded field verification performed for one assigned report. */
export interface FieldSurveySession {
  id: ID;
  fieldReportId: ID;
  /** The parcel ULPIN used as BhumiID when one was available at start time. */
  bhumiId?: string;
  assignedAgentId: ID;
  status: Exclude<FieldSurveyStatus, "not-started">;
  startedAt: ISODateString;
  completedAt?: ISODateString;
}
