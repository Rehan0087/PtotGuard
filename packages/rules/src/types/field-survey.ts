import type { ID, ISODateString } from "./common";

export type FieldSurveyStatus =
  | "not-started"
  | "in-progress"
  | "completed"
  | "failed"
  | "cancelled";

export type GpsPointIssue =
  | "poor-accuracy"
  | "very-poor-accuracy"
  | "unrealistic-jump"
  | "non-increasing-time";

export interface GpsPointInput {
  id: ID;
  sequence: number;
  latitude: number;
  longitude: number;
  recordedAt: ISODateString;
  accuracyMeters: number;
  altitudeMeters?: number;
  speedMetersPerSecond?: number;
  headingDegrees?: number;
}

export interface FieldSurveyGpsPoint extends GpsPointInput {
  fieldSurveySessionId: ID;
  receivedAt: ISODateString;
  issues: GpsPointIssue[];
}

export interface FieldSurveySummary {
  totalPoints: number;
  startedAt: ISODateString;
  endedAt: ISODateString;
  pathLengthMeters: number;
  pathLengthReliable: boolean;
  areaSquareMeters?: number;
  accuracy?: { min: number; max: number; mean: number; p95: number };
  geometry: "valid" | "open" | "insufficient-points" | "invalid";
  confidence: "high" | "low" | "invalid";
  issueCounts: Record<GpsPointIssue, number>;
}

/** A time-bounded field verification performed for one assigned report. */
export interface FieldSurveySession {
  id: ID;
  localSessionId?: ID;
  fieldReportId: ID;
  /** The parcel ULPIN used as BhumiID when one was available at start time. */
  bhumiId?: string;
  assignedAgentId: ID;
  status: Exclude<FieldSurveyStatus, "not-started">;
  version: number;
  startedAt: ISODateString;
  completedAt?: ISODateString;
  points: FieldSurveyGpsPoint[];
  summary?: FieldSurveySummary;
}
