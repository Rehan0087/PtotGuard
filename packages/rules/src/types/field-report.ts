import type { ID, ISODateString, GeoPoint } from "./common";

export type FieldReportPurpose =
  | "boundary-survey"
  | "encroachment-check"
  | "possession-verify"
  | "measurement";

export type FieldReportStatus =
  | "assigned"
  | "en-route"
  | "in-progress"
  | "completed"
  | "cancelled";

export interface GpsCapture {
  id: ID;
  point: GeoPoint;
  accuracyMeters: number;
  capturedAt: ISODateString;
  /** e.g. "NE corner", "disputed boundary pillar". */
  label?: string;
}

export interface FieldPhoto {
  id: ID;
  url: string;
  caption?: string;
  point?: GeoPoint;
  capturedAt: ISODateString;
}

/** A survey carried out on the ground by a field agent (amin/surveyor). */
export interface FieldReport {
  id: ID;
  parcelId: ID;
  parcelDagNo: string;
  disputeId?: ID;
  mutationId?: ID;
  purpose: FieldReportPurpose;
  status: FieldReportStatus;
  assignedAgentId: ID;
  scheduledFor: ISODateString;
  addressHint?: string;
  gpsCaptures: GpsCapture[];
  photos: FieldPhoto[];
  notes?: string;
  submittedAt?: ISODateString;
}
