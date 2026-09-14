import type { FieldReport, GpsPointInput, Parcel } from "@/lib/types";

export type FieldSyncStatus = "PENDING" | "UPLOADING" | "SYNCED" | "FAILED" | "CONFLICT";
export type FieldSyncOperationType = "START_SURVEY" | "APPEND_POINTS" | "COMPLETE_SURVEY";

export interface OfflineFieldSurvey {
  key: string;
  fieldReportId: string;
  assignedAgentId: string;
  localSessionId: string;
  serverSessionId?: string;
  serverVersion: number;
  state: "active" | "paused" | "completed";
  syncStatus: FieldSyncStatus;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
  reportSnapshot?: FieldReport;
  parcelSnapshot?: Parcel;
  notes?: string;
}

export interface LocalGpsPoint extends GpsPointInput {
  surveyKey: string;
  fieldReportId: string;
  localSessionId: string;
}

export interface FieldSyncOperation {
  local_id: string;
  operation_type: FieldSyncOperationType;
  entity_type: "field-survey";
  entity_id: string;
  survey_key: string;
  assigned_agent_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  sync_status: FieldSyncStatus;
  retry_count: number;
  last_error?: string;
  next_attempt_at?: string;
  conflict?: { localData: unknown; serverData: unknown };
  response?: unknown;
}

export interface FieldSyncAcknowledgement {
  sessionId?: string;
  version?: number;
  report?: { status?: string };
  survey?: { id?: string; version?: number; status?: string };
}
