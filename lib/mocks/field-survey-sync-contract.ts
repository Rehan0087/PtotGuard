import { annotateGpsPoints, gpsPointErrors } from "@plotguard/rules";
import type { FieldSurveyGpsPoint, GpsPointInput } from "@/lib/types";

export interface MockSyncReceipt {
  key: string;
  actorId: string;
  fieldReportId: string;
  operationType: string;
  canonicalPayload: string;
  response: unknown;
}

export class MockSyncConflict extends Error {
  readonly code: "idempotency-key-reused" | "gps-point-conflict" | "gps-sequence-gap";
  readonly detail?: unknown;

  constructor(
    code: "idempotency-key-reused" | "gps-point-conflict" | "gps-sequence-gap",
    detail?: unknown,
  ) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

export class MockSurveyValidationError extends Error {
  readonly blocker: { code: string };

  constructor(blocker: { code: string }) {
    super(blocker.code);
    this.blocker = blocker;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function runMockIdempotent<T>(
  receipts: MockSyncReceipt[],
  operation: Omit<MockSyncReceipt, "canonicalPayload" | "response"> & { payload: unknown },
  run: () => T | Promise<T>,
): Promise<T> {
  const payload = canonical(operation.payload);
  const existing = receipts.find((receipt) => receipt.key === operation.key);
  if (existing) {
    if (
      existing.actorId !== operation.actorId ||
      existing.fieldReportId !== operation.fieldReportId ||
      existing.operationType !== operation.operationType ||
      existing.canonicalPayload !== payload
    ) {
      throw new MockSyncConflict("idempotency-key-reused");
    }
    return structuredClone(existing.response) as T;
  }

  const response = await run();
  receipts.push({
    key: operation.key,
    actorId: operation.actorId,
    fieldReportId: operation.fieldReportId,
    operationType: operation.operationType,
    canonicalPayload: payload,
    response: structuredClone(response),
  });
  return response;
}

function comparable(point: FieldSurveyGpsPoint | GpsPointInput) {
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

export function appendMockGpsPoints(
  stored: FieldSurveyGpsPoint[],
  fieldSurveySessionId: string,
  inputs: readonly GpsPointInput[],
): { points: FieldSurveyGpsPoint[]; acceptedThroughSequence: number } {
  const surveyPoints = stored
    .filter((point) => point.fieldSurveySessionId === fieldSurveySessionId)
    .sort((a, b) => a.sequence - b.sequence);
  const newInputs: GpsPointInput[] = [];
  let nextSequence = (surveyPoints.at(-1)?.sequence ?? 0) + 1;

  for (const input of inputs) {
    if (gpsPointErrors(input).length) throw new TypeError("invalid-gps-point");
    const byId = surveyPoints.find((point) => point.id === input.id);
    const bySequence = surveyPoints.find((point) => point.sequence === input.sequence);
    if (byId || bySequence) {
      const existing = byId ?? bySequence!;
      if (!byId || !bySequence || canonical(comparable(existing)) !== canonical(input)) {
        throw new MockSyncConflict("gps-point-conflict", { localData: input, serverData: existing });
      }
      continue;
    }
    if (input.sequence !== nextSequence) {
      throw new MockSyncConflict("gps-sequence-gap", {
        expectedSequence: nextSequence,
        localData: input,
      });
    }
    newInputs.push(input);
    nextSequence += 1;
  }

  const previous = surveyPoints.at(-1);
  const annotated = annotateGpsPoints(
    [...(previous ? [previous] : []), ...newInputs],
    fieldSurveySessionId,
  ).slice(previous ? 1 : 0);
  stored.push(...annotated);
  const all = [...surveyPoints, ...annotated];
  return {
    points: all.filter((point) => inputs.some((input) => input.id === point.id)),
    acceptedThroughSequence: all.at(-1)?.sequence ?? 0,
  };
}
