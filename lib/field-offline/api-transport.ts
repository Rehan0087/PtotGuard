import { api } from "@/lib/api-client";
import type { FieldSyncAcknowledgement, FieldSyncOperation, LocalGpsPoint } from "./types";

function gpsPayload(point: LocalGpsPoint) {
  return {
    id: point.id,
    sequence: point.sequence,
    latitude: point.latitude,
    longitude: point.longitude,
    recordedAt: point.recordedAt,
    accuracyMeters: point.accuracyMeters,
    ...(point.altitudeMeters === undefined ? {} : { altitudeMeters: point.altitudeMeters }),
    ...(point.speedMetersPerSecond === undefined
      ? {}
      : { speedMetersPerSecond: point.speedMetersPerSecond }),
    ...(point.headingDegrees === undefined ? {} : { headingDegrees: point.headingDegrees }),
  };
}

export async function sendFieldSyncOperation(
  operation: FieldSyncOperation,
): Promise<FieldSyncAcknowledgement> {
  const base = `/field-reports/${encodeURIComponent(operation.entity_id)}/survey`;
  switch (operation.operation_type) {
    case "START_SURVEY":
      return api.postIdempotent<FieldSyncAcknowledgement>(
        `${base}/start`,
        operation.local_id,
        operation.payload,
      );
    case "APPEND_POINTS":
      return api.postIdempotent<FieldSyncAcknowledgement>(
        `${base}/points`,
        operation.local_id,
        {
          points: (operation.payload.points as LocalGpsPoint[]).map(gpsPayload),
        },
      );
    case "COMPLETE_SURVEY":
      return api.postIdempotent<FieldSyncAcknowledgement>(
        `${base}/complete`,
        operation.local_id,
        operation.payload,
      );
  }
}
